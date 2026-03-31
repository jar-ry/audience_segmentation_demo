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
    id: 'camp-001', name: 'Summer DIY Blitz', status: 'Active', channel: 'Email',
    audience: 'Bunnings VIC/NSW DIY Enthusiasts', audienceSize: 18500,
    sent: 18500, opened: 7200, clicked: 2800, converted: 420,
    startDate: '2026-01-15', endDate: '2026-03-15', budget: 25000, spent: 18200,
    destination: 'Braze',
  },
  {
    id: 'camp-002', name: 'Back to School Essentials', status: 'Completed', channel: 'Email + SMS',
    audience: 'Kmart Parents 30-50 NSW', audienceSize: 22000,
    sent: 22000, opened: 9800, clicked: 4100, converted: 890,
    startDate: '2026-01-05', endDate: '2026-02-10', budget: 15000, spent: 14800,
    destination: 'Hightouch',
  },
  {
    id: 'camp-003', name: 'Garden Makeover Spring', status: 'Paused', channel: 'SMS',
    audience: 'Bunnings Garden Shoppers QLD/WA', audienceSize: 12000,
    sent: 8000, opened: 3500, clicked: 1200, converted: 280,
    startDate: '2026-02-01', endDate: '2026-04-01', budget: 20000, spent: 9500,
    destination: 'Braze',
  },
  {
    id: 'camp-004', name: 'OnePass Welcome Offer', status: 'Active', channel: 'Email',
    audience: 'New signups last 30 days', audienceSize: 5200,
    sent: 5200, opened: 2600, clicked: 1100, converted: 310,
    startDate: '2026-03-01', endDate: '2026-06-01', budget: 8000, spent: 3200,
    destination: 'Braze',
  },
  {
    id: 'camp-005', name: 'Winter Wardrobe Clearance', status: 'Draft', channel: 'Email',
    audience: 'Kmart Apparel Buyers Female 25-45', audienceSize: 31000,
    sent: 0, opened: 0, clicked: 0, converted: 0,
    startDate: '2026-04-01', endDate: '2026-05-15', budget: 30000, spent: 0,
  },
  {
    id: 'camp-006', name: 'Trade Pro Loyalty Boost', status: 'Activated', channel: 'SMS',
    audience: 'Bunnings High Spenders $500+', audienceSize: 8900,
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
};

export default function App() {
  const [page, setPage] = useState<'audience' | 'campaigns' | 'offers'>('audience');
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [syncedFromAgent, setSyncedFromAgent] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>(SEED_CAMPAIGNS);

  // Audience metrics
  const [audienceSize, setAudienceSize] = useState(0);
  const [totalBase, setTotalBase] = useState(200000);
  const [reachable, setReachable] = useState(0);
  const [stateData, setStateData] = useState<BreakdownRow[]>([]);
  const [ageData, setAgeData] = useState<BreakdownRow[]>([]);
  const [execSummary, setExecSummary] = useState('');
  const [loading, setLoading] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshData = useCallback(async (f: Filters) => {
    setLoading(true);
    try {
      // Count audience
      const { fullQuery } = buildWhereClause(f, ALL_STATES);
      const countRows = await runSQL(fullQuery);
      const cnt = Number(countRows?.[0]?.CNT ?? countRows?.[0]?.cnt ?? 0);
      setAudienceSize(cnt);

      // Reachable (has email or phone)
      const reachableQ = f.hasEmail || f.hasPhone
        ? cnt
        : Math.round(cnt * 0.92); // ~92% have at least one channel
      setReachable(reachableQ);

      // State breakdown
      const stateQ = buildBreakdownQuery(f, ALL_STATES, 'STATE_CODE');
      const stateRows = await runSQL(stateQ);
      setStateData(
        stateRows.map((r: Record<string, unknown>) => ({
          label: String(r.LABEL ?? r.label ?? ''),
          count: Number(r.COUNT ?? r.count ?? 0),
        }))
      );

      // Age breakdown
      const ageQ = buildBreakdownQuery(f, ALL_STATES, 'AGE');
      const ageRows = await runSQL(ageQ);
      setAgeData(
        ageRows.map((r: Record<string, unknown>) => ({
          label: String(r.LABEL ?? r.label ?? ''),
          count: Number(r.COUNT ?? r.count ?? 0),
        }))
      );

      // AI summary
      if (cnt > 0) {
        const summaryPrompt = `You are an audience analytics assistant. Given this audience segment:
- Size: ${cnt.toLocaleString()} customers
- Filters: Retailer=${f.retailer}, Age=${f.ageRange[0]}-${f.ageRange[1]}, States=${f.states.length > 0 ? f.states.join(',') : 'All'}, Email=${f.hasEmail}, Phone=${f.hasPhone}, Min Spend=$${f.minSpend}, Recency=${f.recencyDays} days
- State distribution: ${stateRows.slice(0, 5).map((r: Record<string, unknown>) => `${r.LABEL ?? r.label}:${r.COUNT ?? r.count}`).join(', ')}

Provide 3-4 concise bullet points with actionable insights for a campaign manager. Focus on segment characteristics, targeting opportunities, and potential campaign strategies. Keep each bullet to 1-2 sentences.`;
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
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced refresh on filter change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => refreshData(filters), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [filters, refreshData]);

  // Initial total base count
  useEffect(() => {
    runSQL('SELECT COUNT(*) AS cnt FROM ONEDATA_AUDIENCE.PUBLIC.CUSTOMERS')
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
    if (f.retailer !== 'All') parts.push(f.retailer);
    if (f.ageRange[0] > 1 || f.ageRange[1] < 100) parts.push(`Age ${f.ageRange[0]}-${f.ageRange[1]}`);
    if (f.states.length > 0 && f.states.length <= 3) parts.push(f.states.join('/'));
    if (f.states.length > 3) parts.push(`${f.states.length} states`);
    if (f.hasEmail) parts.push('Email');
    if (f.hasPhone) parts.push('Phone');
    if (f.minSpend > 0) parts.push(`$${f.minSpend}+ spend`);
    if (f.recencyDays < 730) parts.push(`${f.recencyDays}d recency`);
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
