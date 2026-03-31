import type { Filters } from '../types';

interface Props {
  filters: Filters;
  allStates: string[];
  syncedFromAgent: boolean;
  onFiltersChange: (f: Filters) => void;
  onClose: () => void;
}

export default function Sidebar({
  filters,
  allStates,
  syncedFromAgent,
  onFiltersChange,
  onClose,
}: Props) {
  const update = (partial: Partial<Filters>) => {
    onFiltersChange({ ...filters, ...partial });
  };

  return (
    <div className="filter-sidebar">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Filters</h3>
        <button className="btn btn-sm" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {syncedFromAgent && (
        <div className="synced-banner">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          Synced from agent
        </div>
      )}

      {/* Retailer */}
      <div className="filter-group">
        <label>Retailer</label>
        <div className="pill-group">
          {['All', 'Kmart', 'Bunnings'].map((r) => (
            <button
              key={r}
              className={`pill ${filters.retailer === r ? 'active' : ''}`}
              onClick={() => update({ retailer: r })}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Age Range */}
      <div className="filter-group">
        <label>Age Range: {filters.ageRange[0]} - {filters.ageRange[1]}</label>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Min</span>
          <input
            type="range"
            min={1}
            max={100}
            value={filters.ageRange[0]}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v <= filters.ageRange[1]) update({ ageRange: [v, filters.ageRange[1]] });
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Max</span>
          <input
            type="range"
            min={1}
            max={100}
            value={filters.ageRange[1]}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v >= filters.ageRange[0]) update({ ageRange: [filters.ageRange[0], v] });
            }}
          />
        </div>
      </div>

      {/* States */}
      <div className="filter-group">
        <label>States {filters.states.length > 0 ? `(${filters.states.length})` : ''}</label>
        <div className="chip-group">
          {allStates.map((s) => (
            <button
              key={s}
              className={`chip ${filters.states.includes(s) ? 'active' : ''}`}
              onClick={() => {
                const next = filters.states.includes(s)
                  ? filters.states.filter((x) => x !== s)
                  : [...filters.states, s];
                update({ states: next });
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Contact Channels */}
      <div className="filter-group">
        <label>Contact Channels</label>
        <div className="toggle-row">
          <span>Has Email</span>
          <button
            className={`toggle ${filters.hasEmail ? 'on' : ''}`}
            onClick={() => update({ hasEmail: !filters.hasEmail })}
          />
        </div>
        <div className="toggle-row">
          <span>Has Phone</span>
          <button
            className={`toggle ${filters.hasPhone ? 'on' : ''}`}
            onClick={() => update({ hasPhone: !filters.hasPhone })}
          />
        </div>
      </div>

      {/* Min Spend */}
      <div className="filter-group">
        <label>Min Total Spend ($AUD)</label>
        <input
          type="number"
          className="number-input"
          min={0}
          step={50}
          value={filters.minSpend}
          onChange={(e) => update({ minSpend: Math.max(0, Number(e.target.value)) })}
          placeholder="0"
        />
      </div>

      {/* Recency */}
      <div className="filter-group">
        <label>Transaction Recency: {filters.recencyDays} days</label>
        <input
          type="range"
          min={1}
          max={730}
          value={filters.recencyDays}
          onChange={(e) => update({ recencyDays: Number(e.target.value) })}
        />
        <div className="range-values">
          <span>1 day</span>
          <span>2 years</span>
        </div>
      </div>

      {/* Reset */}
      <button
        className="btn"
        style={{ width: '100%', justifyContent: 'center' }}
        onClick={() =>
          onFiltersChange({
            retailer: 'All',
            ageRange: [1, 100],
            states: [],
            hasEmail: false,
            hasPhone: false,
            minSpend: 0,
            recencyDays: 730,
          })
        }
      >
        Reset Filters
      </button>
    </div>
  );
}
