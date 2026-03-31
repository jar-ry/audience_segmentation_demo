import { useState } from 'react';
import type { Campaign } from '../types';
import { aiComplete } from '../hooks/api';

interface Props {
  campaigns: Campaign[];
  onUpdateCampaign: (id: string, updates: Partial<Campaign>) => void;
}

function fmt(n: number): string {
  return n.toLocaleString();
}

export default function CampaignsPage({ campaigns, onUpdateCampaign }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: string } | null>(null);
  const [aiInsight, setAiInsight] = useState('');
  const [insightLoading, setInsightLoading] = useState(false);

  const selected = campaigns.find((c) => c.id === selectedId);

  const loadInsights = async (c: Campaign) => {
    setInsightLoading(true);
    try {
      const openRate = c.sent > 0 ? ((c.opened / c.sent) * 100).toFixed(1) : '0';
      const clickRate = c.opened > 0 ? ((c.clicked / c.opened) * 100).toFixed(1) : '0';
      const convRate = c.clicked > 0 ? ((c.converted / c.clicked) * 100).toFixed(1) : '0';
      const spendPct = c.budget > 0 ? ((c.spent / c.budget) * 100).toFixed(0) : '0';

      const prompt = `Analyze this marketing campaign and provide 3-4 concise insights:

Campaign: ${c.name}
Status: ${c.status}
Channel: ${c.channel}
Audience: ${c.audience} (${fmt(c.audienceSize)} people)
Sent: ${fmt(c.sent)} | Opened: ${fmt(c.opened)} (${openRate}%) | Clicked: ${fmt(c.clicked)} (${clickRate}%) | Converted: ${fmt(c.converted)} (${convRate}%)
Budget: $${fmt(c.budget)} | Spent: $${fmt(c.spent)} (${spendPct}%)
Period: ${c.startDate} to ${c.endDate}
${c.destination ? `Destination: ${c.destination}` : ''}

Focus on: performance assessment, optimization opportunities, and next steps. Be specific with numbers. Keep each insight to 1-2 sentences.`;

      const text = await aiComplete(prompt);
      setAiInsight(text);
    } catch {
      setAiInsight('Unable to generate insights at this time.');
    } finally {
      setInsightLoading(false);
    }
  };

  const handleSelect = (c: Campaign) => {
    setSelectedId(c.id);
    setAiInsight('');
    loadInsights(c);
  };

  const executeAction = (id: string, action: string) => {
    const updates: Partial<Campaign> = {};
    switch (action) {
      case 'pause':
        updates.status = 'Paused';
        break;
      case 'resume':
        updates.status = 'Active';
        break;
      case 'cancel':
        updates.status = 'Cancelled';
        break;
      case 'complete':
        updates.status = 'Completed';
        break;
      case 'launch':
        updates.status = 'Active';
        break;
    }
    onUpdateCampaign(id, updates);
    setConfirmAction(null);
  };

  // Detail view
  if (selected) {
    const openRate = selected.sent > 0 ? ((selected.opened / selected.sent) * 100).toFixed(1) : '0';
    const clickRate = selected.opened > 0 ? ((selected.clicked / selected.opened) * 100).toFixed(1) : '0';
    const convRate = selected.clicked > 0 ? ((selected.converted / selected.clicked) * 100).toFixed(1) : '0';
    const spendPct = selected.budget > 0 ? (selected.spent / selected.budget) * 100 : 0;

    const funnelSteps = [
      { label: 'Sent', value: selected.sent, color: '#7C3AED' },
      { label: 'Opened', value: selected.opened, color: '#9061F0' },
      { label: 'Clicked', value: selected.clicked, color: '#A78BFA' },
      { label: 'Converted', value: selected.converted, color: '#C4B5FD' },
    ];
    const maxFunnel = Math.max(...funnelSteps.map((s) => s.value), 1);

    return (
      <div className="campaign-detail">
        <button className="btn btn-sm" onClick={() => setSelectedId(null)} style={{ marginBottom: 16 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back to Campaigns
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700 }}>{selected.name}</h2>
            <div style={{ display: 'flex', gap: 12, marginTop: 8, alignItems: 'center' }}>
              <span className={`status-badge status-${selected.status}`}>{selected.status}</span>
              <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{selected.channel}</span>
              {selected.destination && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--surface-raised)', padding: '2px 8px', borderRadius: 4 }}>
                  {selected.destination}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {selected.status === 'Active' && (
              <button className="btn btn-warning btn-sm" onClick={() => setConfirmAction({ id: selected.id, action: 'pause' })}>
                Pause
              </button>
            )}
            {selected.status === 'Paused' && (
              <button className="btn btn-success btn-sm" onClick={() => setConfirmAction({ id: selected.id, action: 'resume' })}>
                Resume
              </button>
            )}
            {(selected.status === 'Draft' || selected.status === 'Activated') && (
              <button className="btn btn-primary btn-sm" onClick={() => setConfirmAction({ id: selected.id, action: 'launch' })}>
                Launch
              </button>
            )}
            {(selected.status === 'Active' || selected.status === 'Paused') && (
              <button className="btn btn-sm" onClick={() => setConfirmAction({ id: selected.id, action: 'complete' })}>
                Complete
              </button>
            )}
            {selected.status !== 'Completed' && selected.status !== 'Cancelled' && (
              <button className="btn btn-danger btn-sm" onClick={() => setConfirmAction({ id: selected.id, action: 'cancel' })}>
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* Metrics */}
        <div className="campaign-metrics">
          <div className="campaign-metric-card">
            <div className="value">{fmt(selected.audienceSize)}</div>
            <div className="label">Audience</div>
          </div>
          <div className="campaign-metric-card">
            <div className="value">{openRate}%</div>
            <div className="label">Open Rate</div>
          </div>
          <div className="campaign-metric-card">
            <div className="value">{clickRate}%</div>
            <div className="label">Click Rate</div>
          </div>
          <div className="campaign-metric-card">
            <div className="value">{convRate}%</div>
            <div className="label">Conv. Rate</div>
          </div>
          <div className="campaign-metric-card">
            <div className="value">${fmt(selected.spent)}</div>
            <div className="label">Spent</div>
          </div>
          <div className="campaign-metric-card">
            <div className="value">{spendPct.toFixed(0)}%</div>
            <div className="label">Budget Used</div>
          </div>
        </div>

        {/* Funnel */}
        <div className="card" style={{ marginBottom: 20 }}>
          <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 16 }}>
            Engagement Funnel
          </h4>
          <div className="funnel">
            {funnelSteps.map((step) => (
              <div className="funnel-step" key={step.label}>
                <span className="funnel-label">{step.label}</span>
                <div className="funnel-bar-bg">
                  <div
                    className="funnel-bar-fill"
                    style={{
                      width: `${(step.value / maxFunnel) * 100}%`,
                      backgroundColor: step.color,
                    }}
                  >
                    {step.value > 0 ? fmt(step.value) : ''}
                  </div>
                </div>
                <span className="funnel-value">{fmt(step.value)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* AI Insights */}
        <div className="card">
          <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 12 }}>
            AI Campaign Insights
          </h4>
          {insightLoading ? (
            <div>
              <div className="shimmer" style={{ height: 16, marginBottom: 8, width: '90%' }} />
              <div className="shimmer" style={{ height: 16, marginBottom: 8, width: '75%' }} />
              <div className="shimmer" style={{ height: 16, width: '80%' }} />
            </div>
          ) : (
            <div className="insight-summary">
              <ul>
                {aiInsight
                  .split('\n')
                  .map((l) => l.replace(/^[-*]\s*/, '').trim())
                  .filter((l) => l.length > 0)
                  .map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
              </ul>
            </div>
          )}
        </div>

        {/* Confirmation Dialog */}
        {confirmAction && (
          <div className="modal-overlay" onClick={() => setConfirmAction(null)}>
            <div className="modal confirm-dialog" onClick={(e) => e.stopPropagation()}>
              <h3>
                {confirmAction.action === 'cancel'
                  ? 'Cancel Campaign?'
                  : confirmAction.action === 'complete'
                  ? 'Complete Campaign?'
                  : `${confirmAction.action.charAt(0).toUpperCase() + confirmAction.action.slice(1)} Campaign?`}
              </h3>
              <p>
                {confirmAction.action === 'cancel'
                  ? 'This will permanently cancel the campaign. This action cannot be undone.'
                  : confirmAction.action === 'complete'
                  ? 'This will mark the campaign as completed and stop all sends.'
                  : `Are you sure you want to ${confirmAction.action} this campaign?`}
              </p>
              <div className="modal-actions">
                <button className="btn" onClick={() => setConfirmAction(null)}>
                  Go Back
                </button>
                <button
                  className={`btn ${confirmAction.action === 'cancel' ? 'btn-danger' : 'btn-primary'}`}
                  onClick={() => executeAction(confirmAction.id, confirmAction.action)}
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // List view
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>Campaigns</h2>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{campaigns.length} campaigns</span>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="campaign-table">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Status</th>
              <th>Destination</th>
              <th>Channel</th>
              <th>Audience</th>
              <th>Budget</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => {
              const spendPct = c.budget > 0 ? (c.spent / c.budget) * 100 : 0;
              return (
                <tr key={c.id} onClick={() => handleSelect(c)}>
                  <td style={{ fontWeight: 500 }}>{c.name}</td>
                  <td>
                    <span className={`status-badge status-${c.status}`}>{c.status}</span>
                  </td>
                  <td style={{ color: c.destination ? 'var(--text)' : 'var(--text-muted)' }}>
                    {c.destination || '--'}
                  </td>
                  <td>{c.channel}</td>
                  <td>{fmt(c.audienceSize)}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13 }}>${fmt(c.budget)}</span>
                      <div className="budget-bar">
                        <div className="budget-bar-fill" style={{ width: `${Math.min(spendPct, 100)}%` }} />
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
