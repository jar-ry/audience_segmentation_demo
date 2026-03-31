import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { BreakdownRow } from '../types';

interface Props {
  stateData: BreakdownRow[];
  ageData: BreakdownRow[];
  execSummary: string;
  loading: boolean;
  audienceSize: number;
}

const COLORS = ['#7C3AED', '#9061F0', '#A78BFA', '#6D28D9', '#8B5CF6', '#C4B5FD', '#5B21B6', '#DDD6FE'];

export default function RightPanel({ stateData, ageData, execSummary, loading, audienceSize }: Props) {
  if (audienceSize === 0 && !loading) {
    return (
      <div className="right-panel">
        <div className="insight-card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          <p>Adjust filters or ask the agent to see insights</p>
        </div>
      </div>
    );
  }

  const parseSummary = (text: string): string[] => {
    if (!text) return [];
    return text
      .split('\n')
      .map((line) => line.replace(/^[-*]\s*/, '').trim())
      .filter((line) => line.length > 0);
  };

  return (
    <div className="right-panel">
      {/* AI Summary */}
      <div className="insight-card">
        <h4>AI Insights</h4>
        {loading ? (
          <div>
            <div className="shimmer" style={{ height: 16, marginBottom: 8, width: '90%' }} />
            <div className="shimmer" style={{ height: 16, marginBottom: 8, width: '75%' }} />
            <div className="shimmer" style={{ height: 16, width: '80%' }} />
          </div>
        ) : (
          <div className="insight-summary">
            <ul>
              {parseSummary(execSummary).map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* State Breakdown */}
      <div className="insight-card">
        <h4>State Breakdown</h4>
        {loading ? (
          <div className="shimmer" style={{ height: 180 }} />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stateData} layout="vertical" margin={{ left: 40, right: 16, top: 4, bottom: 4 }}>
              <XAxis type="number" tick={{ fontSize: 11, fill: '#9199a5' }} />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 12, fill: '#5c6370' }} width={36} />
              <Tooltip
                formatter={(value: number) => [value.toLocaleString(), 'Customers']}
                contentStyle={{ borderRadius: 8, border: '1px solid #e2e5ea', fontSize: 12 }}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {stateData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Age Breakdown */}
      <div className="insight-card">
        <h4>Age Breakdown</h4>
        {loading ? (
          <div className="shimmer" style={{ height: 180 }} />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={ageData} margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#5c6370' }} />
              <YAxis tick={{ fontSize: 11, fill: '#9199a5' }} />
              <Tooltip
                formatter={(value: number) => [value.toLocaleString(), 'Customers']}
                contentStyle={{ borderRadius: 8, border: '1px solid #e2e5ea', fontSize: 12 }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {ageData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
