import { useCallback } from 'react';
import type { Filters, BreakdownRow } from '../types';
import { extractFiltersFromSQL } from '../hooks/api';
import ChatBox from './ChatBox';
import RightPanel from './RightPanel';

interface Props {
  filters: Filters;
  allStates: string[];
  audienceSize: number;
  stateData: BreakdownRow[];
  ageData: BreakdownRow[];
  execSummary: string;
  loading: boolean;
  onFilterSync: (filters: Partial<Filters>) => void;
  buildAudienceLabel: (f: Filters) => string;
}

export default function AudiencePage({
  filters,
  allStates,
  audienceSize,
  stateData,
  ageData,
  execSummary,
  loading,
  onFilterSync,
  buildAudienceLabel,
}: Props) {
  const filterContext = buildFilterContext(filters, allStates);

  const handleAgentSQL = useCallback(
    async (sql: string) => {
      const extracted = await extractFiltersFromSQL(sql);
      if (extracted) {
        onFilterSync(extracted);
      }
    },
    [onFilterSync]
  );

  return (
    <div className="audience-layout">
      <ChatBox filterContext={filterContext} onAgentSQL={handleAgentSQL} />
      <RightPanel
        stateData={stateData}
        ageData={ageData}
        execSummary={execSummary}
        loading={loading}
        audienceSize={audienceSize}
      />
    </div>
  );
}

function buildFilterContext(filters: Filters, allStates: string[]): string {
  const parts: string[] = [];
  parts.push(`Retailer=${filters.retailer}`);
  parts.push(`Age=${filters.ageRange[0]}-${filters.ageRange[1]}`);
  if (filters.states.length > 0 && filters.states.length < allStates.length) {
    parts.push(`States=${filters.states.join(',')}`);
  }
  if (filters.hasEmail) parts.push('HasEmail=true');
  if (filters.hasPhone) parts.push('HasPhone=true');
  if (filters.minSpend > 0) parts.push(`MinSpend=$${filters.minSpend}`);
  if (filters.recencyDays < 730) parts.push(`Recency=${filters.recencyDays}days`);
  return parts.join('; ');
}
