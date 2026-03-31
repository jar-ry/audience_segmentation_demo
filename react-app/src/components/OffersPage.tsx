import { useState, useMemo, useEffect, useRef } from 'react';
import type { Campaign, Offer } from '../types';
import { aiComplete } from '../hooks/api';

interface Props {
  audienceSize: number;
  audienceLabel: string;
  onAddCampaign: (campaign: Campaign) => void;
}

const SEED_OFFERS: Offer[] = [
  { id: 'off-1', name: '3x OnePass Points', type: 'Points Multiplier', description: 'Triple points on all purchases for 30 days', costPerRedemption: 2.50, avgRedemptionRate: 0.35, active: true },
  { id: 'off-2', name: '20% Off Apparel', type: 'Discount', description: '20% discount on all Kmart apparel', costPerRedemption: 8.00, avgRedemptionRate: 0.22, active: true },
  { id: 'off-3', name: '$10 Cashback on $50+', type: 'Cashback', description: '$10 cashback when spending $50 or more', costPerRedemption: 10.00, avgRedemptionRate: 0.18, active: true },
  { id: 'off-4', name: 'Flybuys Bonus 500pts', type: 'Partner', description: 'Bonus 500 Flybuys points with OnePass', costPerRedemption: 3.50, avgRedemptionRate: 0.28, partner: 'Flybuys', active: true },
  { id: 'off-5', name: 'Free Click & Collect', type: 'Reward', description: 'Free express click & collect for 60 days', costPerRedemption: 4.00, avgRedemptionRate: 0.40, active: true },
  { id: 'off-6', name: '15% Off Garden', type: 'Discount', description: '15% off all Bunnings garden products', costPerRedemption: 12.00, avgRedemptionRate: 0.15, active: true },
  { id: 'off-7', name: '$5 Off Next Visit', type: 'Cashback', description: '$5 off next purchase, no minimum', costPerRedemption: 5.00, avgRedemptionRate: 0.45, active: true },
  { id: 'off-8', name: 'Uber Eats $10 Voucher', type: 'Partner', description: '$10 Uber Eats voucher with $100+ spend', costPerRedemption: 10.00, avgRedemptionRate: 0.12, partner: 'Uber Eats', active: false },
];

const CHANNEL_COSTS = { Email: 0.03, SMS: 0.08, 'Email + SMS': 0.11 };

const BADGE_CLASS: Record<string, string> = {
  'Points Multiplier': 'badge-points',
  Discount: 'badge-discount',
  Cashback: 'badge-cashback',
  Partner: 'badge-partner',
  Reward: 'badge-reward',
};

export default function OffersPage({ audienceSize, audienceLabel, onAddCampaign }: Props) {
  const [tab, setTab] = useState<'catalogue' | 'calculator' | 'planner'>('catalogue');
  const [selectedOffers, setSelectedOffers] = useState<Set<string>>(new Set());
  const [channel, setChannel] = useState<'Email' | 'SMS' | 'Email + SMS'>('Email');
  const [duration, setDuration] = useState(30);
  const [toast, setToast] = useState('');

  // Budget Planner state
  const [budget, setBudget] = useState(10000);
  const [campaignGoal, setCampaignGoal] = useState<'conversions' | 'reach' | 'engagement'>('conversions');
  const [channelPref, setChannelPref] = useState<'Email' | 'SMS' | 'Email + SMS'>('Email');

  // AI state
  const [calcAiText, setCalcAiText] = useState('');
  const [calcAiLoading, setCalcAiLoading] = useState(false);
  const [plannerAiText, setPlannerAiText] = useState('');
  const [plannerAiLoading, setPlannerAiLoading] = useState(false);

  // Activate modal
  const [showActivate, setShowActivate] = useState(false);
  const [activateName, setActivateName] = useState('');
  const [activateDest, setActivateDest] = useState<'Braze' | 'Hightouch'>('Braze');
  const [activateBudget, setActivateBudget] = useState(0);
  const [activateChannel, setActivateChannel] = useState('Email');

  const debounceCalcRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncePlanRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeOffers = SEED_OFFERS.filter((o) => o.active);

  // ── Cost Calculator (deterministic useMemo) ──
  const calcResult = useMemo(() => {
    const selected = activeOffers.filter((o) => selectedOffers.has(o.id));
    if (selected.length === 0 || audienceSize === 0) {
      return { totalCost: 0, sendCost: 0, offerCost: 0, breakdown: [], estimatedRedemptions: 0 };
    }

    const sends = duration <= 30 ? 1 : Math.ceil(duration / 14);
    const channelCost = CHANNEL_COSTS[channel] || 0.03;
    const sendCost = audienceSize * sends * channelCost;

    const breakdown = selected.map((o) => {
      const redemptions = Math.round(audienceSize * o.avgRedemptionRate);
      const cost = redemptions * o.costPerRedemption;
      return { offer: o, redemptions, cost };
    });

    const offerCost = breakdown.reduce((sum, b) => sum + b.cost, 0);
    const estimatedRedemptions = breakdown.reduce((sum, b) => sum + b.redemptions, 0);

    return { totalCost: sendCost + offerCost, sendCost, offerCost, breakdown, estimatedRedemptions };
  }, [selectedOffers, channel, duration, audienceSize, activeOffers]);

  // AI recommendations for calculator (debounced)
  useEffect(() => {
    if (calcResult.totalCost === 0) { setCalcAiText(''); return; }
    if (debounceCalcRef.current) clearTimeout(debounceCalcRef.current);
    debounceCalcRef.current = setTimeout(async () => {
      setCalcAiLoading(true);
      try {
        const selected = activeOffers.filter((o) => selectedOffers.has(o.id));
        const prompt = `You are a campaign cost advisor. Here are the PRE-COMPUTED costs (do NOT recalculate any numbers):

Audience: ${audienceSize.toLocaleString()} customers (${audienceLabel})
Channel: ${channel} | Duration: ${duration} days
Send Cost: $${calcResult.sendCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
Offer Cost: $${calcResult.offerCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
Total Cost: $${calcResult.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
Est. Redemptions: ${calcResult.estimatedRedemptions.toLocaleString()}
Offers: ${selected.map((o) => o.name).join(', ')}

Provide 2-3 concise recommendations about cost optimization, channel effectiveness, or offer mix. Reference the exact numbers above. Do NOT recalculate any costs.`;
        const text = await aiComplete(prompt);
        setCalcAiText(text);
      } catch { setCalcAiText(''); }
      finally { setCalcAiLoading(false); }
    }, 800);
  }, [calcResult.totalCost]);

  // ── Budget Planner (greedy knapsack in useMemo) ──
  const plannerResult = useMemo(() => {
    if (budget <= 0 || audienceSize === 0) return { selectedOffers: [], totalCost: 0, sendCost: 0, offerCost: 0, remaining: budget };

    const channelCost = CHANNEL_COSTS[channelPref] || 0.03;
    const sends = 2; // Assume 2 sends for a standard campaign
    const sendCost = audienceSize * sends * channelCost;

    if (sendCost >= budget) {
      return { selectedOffers: [], totalCost: sendCost, sendCost, offerCost: 0, remaining: budget - sendCost };
    }

    let remaining = budget - sendCost;

    // Score offers by goal efficiency
    const scored = activeOffers.map((o) => {
      const redemptions = Math.round(audienceSize * o.avgRedemptionRate);
      const cost = redemptions * o.costPerRedemption;
      let efficiency = 0;
      switch (campaignGoal) {
        case 'conversions':
          efficiency = cost > 0 ? redemptions / cost : 0;
          break;
        case 'reach':
          efficiency = cost > 0 ? o.avgRedemptionRate / o.costPerRedemption : 0;
          break;
        case 'engagement':
          efficiency = cost > 0 ? (o.avgRedemptionRate * redemptions) / cost : 0;
          break;
      }
      return { offer: o, redemptions, cost, efficiency };
    });

    scored.sort((a, b) => b.efficiency - a.efficiency);

    const picked: typeof scored = [];
    for (const item of scored) {
      if (item.cost <= remaining) {
        picked.push(item);
        remaining -= item.cost;
      }
    }

    const offerCost = picked.reduce((s, p) => s + p.cost, 0);

    return {
      selectedOffers: picked,
      totalCost: sendCost + offerCost,
      sendCost,
      offerCost,
      remaining,
    };
  }, [budget, channelPref, campaignGoal, audienceSize, activeOffers]);

  // AI strategy for planner (debounced)
  useEffect(() => {
    if (plannerResult.selectedOffers.length === 0) { setPlannerAiText(''); return; }
    if (debouncePlanRef.current) clearTimeout(debouncePlanRef.current);
    debouncePlanRef.current = setTimeout(async () => {
      setPlannerAiLoading(true);
      try {
        const prompt = `You are a campaign strategist. Here is a PRE-COMPUTED optimized campaign plan (do NOT recalculate any numbers):

Budget: $${budget.toLocaleString()}
Goal: ${campaignGoal}
Channel: ${channelPref}
Audience: ${audienceSize.toLocaleString()} (${audienceLabel})
Send Cost: $${plannerResult.sendCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
Offer Cost: $${plannerResult.offerCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
Total: $${plannerResult.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
Remaining: $${plannerResult.remaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
Selected Offers: ${plannerResult.selectedOffers.map((p) => `${p.offer.name} ($${p.cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}, ${p.redemptions.toLocaleString()} est. redemptions)`).join('; ')}

Respond in JSON format with these keys:
- summary: 2 sentence strategic overview
- offerReasons: array of strings, one reason per selected offer explaining why it was picked
- roiRationale: 1 sentence on expected ROI
- tips: array of 2-3 optimization tips

Do NOT recalculate any costs. Use exact numbers provided.`;
        const text = await aiComplete(prompt);
        setPlannerAiText(text);
      } catch { setPlannerAiText(''); }
      finally { setPlannerAiLoading(false); }
    }, 800);
  }, [plannerResult.totalCost, plannerResult.selectedOffers.length]);

  const handleActivate = (fromBudget: number, fromChannel: string) => {
    setActivateBudget(fromBudget);
    setActivateChannel(fromChannel);
    setActivateName(`${audienceLabel} Campaign`);
    setShowActivate(true);
  };

  const confirmActivate = () => {
    const campaign: Campaign = {
      id: `camp-${Date.now()}`,
      name: activateName,
      status: 'Activated',
      channel: activateChannel,
      audience: audienceLabel,
      audienceSize,
      sent: 0,
      opened: 0,
      clicked: 0,
      converted: 0,
      startDate: new Date().toISOString().slice(0, 10),
      endDate: new Date(Date.now() + duration * 86400000).toISOString().slice(0, 10),
      budget: activateBudget,
      spent: 0,
      destination: activateDest,
    };
    onAddCampaign(campaign);
    setShowActivate(false);
    setToast(`Campaign "${activateName}" activated to ${activateDest}!`);
    setTimeout(() => setToast(''), 3000);
  };

  const parsePlannerAI = (text: string) => {
    try {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
    } catch {}
    return null;
  };

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Offers & Costs</h2>

      <div className="tabs">
        <button className={`tab ${tab === 'catalogue' ? 'active' : ''}`} onClick={() => setTab('catalogue')}>
          Catalogue
        </button>
        <button className={`tab ${tab === 'calculator' ? 'active' : ''}`} onClick={() => setTab('calculator')}>
          Cost Calculator
        </button>
        <button className={`tab ${tab === 'planner' ? 'active' : ''}`} onClick={() => setTab('planner')}>
          AI Budget Planner
        </button>
      </div>

      {/* ── Catalogue ── */}
      {tab === 'catalogue' && (
        <div className="offers-grid">
          {SEED_OFFERS.map((o) => (
            <div key={o.id} className="offer-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <span className={`offer-type-badge ${BADGE_CLASS[o.type] || ''}`}>{o.type}</span>
                {!o.active && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>Inactive</span>
                )}
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{o.name}</h3>
              <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 12 }}>{o.description}</p>
              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)' }}>
                <span>Cost: ${o.costPerRedemption.toFixed(2)}/redeem</span>
                <span>Rate: {(o.avgRedemptionRate * 100).toFixed(0)}%</span>
              </div>
              {o.partner && (
                <div style={{ marginTop: 8, fontSize: 11, color: 'var(--accent)', background: 'var(--accent-light)', display: 'inline-block', padding: '2px 8px', borderRadius: 4 }}>
                  Partner: {o.partner}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Cost Calculator ── */}
      {tab === 'calculator' && (
        <div className="calculator-layout">
          <div className="card">
            <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Configuration</h4>

            <div className="filter-group" style={{ marginBottom: 16 }}>
              <label>Audience Source</label>
              <div style={{ padding: '8px 12px', background: 'var(--surface-raised)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
                {audienceLabel} ({audienceSize.toLocaleString()} customers)
              </div>
            </div>

            <div className="filter-group" style={{ marginBottom: 16 }}>
              <label>Channel</label>
              <div className="pill-group">
                {(['Email', 'SMS', 'Email + SMS'] as const).map((c) => (
                  <button key={c} className={`pill ${channel === c ? 'active' : ''}`} onClick={() => setChannel(c)}>
                    {c} (${CHANNEL_COSTS[c]}/send)
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-group" style={{ marginBottom: 16 }}>
              <label>Select Offers</label>
              {activeOffers.map((o) => (
                <label key={o.id} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={selectedOffers.has(o.id)}
                    onChange={() => {
                      setSelectedOffers((prev) => {
                        const next = new Set(prev);
                        if (next.has(o.id)) next.delete(o.id);
                        else next.add(o.id);
                        return next;
                      });
                    }}
                  />
                  <span style={{ fontSize: 13 }}>{o.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                    ${o.costPerRedemption}/redeem ({(o.avgRedemptionRate * 100).toFixed(0)}% rate)
                  </span>
                </label>
              ))}
            </div>

            <div className="filter-group">
              <label>Duration: {duration} days</label>
              <input
                type="range"
                min={7}
                max={90}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              />
              <div className="range-values">
                <span>7 days</span>
                <span>90 days</span>
              </div>
            </div>
          </div>

          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Cost Estimate</h4>

              {calcResult.totalCost === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Select at least one offer to see costs</p>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>Send Cost</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>${calcResult.sendCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>Offer Cost</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>${calcResult.offerCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', fontSize: 16, fontWeight: 700 }}>
                    <span>Total</span>
                    <span style={{ color: 'var(--accent)' }}>${calcResult.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>

                  {calcResult.breakdown.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <h5 style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>OFFER BREAKDOWN</h5>
                      {calcResult.breakdown.map((b) => (
                        <div key={b.offer.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
                          <span>{b.offer.name} ({b.redemptions.toLocaleString()} redemptions)</span>
                          <span style={{ fontWeight: 500 }}>${b.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    className="btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}
                    onClick={() => handleActivate(Math.round(calcResult.totalCost), channel)}
                  >
                    Activate Campaign
                  </button>
                </>
              )}
            </div>

            {/* AI Recommendations */}
            {calcResult.totalCost > 0 && (
              <div className="card">
                <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 12 }}>
                  AI Recommendations
                </h4>
                {calcAiLoading ? (
                  <div>
                    <div className="shimmer" style={{ height: 14, marginBottom: 8, width: '85%' }} />
                    <div className="shimmer" style={{ height: 14, marginBottom: 8, width: '70%' }} />
                    <div className="shimmer" style={{ height: 14, width: '60%' }} />
                  </div>
                ) : (
                  <div className="insight-summary">
                    <ul>
                      {calcAiText.split('\n').map((l) => l.replace(/^[-*]\s*/, '').trim()).filter((l) => l.length > 0).map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── AI Budget Planner ── */}
      {tab === 'planner' && (
        <div className="calculator-layout">
          <div className="card">
            <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Budget Parameters</h4>

            <div className="filter-group" style={{ marginBottom: 16 }}>
              <label>Budget: ${budget.toLocaleString()}</label>
              <input
                type="range"
                min={1000}
                max={100000}
                step={1000}
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
              />
              <div className="range-values">
                <span>$1,000</span>
                <span>$100,000</span>
              </div>
            </div>

            <div className="filter-group" style={{ marginBottom: 16 }}>
              <label>Campaign Goal</label>
              <div className="pill-group">
                {(['conversions', 'reach', 'engagement'] as const).map((g) => (
                  <button
                    key={g}
                    className={`pill ${campaignGoal === g ? 'active' : ''}`}
                    onClick={() => setCampaignGoal(g)}
                  >
                    {g.charAt(0).toUpperCase() + g.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-group">
              <label>Channel Preference</label>
              <div className="pill-group">
                {(['Email', 'SMS', 'Email + SMS'] as const).map((c) => (
                  <button key={c} className={`pill ${channelPref === c ? 'active' : ''}`} onClick={() => setChannelPref(c)}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Optimized Plan</h4>

              {plannerResult.selectedOffers.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                  {plannerResult.sendCost >= budget
                    ? 'Budget is too low to cover send costs. Increase budget or reduce audience size.'
                    : 'Adjust parameters to generate a plan.'}
                </p>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>Send Cost</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>${plannerResult.sendCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>Offer Cost</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>${plannerResult.offerCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)', fontSize: 16, fontWeight: 700 }}>
                    <span>Total</span>
                    <span style={{ color: 'var(--accent)' }}>${plannerResult.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-dim)' }}>Remaining Budget</span>
                    <span style={{ fontWeight: 500, color: '#059669' }}>${plannerResult.remaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>

                  <div style={{ marginTop: 16 }}>
                    <h5 style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>SELECTED OFFERS</h5>
                    {plannerResult.selectedOffers.map((p) => (
                      <div key={p.offer.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 12, borderBottom: '1px solid var(--surface-raised)' }}>
                        <div>
                          <span style={{ fontWeight: 500 }}>{p.offer.name}</span>
                          <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>({p.redemptions.toLocaleString()} est. redemptions)</span>
                        </div>
                        <span style={{ fontWeight: 500 }}>${p.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    ))}
                  </div>

                  <button
                    className="btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}
                    onClick={() => handleActivate(Math.round(plannerResult.totalCost), channelPref)}
                  >
                    Activate Campaign
                  </button>
                </>
              )}
            </div>

            {/* AI Strategy */}
            {plannerResult.selectedOffers.length > 0 && (
              <div className="card">
                <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 12 }}>
                  AI Strategy Insights
                </h4>
                {plannerAiLoading ? (
                  <div>
                    <div className="shimmer" style={{ height: 14, marginBottom: 8, width: '85%' }} />
                    <div className="shimmer" style={{ height: 14, marginBottom: 8, width: '70%' }} />
                    <div className="shimmer" style={{ height: 14, width: '60%' }} />
                  </div>
                ) : (() => {
                  const parsed = parsePlannerAI(plannerAiText);
                  if (parsed) {
                    return (
                      <div className="insight-summary">
                        {parsed.summary && <p style={{ marginBottom: 12 }}>{parsed.summary}</p>}
                        {parsed.offerReasons && (
                          <ul>
                            {parsed.offerReasons.map((r: string, i: number) => <li key={i}>{r}</li>)}
                          </ul>
                        )}
                        {parsed.roiRationale && <p style={{ marginTop: 8, fontStyle: 'italic', color: 'var(--text-dim)' }}>{parsed.roiRationale}</p>}
                        {parsed.tips && (
                          <div style={{ marginTop: 12 }}>
                            <strong style={{ fontSize: 12, color: 'var(--text-muted)' }}>Tips:</strong>
                            <ul>{parsed.tips.map((t: string, i: number) => <li key={i}>{t}</li>)}</ul>
                          </div>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div className="insight-summary">
                      <ul>
                        {plannerAiText.split('\n').map((l) => l.replace(/^[-*]\s*/, '').trim()).filter((l) => l.length > 0).map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Activate Modal ── */}
      {showActivate && (
        <div className="modal-overlay" onClick={() => setShowActivate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Activate Campaign</h3>

            <div className="modal-field">
              <label>Campaign Name</label>
              <input value={activateName} onChange={(e) => setActivateName(e.target.value)} />
            </div>

            <div className="modal-field">
              <label>Destination</label>
              <select value={activateDest} onChange={(e) => setActivateDest(e.target.value as 'Braze' | 'Hightouch')}>
                <option value="Braze">Braze</option>
                <option value="Hightouch">Hightouch</option>
              </select>
            </div>

            <div className="modal-field">
              <label>Channel</label>
              <input value={activateChannel} disabled style={{ background: 'var(--surface-raised)' }} />
            </div>

            <div className="modal-field">
              <label>Budget</label>
              <input value={`$${activateBudget.toLocaleString()}`} disabled style={{ background: 'var(--surface-raised)' }} />
            </div>

            <div className="modal-field">
              <label>Audience</label>
              <input value={`${audienceLabel} (${audienceSize.toLocaleString()})`} disabled style={{ background: 'var(--surface-raised)' }} />
            </div>

            <div className="modal-actions">
              <button className="btn" onClick={() => setShowActivate(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmActivate} disabled={!activateName.trim()}>
                Activate to {activateDest}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
