interface Props {
  audienceSize: number;
  pctOfBase: string;
  reachable: number;
  loading: boolean;
  showFilters: boolean;
  onToggleFilters: () => void;
}

function fmt(n: number): string {
  return n.toLocaleString();
}

export default function MetricsBar({
  audienceSize,
  pctOfBase,
  reachable,
  loading,
  showFilters,
  onToggleFilters,
}: Props) {
  const handleExport = async () => {
    try {
      const resp = await fetch('/api/sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sql: `SELECT * FROM ONEDATA_AUDIENCE.PUBLIC.CUSTOMERS LIMIT 10000`,
        }),
      });
      const json = await resp.json();
      const rows = json.rows || [];
      if (rows.length === 0) return;

      const headers = Object.keys(rows[0]);
      const csv = [
        headers.join(','),
        ...rows.map((r: Record<string, unknown>) =>
          headers.map((h) => `"${String(r[h] ?? '')}"`).join(',')
        ),
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audience_export_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
    }
  };

  return (
    <div className="metrics-bar">
      <div className="metric-card">
        <div className="metric-icon purple">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
          </svg>
        </div>
        <div>
          <div className="metric-value">{loading ? '...' : fmt(audienceSize)}</div>
          <div className="metric-label">Audience Size</div>
        </div>
      </div>

      <div className="metric-card">
        <div className="metric-icon pink">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        </div>
        <div>
          <div className="metric-value">{loading ? '...' : `${pctOfBase}%`}</div>
          <div className="metric-label">% of Base</div>
        </div>
      </div>

      <div className="metric-card">
        <div className="metric-icon green">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>
        <div>
          <div className="metric-value">{loading ? '...' : fmt(reachable)}</div>
          <div className="metric-label">Reachable</div>
        </div>
      </div>

      <div className="metrics-actions">
        <button className="btn btn-sm" onClick={handleExport}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export CSV
        </button>
        <button
          className={`btn btn-sm ${showFilters ? 'btn-primary' : ''}`}
          onClick={onToggleFilters}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          Filters
        </button>
      </div>
    </div>
  );
}
