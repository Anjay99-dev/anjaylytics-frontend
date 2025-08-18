// App.tsx - Updated to match new design
import React, { useEffect, useMemo, useState } from "react";
import './App.css'; // We'll also update the CSS file

// --- Helper Components ---

// This is the row for each investment idea
const IdeaRow = ({ idea }) => (
    <div className="idea-row">
        <div className="idea-confidence">
            <div className="badge">
                {Math.round(idea.p * 100)}% conf.
            </div>
        </div>
        <div className="idea-symbol">
            <div className="font-semibold">{idea.symbol} · {idea.market}</div>
            <div className="text-slate-500">{idea.name}</div>
        </div>
        <div>
            <div className="label">Entry</div>
            <div>${idea.entry.toFixed(1)}</div>
        </div>
        <div>
            <div className="label">Stop / Take</div>
            <div>{idea.stop.toFixed(1)} / {idea.take.toFixed(1)}</div>
        </div>
        <div>
            <div className="label">Expected Value</div>
            <div className="text-green-600 font-semibold">{(idea.ev * 100).toFixed(1)}%</div>
        </div>
        <div>
            <div className="label">Suggested Size</div>
            <div>P{idea.size_bwp}</div>
        </div>
        <div>
            <a href="#" className="details-link">Details</a>
        </div>
    </div>
);

// --- Main App Component ---
export default function App() {
    const [plan, setPlan] = useState(null);
    const [loading, setLoading] = useState(false);
    const API_BASE = import.meta.env.VITE_ANJAYLYTICS_API || "http://localhost:8080";

    // Fetch data from the backend
    useEffect(() => {
        setLoading(true);
        const params = new URLSearchParams({
            daily_budget_pula: "500",
            bankroll_pula: "10000",
            risk: "balanced",
            preset: "Global",
        });

        fetch(`${API_BASE}/plan/today?${params.toString()}`)
            .then(res => res.json())
            .then(data => {
                setPlan(data);
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to fetch plan:", err);
                setLoading(false);
            });
    }, []);

    const totalAlloc = plan?.ideas?.reduce((sum, idea) => sum + idea.size_bwp, 0) || 0;

    return (
        <div className="app-container">
            <header className="app-header">
                <div>
                    <h1 className="title">Daily Investing Coach — MVP</h1>
                    <p className="subtitle">Demo: turns signals into a simple daily plan. (Educational only)</p>
                </div>
                <div className="date-info">
                    Gaborone (UTC+2)
                    <div>Today: {new Date().toLocaleDateString('en-CA')}</div>
                </div>
            </header>

            <main>
                <section className="input-grid">
                    <div className="card">
                        <label htmlFor="daily-budget">Daily budget</label>
                        <div className="input-wrapper">
                            <input id="daily-budget" type="text" defaultValue="500" />
                            <span>Pula</span>
                        </div>
                        <p className="tip">Tip: You planned P500/day now, P250/day later.</p>
                    </div>
                    <div className="card">
                        <label htmlFor="risk-setting">Risk setting</label>
                        <input id="risk-setting" type="range" min="0" max="1" step="0.01" defaultValue="0.5" />
                        <p className="tip">Balanced · Trade threshold ≥ 56% prob</p>
                    </div>
                    <div className="card">
                        <label>Plan summary</label>
                        <div className="summary-value">P{totalAlloc}</div>
                        <p className="tip">Allocated across {plan?.ideas?.length || 0} idea(s) today</p>
                    </div>
                </section>

                <section className="ideas-section">
                    <div className="ideas-header">
                        <h2>Today's ideas</h2>
                        <span>Only showing ideas that pass thresholds</span>
                    </div>
                    <div className="ideas-list">
                        {loading && <p>Loading...</p>}
                        {plan?.ideas?.map(idea => (
                            <IdeaRow key={idea.symbol} idea={idea} />
                        ))}
                         {!loading && (!plan || plan.ideas.length === 0) && (
                            <div className="no-ideas">
                                No-trade day or API unavailable. Holding cash.
                            </div>
                        )}
                    </div>
                </section>
                 <footer className="app-footer">
                    Educational demo only. Not investment advice. Markets are risky; probability and EV here are illustrative.
                </footer>
            </main>
        </div>
    );
}