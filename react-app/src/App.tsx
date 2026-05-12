import { useState, useCallback, useEffect, useRef } from 'react';
import type { Filters, Campaign, BreakdownRow } from './types';
import { runSQL, buildWhereClause, buildBreakdownQuery, aiComplete } from './hooks/api';
import NavSidebar from './components/NavSidebar';
import AudiencePage from './components/AudiencePage';
import CampaignsPage from './components/CampaignsPage';
import OffersPage from './components/OffersPage';
import MetricsBar from './components/MetricsBar';
import Sidebar from './components/Sidebar';

const ALL_STATES = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'];

const SEED_CAMPAIGNS: Campaign[] = [
  {
    id: 'camp-001', name: 'Back to School Blitz', status: 'Active', channel: 'Email',
    audience: 'Parents VIC/NSW Age 30-50', audienceSize: 18500,
    sent: 18500, opened: 7200, clicked: 2800, converted: 420,
    startDate: '2026-01-15', endDate: '2026-03-15', budget: 25000, spent: 18200,
    destination: 'Braze',
  },
  {
    id: 'camp-002', name: 'Abandoned Cart Recovery', status: 'Active', channel: 'Email + SMS',
    audience: 'Abandoned Cart $50+ NSW/VIC', audienceSize: 8200,
    sent: 8200, opened: 4100, clicked: 2300, converted: 680,
    startDate: '2026-02-01', endDate: '2026-04-01', budget: 12000, spent: 7800,
    destination: 'Braze',
  },
  {
    id: 'camp-003', name: 'Tech Tuesday Promo', status: 'Completed', channel: 'Email',
    audience: 'Tech Buyers 25-45 All States', audienceSize: 22000,
    sent: 22000, opened: 9800, clicked: 4100, converted: 890,
    startDate: '2026-01-05', endDate: '2026-02-10', budget: 15000, spent: 14800,
    destination: 'Hightouch',
  },
  {
    id: 'camp-004', name: 'Print & Copy Win-back', status: 'Paused', channel: 'SMS',
    audience: 'Lapsed Print Customers QLD/WA', audienceSize: 12000,
    sent: 8000, opened: 3500, clicked: 1200, converted: 280,
    startDate: '2026-02-01', endDate: '2026-04-01', budget: 20000, spent: 9500,
    destination: 'Braze',
  },
  {
    id: 'camp-005', name: 'EOFY Clearance Push', status: 'Draft', channel: 'Email',
    audience: 'High Spenders $200+ All States', audienceSize: 31000,
    sent: 0, opened: 0, clicked: 0, converted: 0,
    startDate: '2026-04-01', endDate: '2026-06-30', budget: 30000, spent: 0,
  },
  {
    id: 'camp-006', name: 'Business Rewards Upsell', status: 'Activated', channel: 'Email + SMS',
    audience: 'Business Customers $500+', audienceSize: 8900,
    sent: 0, opened: 0, clicked: 0, converted: 0,
    startDate: '2026-03-20', endDate: '2026-05-20', budget: 12000, spent: 0,
    destination: 'Hightouch',
  },
];

const DEFAULT_FILTERS: Filters = {
  retailer: 'All',
  ageRange: [1, 100],
  states: [],
  hasEmail: false,
  hasPhone: false,
  minSpend: 0,
  recencyDays: 730,
  abandonedCart: false,
};

export default function App() {
  const [page, setPage] = useState<'audience' | 'campaigns' | 'offers'>('audience');
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [syncedFromAgent, setSyncedFromAgent] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>(SEED_CAMPAIGNS);

  const [audienceSize, setAudienceSize] = useState(0);
  const [totalBase, setTotalBase] = useState(200000);
  const [reachable, setReachable] = useState(0);
  const [stateData, setStateData] = useState<BreakdownRow[]>([]);
  const [ageData, setAgeData] = useState<BreakdownRow[]>([]);
  const [execSummary, setExecSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshData = useCallback(async (f: Filters) => {
    setLoading(true);
    setError('');
    try {
      const { fullQuery } = buildWhereClause(f, ALL_STATES);
      const countRows = await runSQL(fullQuery);
      const cnt = Number(countRows?.[0]?.CNT ?? countRows?.[0]?.cnt ?? 0);
      setAudienceSize(cnt);

      const reachableQ = f.hasEmail || f.hasPhone
        ? cnt
        : Math.round(cnt * 0.92);
      setReachable(reachableQ);

      const stateQ = buildBreakdownQuery(f, ALL_STATES, 'STATE_CODE');
      const stateRows = await runSQL(stateQ);
      setStateData(
        stateRows.map((r: Record<string, unknown>) => ({
          label: String(r.LABEL ?? r.label ?? ''),
          count: Number(r.COUNT ?? r.count ?? 0),
        }))
      );

      const ageQ = buildBreakdownQuery(f, ALL_STATES, 'AGE');
      const ageRows = await runSQL(ageQ);
      setAgeData(
        ageRows.map((r: Record<string, unknown>) => ({
          label: String(r.LABEL ?? r.label ?? ''),
          count: Number(r.COUNT ?? r.count ?? 0),
        }))
      );

      if (cnt > 0) {
        const summaryPrompt = `You are an audience analytics assistant for Officeworks (Australian office supplies & tech retailer). Given this audience segment:
- Size: ${cnt.toLocaleString()} customers
- Filters: Age=${f.ageRange[0]}-${f.ageRange[1]}, States=${f.states.length > 0 ? f.states.join(',') : 'All'}, Email=${f.hasEmail}, Phone=${f.hasPhone}, Min Spend=$${f.minSpend}, Recency=${f.recencyDays} days, Abandoned Cart=${f.abandonedCart}
- State distribution: ${stateRows.slice(0, 5).map((r: Record<string, unknown>) => `${r.LABEL ?? r.label}:${r.COUNT ?? r.count}`).join(', ')}

Provide 3-4 concise bullet points with actionable insights for a campaign manager. Focus on segment characteristics, targeting opportunities (e.g. abandoned cart recovery, tech buyers, back-to-school), and potential campaign strategies. Keep each bullet to 1-2 sentences.`;
        try {
          const summary = await aiComplete(summaryPrompt);
          setExecSummary(summary);
        } catch {
          setExecSummary('');
        }
      } else {
        setExecSummary('');
      }
    } catch (err) {
      console.error('refreshData error:', err);
      setError(err instanceof Error ? err.message : 'Failed to refresh data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => refreshData(filters), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [filters, refreshData]);

  useEffect(() => {
    runSQL('SELECT COUNT(*) AS cnt FROM OFFICEWORKS_AUDIENCE.PUBLIC.CUSTOMERS')
      .then((rows) => setTotalBase(Number(rows?.[0]?.CNT ?? rows?.[0]?.cnt ?? 200000)))
      .catch(() => {});
  }, []);

  const pctOfBase = totalBase > 0 ? ((audienceSize / totalBase) * 100).toFixed(1) : '0';

  const addCampaign = useCallback((campaign: Campaign) => {
    setCampaigns((prev) => [campaign, ...prev]);
    setPage('campaigns');
  }, []);

  const updateCampaign = useCallback((id: string, updates: Partial<Campaign>) => {
    setCampaigns((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
  }, []);

  const buildAudienceLabel = useCallback((f: Filters): string => {
    const parts: string[] = [];
    if (f.ageRange[0] > 1 || f.ageRange[1] < 100) parts.push(`Age ${f.ageRange[0]}-${f.ageRange[1]}`);
    if (f.states.length > 0 && f.states.length <= 3) parts.push(f.states.join('/'));
    if (f.states.length > 3) parts.push(`${f.states.length} states`);
    if (f.hasEmail) parts.push('Email');
    if (f.hasPhone) parts.push('Phone');
    if (f.minSpend > 0) parts.push(`$${f.minSpend}+ spend`);
    if (f.recencyDays < 730) parts.push(`${f.recencyDays}d recency`);
    if (f.abandonedCart) parts.push('Abandoned Cart');
    return parts.length > 0 ? parts.join(' | ') : 'All Customers';
  }, []);

  const handleFilterSync = useCallback((newFilters: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
    setSyncedFromAgent(true);
    setTimeout(() => setSyncedFromAgent(false), 5000);
  }, []);

  return (
    <div className="app-layout">
      <NavSidebar page={page} onNavigate={setPage} />

      <div className={`main-content${showFilters ? ' with-sidebar' : ''}`}>
        {error && (
          <div style={{ background: '#CC0000', color: '#fff', padding: '8px 16px', fontSize: 13 }}>
            Error: {error}
          </div>
        )}
        <MetricsBar
          audienceSize={audienceSize}
          pctOfBase={pctOfBase}
          reachable={reachable}
          loading={loading}
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters(!showFilters)}
        />

        <div className="page-body">
          {page === 'audience' && (
            <AudiencePage
              filters={filters}
              allStates={ALL_STATES}
              audienceSize={audienceSize}
              stateData={stateData}
              ageData={ageData}
              execSummary={execSummary}
              loading={loading}
              onFilterSync={handleFilterSync}
              buildAudienceLabel={buildAudienceLabel}
            />
          )}
          {page === 'campaigns' && (
            <CampaignsPage
              campaigns={campaigns}
              onUpdateCampaign={updateCampaign}
            />
          )}
          {page === 'offers' && (
            <OffersPage
              audienceSize={audienceSize}
              audienceLabel={buildAudienceLabel(filters)}
              onAddCampaign={addCampaign}
            />
          )}
        </div>
      </div>

      {showFilters && (
        <Sidebar
          filters={filters}
          allStates={ALL_STATES}
          syncedFromAgent={syncedFromAgent}
          onFiltersChange={setFilters}
          onClose={() => setShowFilters(false)}
        />
      )}
    </div>
  );
}
