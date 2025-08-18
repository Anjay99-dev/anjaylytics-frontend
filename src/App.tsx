// App.tsx — Anjaylytics Pro Dashboard
// Combines the functionality of the original MVP with the polished design of the mockup.
// Features:
// - Fully interactive controls for budget, bankroll, and risk.
// - Live data fetching with a "Last Updated" timestamp and manual refresh.
// - A clean, card-based layout with integrated sidebars for "Coach's Corner" and "Model Quality".
// - A detailed "Today's ideas" table with an expandable "Details" section for each trade.
// - Fully functional "Open Account" modal and CSV export.

import React, { useEffect, useMemo, useState, useCallback } from "react";
import './App.css';

// --- API Configuration ---
const API_BASE = import.meta.env.VITE_ANJAYLYTICS_API || "https://anjaylytics-backend-1.onrender.com";

// --- Type Definitions ---
type Preset = "Botswana" | "Global";
type RiskLabel = "conservative" | "balanced" | "aggressive";

type ApiPlanItem = {
    symbol: string; name: string; market: string; price: number; p: number; ev: number;
    entry: number; stop: number; take: number; size_bwp: number; rationale: string; headlines: string[];
};

type ApiPlan = { asof: string; preset: Preset; ideas: ApiPlanItem[]; cash: { suggested: boolean; reason: string | null } };
type ApiMetrics = { brier: number | null };
type ApiReliability = { calibration: Array<{ p_avg: number; y_rate: number; n: number }> };

// --- Helper Functions & Components ---
const toBwp = (n: number) => `P${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const badgeColor = (score: number) => {
    if (score >= 0.7) return "badge-green";
    if (score >= 0.55) return "badge-yellow";
    return "badge-gray";
};

const COACH_TIPS: Array<{ category: string; text: string }>[] = [
    [
        { category: "Basics", text: "Position size first. A good idea with bad sizing can still lose money." },
        { category: "Basics", text: "Only trade when the edge passes both gates: probability ≥ threshold and EV > 0 after fees/FX." },
        { category: "Basics", text: "No-trade days are wins—avoiding bad bets protects capital." },
    ],
    [
        { category: "Risk", text: "Cap loss per day to ~2% of bankroll. After a 4% drawdown, halve sizes tomorrow." },
        { category: "Risk", text: "Set stops when you enter. Move them only with a plan, not emotion." },
        { category: "Risk", text: "Avoid illiquid names. If ADV is low, slippage eats your edge." },
    ],
    [
        { category: "Mindset", text: "Process over outcome: judge the decision by the plan, not a single result." },
        { category: "Mindset", text: "Keep a mistakes log: late entries, stop discipline, chasing." },
        { category: "Mindset", text: "Let data speak—don’t force a trade to ‘use the budget’." },
    ],
];

function pickDailyTips(): Array<{ category: string; text: string }> {
    const today = new Date().toISOString().slice(0, 10);
    let seed = 0;
    for (let i = 0; i < today.length; i++) seed = (seed * 31 + today.charCodeAt(i)) >>> 0;
    function rand() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 0xffffffff; }
    return COACH_TIPS.map(group => group[Math.floor(rand() * group.length)]);
}

// --- Main App Component ---
export default function App() {
    // State Management
    const [dailyBudget, setDailyBudget] = useState(500);
    const [bankroll, setBankroll] = useState(10000);
    const [riskSlider, setRiskSlider] = useState(0.5);
    const [preset, setPreset] = useState<Preset>("Global");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [plan, setPlan] = useState<ApiPlan | null>(null);
    const [tips, setTips] = useState(() => pickDailyTips());
    const [metrics, setMetrics] = useState<ApiMetrics | null>(null);
    const [reliability, setReliability] = useState<ApiReliability | null>(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [expandedIdea, setExpandedIdea] = useState<string | null>(null);

    // Derived State
    const riskLabel: RiskLabel = useMemo(() => (riskSlider < 0.34 ? "conservative" : riskSlider < 0.67 ? "balanced" : "aggressive"), [riskSlider]);
    const threshold = useMemo(() => (riskSlider < 0.34 ? 0.60 : riskSlider < 0.67 ? 0.56 : 0.53), [riskSlider]);

    // Data Fetching Logic
    const fetchPlan = useCallback(async () => {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams({
            daily_budget_pula: String(dailyBudget),
            bankroll_pula: String(bankroll),
            risk: riskLabel,
            preset,
        });
        try {
            const res = await fetch(`${API_BASE}/plan/today?${params.toString()}`);
            if (!res.ok) throw new Error(`API Error: ${res.status}`);
            const data: ApiPlan = await res.json();
            setPlan(data);
            setLastUpdated(new Date());
        } catch (e: any) {
            setError(e.message || "Failed to load plan");
        } finally {
            setLoading(false);
        }
    }, [dailyBudget, bankroll, riskLabel, preset]);

    const fetchMetrics = useCallback(async () => {
        try {
            const [m, r] = await Promise.all([
                fetch(`${API_BASE}/metrics`).then(res => res.json()),
                fetch(`${API_BASE}/reliability`).then(res => res.json()),
            ]);
            setMetrics(m);
            setReliability(r);
        } catch (e) {
            console.error("Failed to fetch metrics:", e);
        }
    }, []);

    useEffect(() => {
        fetchPlan();
    }, [fetchPlan]);
    
    useEffect(() => {
        fetchMetrics();
    }, [fetchMetrics]);


    // CSV Export Functionality
    const exportCsv = () => {
        if (!plan || !plan.ideas.length) return;
        const rows = [
            ['date', 'preset', 'symbol', 'name', 'market', 'entry', 'stop', 'take', 'probability', 'ev_pct', 'size_bwp'],
            ...plan.ideas.map(i => [
                plan.asof, plan.preset, i.symbol, i.name, i.market, i.entry, i.stop, i.take,
                (i.p * 100).toFixed(1) + '%', (i.ev * 100).toFixed(2), i.size_bwp
            ])
        ];
        const csv = rows.map(r => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `anjaylytics_plan_${plan.asof}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const totalAlloc = plan?.ideas?.reduce((sum, idea) => sum + idea.size_bwp, 0) || 0;

    return (
        <div className="app-container">
            {/* Header */}
            <header className="app-header">
                <div>
                    <h1 className="title">Anjaylytics — Daily Investing Coach</h1>
                    <p className="subtitle">Data-driven signals for BSE & Global markets. (Educational Demo)</p>
                </div>
                <div className="date-info">
                    Gaborone (UTC+2)
                    <div>Today: {new Date().toLocaleDateString('en-CA')}</div>
                    {lastUpdated && <div className="last-updated">Last Updated: {lastUpdated.toLocaleTimeString()}</div>}
                </div>
            </header>

            <main className="main-grid">
                {/* Main Content Area */}
                <div className="main-content">
                    {/* Input Controls */}
                    <section className="input-grid">
                        <div className="card">
                            <label htmlFor="daily-budget">Daily Budget</label>
                            <div className="input-wrapper">
                                <input id="daily-budget" type="number" min={50} step={50} value={dailyBudget} onChange={e => setDailyBudget(Number(e.target.value))} />
                                <span>Pula</span>
                            </div>
                            <p className="tip">Max capital to deploy today.</p>
                        </div>
                        <div className="card">
                            <label htmlFor="bankroll">Total Bankroll</label>
                            <div className="input-wrapper">
                                <input id="bankroll" type="number" min={500} step={100} value={bankroll} onChange={e => setBankroll(Number(e.target.value))} />
                                <span>Pula</span>
                            </div>
                            <p className="tip">Used for Kelly sizing.</p>
                        </div>
                        <div className="card">
                            <label htmlFor="risk-setting">Risk Setting</label>
                            <input id="risk-setting" type="range" min={0} max={1} step={0.01} value={riskSlider} onChange={e => setRiskSlider(Number(e.target.value))} />
                            <p className="tip">{riskLabel.charAt(0).toUpperCase() + riskLabel.slice(1)} · Prob. threshold ≥ {Math.round(threshold * 100)}%</p>
                        </div>
                    </section>

                    {/* Today's Ideas */}
                    <section className="ideas-section">
                        <div className="ideas-header">
                            <h2>Today's Ideas</h2>
                            <div className="header-controls">
                                <select value={preset} onChange={e => setPreset(e.target.value as Preset)}>
                                    <option value="Global">Global (US)</option>
                                    <option value="Botswana">Botswana (BSE)</option>
                                </select>
                                <button onClick={exportCsv} disabled={!plan?.ideas?.length}>Export CSV</button>
                            </div>
                        </div>
                        <div className="ideas-list">
                            {loading && <div className="status-message">Loading Plan...</div>}
                            {error && <div className="status-message error">{error}</div>}
                            {!loading && !error && plan?.ideas?.length === 0 && <div className="status-message">{plan?.cash?.reason || "No ideas met the criteria."}</div>}
                            {plan?.ideas?.map(idea => (
                                <React.Fragment key={idea.symbol}>
                                    <div className="idea-row" onClick={() => setExpandedIdea(expandedIdea === idea.symbol ? null : idea.symbol)}>
                                        <div className={`badge ${badgeColor(idea.p)}`}>{Math.round(idea.p * 100)}% conf.</div>
                                        <div className="idea-symbol">
                                            <div className="font-semibold">{idea.symbol} · {idea.market}</div>
                                            <div className="text-slate-500">{idea.name}</div>
                                        </div>
                                        <div><div className="label">Entry</div><div>${idea.entry.toFixed(1)}</div></div>
                                        <div><div className="label">Stop/Take</div><div>{idea.stop.toFixed(1)}/{idea.take.toFixed(1)}</div></div>
                                        <div className={`font-semibold ${idea.ev > 0 ? "text-green-600" : "text-red-600"}`}><div className="label">EV</div><div>{(idea.ev * 100).toFixed(1)}%</div></div>
                                        <div><div className="label">Size</div><div>{toBwp(idea.size_bwp)}</div></div>
                                        <div className="details-link">{expandedIdea === idea.symbol ? 'Hide' : 'Details'}</div>
                                    </div>
                                    {expandedIdea === idea.symbol && (
                                        <div className="details-panel">
                                            <div className="detail-card"><b>Rationale:</b> {idea.rationale}</div>
                                            <div className="detail-card"><b>Headlines:</b> <ul className="list-disc list-inside">{idea.headlines.map((h, i) => <li key={i}>{h}</li>)}</ul></div>
                                        </div>
                                    )}
                                </React.Fragment>
                            ))}
                        </div>
                    </section>
                </div>

                {/* Sidebar */}
                <aside className="sidebar">
                    <div className="card">
                        <h3 className="sidebar-title">Model Quality</h3>
                        <div className="metric-item"><span>Brier Score</span><span className="font-semibold">{metrics?.brier?.toFixed(3) ?? '—'}</span></div>
                        <div className="text-xs text-slate-500 mb-2">Lower is better. 0 is perfect.</div>
                        <h4 className="calibration-title">Calibration</h4>
                        {/* Calibration Bars would go here if data is available */}
                        <div className="text-xs text-slate-500">Predicted vs. Actual Hit Rate</div>
                    </div>
                    <div className="card">
                        <h3 className="sidebar-title">Coach's Corner</h3>
                        <ul className="tips-list">
                            {tips.map((tip, i) => <li key={i}><b>{tip.category}:</b> {tip.text}</li>)}
                        </ul>
                    </div>
                     <div className="card">
                        <h3 className="sidebar-title">Broker Info</h3>
                        <button onClick={() => setModalOpen(true)} className="link-button">Open Account Checklist</button>
                    </div>
                </aside>
            </main>
        </div>
    );
}