// App.tsx — Anjaylytics — React Dashboard (MVP v7) final
// - Metrics mini-tiles at top (Brier)
// - Verified broker URLs for Botswana + Global
// - "Open Account" checklist modal
// - Coach Tips + Metrics sidebar
// - Works with API endpoints: /plan/today, /metrics, /reliability, /trade/export

import React, { useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_ANJAYLYTICS_API || "http://localhost:8080";

// Coach tips (rotates daily; simple shuffle)
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
  [
    { category: "Botswana", text: "Local hours: BSE 10:25–12:05 & 12:15–14:00 (Gaborone). Size conservatively due to liquidity." },
    { category: "Botswana", text: "US session: ~15:30–22:00 (Gaborone). Fractional shares help with P250–P500 tickets." },
    { category: "Botswana", text: "Keep FX in mind: BWP⇄USD costs (30–80 bps) reduce your EV on global trades." },
  ],
  [
    { category: "Quotes", text: "\"The goal of a successful trader is to make the best trades. Money is secondary.\" — Alexander Elder" },
    { category: "Quotes", text: "\"Risk comes from not knowing what you’re doing.\" — Warren Buffett" },
    { category: "Quotes", text: "\"Amateurs think about how much they can make. Pros think about how much they could lose.\" — Jack Schwager" },
  ],
];

function pickDailyTips(): Array<{ category: string; text: string }> {
  const today = new Date().toISOString().slice(0, 10);
  let seed = 0;
  for (let i = 0; i < today.length; i++) seed = (seed * 31 + today.charCodeAt(i)) >>> 0;
  function rand() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 0xffffffff; }
  return COACH_TIPS.map(group => group[Math.floor(rand() * group.length)]);
}

type Preset = "Botswana" | "Global";

type ApiPlanItem = {
  symbol: string; name: string; market: string; price: number; p: number; ev: number;
  entry: number; stop: number; take: number; size_bwp: number; rationale: string; headlines: string[];
};

type ApiPlan = { asof: string; preset: Preset; ideas: ApiPlanItem[]; cash: { suggested: boolean; reason: string | null } };

type ApiMetrics = { brier: number | null };
type ApiReliability = { calibration: Array<{ p_avg: number; y_rate: number; n: number }> };

function toBwp(n: number) { return `P${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`; }
function badgeColor(score: number) { if (score >= 0.7) return "bg-green-600 text-white"; if (score >= 0.55) return "bg-yellow-500 text-black"; return "bg-gray-300 text-gray-900"; }

function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: any }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/30 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-5" onClick={e => e.stopPropagation()}>
        {children}
        <div className="mt-4 text-right">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-xl bg-slate-100 hover:bg-slate-200">Close</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [dailyBudget, setDailyBudget] = useState(500);
  const [bankroll, setBankroll] = useState(10000);
  const [riskSlider, setRiskSlider] = useState(0.5);
  const [preset, setPreset] = useState<Preset>("Global");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<ApiPlan | null>(null);
  const [tips, setTips] = useState(() => pickDailyTips());
  const [metrics, setMetrics] = useState<ApiMetrics | null>(null);
  const [reliability, setReliability] = useState<ApiReliability | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const riskLabel = useMemo(() => (riskSlider < 0.34 ? "conservative" : riskSlider < 0.67 ? "balanced" : "aggressive"), [riskSlider]);
  const threshold = useMemo(() => (riskSlider < 0.34 ? 0.60 : riskSlider < 0.67 ? 0.56 : 0.53), [riskSlider]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const params = new URLSearchParams({ daily_budget_pula: String(dailyBudget), bankroll_pula: String(bankroll), risk: riskLabel, preset });
        const res = await fetch(`${API_BASE}/plan/today?${params.toString()}`, { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: ApiPlan = await res.json();
        if (!cancelled) setPlan(data);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load plan");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [dailyBudget, bankroll, riskLabel, preset]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [m, r] = await Promise.all([
          fetch(`${API_BASE}/metrics`).then(res => res.json()),
          fetch(`${API_BASE}/reliability`).then(res => res.json()),
        ]);
        if (!cancelled) { setMetrics(m); setReliability(r); }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);
  const ideas = plan?.ideas ?? [];
  const totalAlloc = ideas.reduce((s, x) => s + (x.size_bwp || 0), 0);
  const LINKS = {
    imara: "https://www.imara.com/imara-capital-securities/",
    motswedi: "https://www.motswedi.co.bw/",
    stockbrokers: "https://sbb.bw/",
    ibkr_open: "https://www.interactivebrokers.com/en/pagemap/pagemap_newaccounts_inst.php",
    ibkr_guide: "https://www.interactivebrokers.com/en/accounts/account-guide.php",
    ee_home: "https://www.easyequities.co.za/",
    ee_usd_help: "https://support.easyequities.co.za/support/solutions/folders/13000007925",
  } as const;
  function exportCsv() {
    const rows = [
      ['date','preset','symbol','name','market','entry','stop','take','confidence','expected_%','size_P'],
      ...ideas.map(i => [
        plan?.asof ?? new Date().toISOString().slice(0,10), preset, i.symbol, i.name, i.market, i.entry, i.stop, i.take,
        (i.p*100).toFixed(1)+'%', (i.ev*100).toFixed(2), i.size_bwp
      ])
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `anjaylytics_plan_${(plan?.asof ?? new Date().toISOString().slice(0,10))}.csv`; a.click();
    URL.revokeObjectURL(url);
  }
  function CalibrationBars() {
    const bins = reliability?.calibration || [];
    if (!bins.length) return <div className="text-xs text-slate-500">No calibration data yet.</div>;
    return (
      <div className="space-y-1">
        {bins.slice(1, bins.length-1).map((b, idx) => (
          <div key={idx} className="grid grid-cols-6 items-center gap-2 text-xs">
            <div className="col-span-2 text-slate-600">p≈{(b.p_avg*100).toFixed(0)}%</div>
            <div className="col-span-4 bg-slate-200 rounded h-2 relative">
              <div className="absolute left-0 top-0 h-2 rounded" style={{ width: `${Math.max(0, Math.min(100, b.p_avg*100))}%`, background: '#a3bffa' }} />
              <div className="absolute left-0 top-0 h-2 rounded opacity-70" style={{ width: `${Math.max(0, Math.min(100, b.y_rate*100))}%`, background: '#10b981' }} />
            </div>
          </div>
        ))}
        <div className="text-[10px] text-slate-500">Blue = predicted · Green = actual hit-rate</div>
      </div>
    );
  }
  function OpenAccountContent() {
    return (
      <div>
        <h3 className="text-lg font-semibold mb-2">Open an investing account</h3>
        <p className="text-sm text-slate-600 mb-3">Documents usually required (varies by platform):</p>
        <ul className="list-disc list-inside text-sm text-slate-800 space-y-1">
          <li>Valid ID or passport</li>
          <li>Proof of residence (utility bill or bank statement)</li>
          <li>Proof of income (payslip or employer letter)</li>
          <li>Bank details for funding/withdrawals</li>
          <li>CSDB/broker forms (for BSE brokers)</li>
        </ul>
        <div className="mt-4 grid grid-cols-1 gap-2 text-sm">
          <a className="text-indigo-600 hover:underline" href={LINKS.imara} target="_blank" rel="noreferrer">Imara Capital Securities (BSE)</a>
          <a className="text-indigo-600 hover:underline" href={LINKS.motswedi} target="_blank" rel="noreferrer">Motswedi Securities (BSE)</a>
          <a className="text-indigo-600 hover:underline" href={LINKS.stockbrokers} target="_blank" rel="noreferrer">Stockbrokers Botswana (BSE)</a>
          <a className="text-indigo-600 hover:underline" href={LINKS.ibkr_open} target="_blank" rel="noreferrer">Interactive Brokers — Open an Account</a>
          <a className="text-indigo-600 hover:underline" href={LINKS.ibkr_guide} target="_blank" rel="noreferrer">Interactive Brokers — Account Guide</a>
          <a className="text-indigo-600 hover:underline" href={LINKS.ee_home} target="_blank" rel="noreferrer">EasyEquities — Home</a>
          <a className="text-indigo-600 hover:underline" href={LINKS.ee_usd_help} target="_blank" rel="noreferrer">EasyEquities — International (USD) Help</a>
        </div>
        <p className="text-[11px] text-slate-500 mt-3">Links are to official sites. Verify fees, residency eligibility, and regulation.</p>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white grid place-items-center font-bold">A</div>
            <div>
              <h1 className="text-2xl font-bold">Anjaylytics — Daily Coach</h1>
              <p className="text-sm text-slate-600">Real signals with probabilities, EV, and right-sized tickets.</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <select value={preset} onChange={(e) => setPreset(e.target.value as Preset)} className="rounded-xl border p-2 text-sm">
              <option value="Global">Global (US)</option>
              <option value="Botswana">Botswana (BSE)</option>
            </select>
            <div className="text-right">
              <div className="text-xs text-slate-500">Gaborone (UTC+2)</div>
              <div className="text-xs text-slate-500">Today: {new Date().toLocaleDateString()}</div>
            </div>
          </div>
        </header>
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-2xl shadow p-4">
            <div className="text-xs text-slate-500">Brier score (overall)</div>
            <div className="text-2xl font-bold">{metrics?.brier != null ? Number(metrics.brier).toFixed(3) : '—'}</div>
            <div className="text-[11px] text-slate-500">Lower is better (0 is perfect).</div>
          </div>
          <div className="bg-white rounded-2xl shadow p-4">
            <div className="text-xs text-slate-500">Ideas today</div>
            <div className="text-2xl font-bold">{plan?.ideas?.length ?? 0}</div>
            <div className="text-[11px] text-slate-500">Passing prob & EV gates</div>
          </div>
          <div className="bg-white rounded-2xl shadow p-4">
            <div className="text-xs text-slate-500">Planned allocation</div>
            <div className="text-2xl font-bold">{`P${totalAlloc.toLocaleString()}`}</div>
            <div className="text-[11px] text-slate-500">Based on capped Kelly sizing</div>
          </div>
        </section>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3 space-y-6">
            <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-2xl shadow p-4">
                <div className="text-sm font-semibold mb-2">Daily budget</div>
                <div className="flex items-center gap-3">
                  <input type="number" className="w-40 rounded-xl border p-2" min={50} step={50} value={dailyBudget} onChange={(e) => setDailyBudget(Number(e.target.value))} />
                  <span className="text-slate-500">Pula</span>
                </div>
                <p className="text-xs text-slate-500 mt-2">P500/day now → P250/day later.</p>
              </div>
              <div className="bg-white rounded-2xl shadow p-4">
                <div className="text-sm font-semibold mb-2">Bankroll</div>
                <div className="flex items-center gap-3">
                  <input type="number" className="w-40 rounded-xl border p-2" min={500} step={100} value={bankroll} onChange={(e) => setBankroll(Number(e.target.value))} />
                  <span className="text-slate-500">Pula</span>
                </div>
              </div>
              <div className="bg-white rounded-2xl shadow p-4">
                <div className="text-sm font-semibold mb-2">Risk setting</div>
                <input type="range" min={0} max={1} step={0.01} value={riskSlider} onChange={(e) => setRiskSlider(Number(e.target.value))} className="w-full" />
                <div className="text-xs text-slate-500 mt-2">{riskSlider < 0.34 ? "Conservative" : riskSlider < 0.67 ? "Balanced" : "Aggressive"} · threshold ≥ {Math.round(threshold * 100)}%</div>
              </div>
              <div className="bg-white rounded-2xl shadow p-4">
                <div className="text-sm font-semibold mb-2">Plan summary</div>
                <div className="text-xl font-bold">{`P${totalAlloc.toLocaleString()}`}</div>
                <div className="text-xs text-slate-500">Across {ideas.length} idea(s) today</div>
                <button onClick={exportCsv} className="mt-2 text-indigo-600 hover:underline text-sm">Export CSV</button>
              </div>
            </section>
            {loading && <div className="text-sm text-slate-500">Loading today’s plan…</div>}
            {error && <div className="text-sm text-red-600">{error}. Using zero ideas until API responds.</div>}
            <section className="bg-white rounded-2xl shadow overflow-hidden">
              <div className="p-4 border-b flex items-center justify-between">
                <h2 className="font-semibold">Today’s ideas</h2>
                <div className="text-xs text-slate-500">Passing only (prob & EV gates)</div>
              </div>
              {(!ideas || ideas.length === 0) ? (
                <div className="p-6 text-sm text-slate-600">{plan?.cash?.reason || "No-trade day or API unavailable. Holding cash."}</div>
              ) : (
                <ul>
                  {ideas.map((i) => (
                    <li key={i.symbol} className="p-4 border-b last:border-b-0 hover:bg-slate-50">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className={`px-2 py-1 rounded-full text-xs ${badgeColor(i.p)}`}>{Math.round(i.p * 100)}% conf.</div>
                          <div>
                            <div className="font-semibold">{i.symbol} <span className="text-slate-400">· {i.market}</span></div>
                            <div className="text-xs text-slate-500">{i.name}</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                          <div>
                            <div className="text-slate-500">Entry</div>
                            <div className="font-medium">${i.entry}</div>
                          </div>
                          <div>
                            <div className="text-slate-500">Stop / Take</div>
                            <div className="font-medium">{i.stop} / {i.take}</div>
                          </div>
                          <div>
                            <div className="text-slate-500">Expected Value</div>
                            <div className={`font-medium ${i.ev > 0 ? "text-green-600" : "text-red-600"}`}>{(i.ev * 100).toFixed(1)}%</div>
                          </div>
                          <div>
                            <div className="text-slate-500">Suggested Size</div>
                            <div className="font-medium">{toBwp(i.size_bwp)}</div>
                          </div>
                          <div>
                            <details className="text-sm">
                              <summary className="text-indigo-600 cursor-pointer">Details</summary>
                              <div className="mt-2 grid md:grid-cols-3 gap-4">
                                <div className="bg-slate-100 rounded-xl p-3">
                                  <div className="font-semibold mb-1">Why this?</div>
                                  <p className="text-slate-700 leading-relaxed">{i.rationale}</p>
                                </div>
                                <div className="bg-slate-100 rounded-xl p-3">
                                  <div className="font-semibold mb-1">Recent signals</div>
                                  <ul className="list-disc list-inside text-slate-700">{i.headlines.map((h, idx) => (<li key={idx}>{h}</li>))}</ul>
                                </div>
                                <div className="bg-slate-100 rounded-xl p-3">
                                  <div className="font-semibold mb-1">Risk plan</div>
                                  <ul className="list-disc list-inside text-slate-700">
                                    <li>Hard stop {i.stop}</li>
                                    <li>Take profit {i.take}</li>
                                    <li>Max loss per day ~2% of bankroll</li>
                                  </ul>
                                </div>
                              </div>
                            </details>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
          <aside className="lg:col-span-1 space-y-6">
            <section className="bg-white rounded-2xl shadow p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">Model quality</h3>
                <button onClick={() => { setMetrics(null); setReliability(null); fetch(`${API_BASE}/metrics`).then(r=>r.json()).then(setMetrics); fetch(`${API_BASE}/reliability`).then(r=>r.json()).then(setReliability); }} className="text-xs text-indigo-600 hover:underline">Refresh</button>
              </div>
              <div className="text-sm">
                <div className="flex items-center justify-between"><span className="text-slate-500">Brier score</span><span className="font-medium">{metrics?.brier != null ? Number(metrics.brier).toFixed(3) : '—'}</span></div>
              </div>
              <div className="mt-3"><CalibrationBars /></div>
              <div className="mt-2 text-[11px] text-slate-500">Lower Brier is better. Bars show predicted vs. actual hit-rate.</div>
            </section>
            <section className="bg-white rounded-2xl shadow p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">Coach’s Corner</h3>
                <button onClick={() => setTips(pickDailyTips())} className="text-xs text-indigo-600 hover:underline" title="Shuffle tips">Shuffle</button>
              </div>
              <ul className="space-y-3">{tips.map((t, idx) => (<li key={idx} className="text-sm"><span className="inline-block px-2 py-0.5 text-xs rounded-full bg-slate-200 mr-2">{t.category}</span><span className="text-slate-700">{t.text}</span></li>))}</ul>
              <div className="text-[11px] text-slate-500 mt-3">Designed for Botswana investors — practical, real-market tips that update daily.</div>
            </section>
            <section className="bg-white rounded-2xl shadow p-4">
              <div className="flex items_center justify-between mb-2">
                <h3 className="font-semibold">Investing shortcuts (Botswana)</h3>
                <button onClick={() => setModalOpen(true)} className="text-xs text-indigo-600 hover:underline">Open account…</button>
              </div>
              <ul className="space-y-2 text-sm">
                <li><a className="text-indigo-600 hover:underline" href={LINKS.imara} target="_blank" rel="noreferrer">Imara Capital Securities</a><span className="text-slate-500"> — BSE broker</span></li>
                <li><a className="text-indigo-600 hover:underline" href={LINKS.motswedi} target="_blank" rel="noreferrer">Motswedi Securities</a><span className="text-slate-500"> — BSE broker & research</span></li>
                <li><a className="text-indigo-600 hover:underline" href={LINKS.stockbrokers} target="_blank" rel="noreferrer">Stockbrokers Botswana</a><span className="text-slate-500"> — BSE member</span></li>
                <li className="pt-2 border-t mt-2"><a className="text-indigo-600 hover:underline" href={LINKS.ibkr_open} target="_blank" rel="noreferrer">Interactive Brokers (IBKR) — Open</a><span className="text-slate-500"> — Global broker (fractionals)</span></li>
                <li><a className="text-indigo-600 hover:underline" href={LINKS.ee_home} target="_blank" rel="noreferrer">EasyEquities (USD account)</a><span className="text-slate-500"> — See USD help</span></li>
              </ul>
              <div className="mt-3">
                <div className="text-xs font-semibold mb-1">Docs checklist</div>
                <ul className="list-disc list-inside text-xs text-slate-700 space-y-1">
                  <li>Valid ID or passport</li>
                  <li>Proof of residence (utility bill/bank statement)</li>
                  <li>Proof of income (payslip/employer letter)</li>
                  <li>Bank details for funding/withdrawals</li>
                  <li>CSDB/broker forms as required</li>
                </ul>
              </div>
              <a href={`${API_BASE}/trade/export?daily_budget_pula=${dailyBudget}&bankroll_pula=${bankroll}&risk=${riskLabel}&preset=${preset}`} className="inline-block mt-3 text-indigo-600 hover:underline text-sm">Download IBKR CSV</a>
            </section>
          </aside>
        </div>
        <footer className="text-xs text-slate-500 mt-6">
          <p>© {new Date().getFullYear()} Anjaylytics. Signals are generated from data and models; markets are risky.</p>
        </footer>
      </div>
      <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
        <OpenAccountContent />
      </Modal>
    </div>
  );
}