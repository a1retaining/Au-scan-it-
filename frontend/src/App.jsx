import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock3,
  Database,
  Headphones,
  Lock,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  XCircle,
  Zap,
} from 'lucide-react';
import './styles.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '');
const AUTO_REFRESH_MS = Number(import.meta.env.VITE_AUTO_REFRESH_MS || 60000);
const BUILD_ID = 'AU-ASX-INSTITUTIONAL-DESK-V19';

const fallbackSignals = [
  { ticker: 'CBA', name: 'Commonwealth Bank', sector: 'Banks', score: 88, confidence: 82, status: 'REVIEW', setup: 'Pullback to value', price: 123.4, entry: 123.2, stop: 119.8, target: 132.7, rr: 2.79, volume: 1.3, change: 0.8, keyZone: '$122.40 to $124.10', why: ['Trend structure still positive', 'Banks sector holding up better than market', 'Price is near a defined buy zone'], risks: ['Market is closed, no entry now', 'Needs fresh liquidity check at open'] },
  { ticker: 'BHP', name: 'BHP Group', sector: 'Materials', score: 84, confidence: 78, status: 'REVIEW', setup: 'Breakout watch', price: 45.12, entry: 45.3, stop: 43.7, target: 49.1, rr: 2.38, volume: 1.1, change: 0.5, keyZone: '$44.90 to $45.40', why: ['Materials heatmap is strong', 'Entry is close to resistance break', 'Risk is defined'], risks: ['Commodity-sensitive', 'Needs iron ore confirmation'] },
  { ticker: 'WES', name: 'Wesfarmers', sector: 'Consumer', score: 72, confidence: 67, status: 'WATCH', setup: 'Base forming', price: 67.8, entry: 68.5, stop: 66.2, target: 72.8, rr: 1.87, volume: 0.9, change: 0.2, keyZone: '$67.90 to $68.70', why: ['Base structure is improving'], risks: ['Reward is below 2R', 'Volume not strong enough'] },
  { ticker: 'CSL', name: 'CSL Limited', sector: 'Healthcare', score: 51, confidence: 48, status: 'BLOCKED', setup: 'Weak relative strength', price: 284.1, entry: 291, stop: 279, target: 306, rr: 1.25, volume: 0.8, change: -0.9, keyZone: 'No clean buy zone', why: ['High quality company, poor current setup'], risks: ['Sector weak', 'No entry trigger', 'Below trade threshold'] },
];

const sectors = [
  { name: 'Banks', strength: 84, flow: '+1.2%', state: 'Leading', leaders: 'CBA, NAB, WBC' },
  { name: 'Materials', strength: 77, flow: '+0.8%', state: 'Strong', leaders: 'BHP, RIO, FMG' },
  { name: 'Gold', strength: 73, flow: '+0.6%', state: 'Strong', leaders: 'NEM, NST, EVN' },
  { name: 'Energy', strength: 55, flow: '+0.1%', state: 'Mixed', leaders: 'WDS, STO' },
  { name: 'Tech', strength: 61, flow: '+0.4%', state: 'Watch', leaders: 'XRO, WTC' },
  { name: 'Healthcare', strength: 38, flow: '-0.7%', state: 'Weak', leaders: 'RMD, COH' },
  { name: 'Lithium', strength: 29, flow: '-1.6%', state: 'Avoid', leaders: 'PLS, MIN' },
  { name: 'REITs', strength: 49, flow: '-0.1%', state: 'Rate risk', leaders: 'GMG, SCG' },
];

const defaultClock = { session: 'Closed', is_open: false, seconds_to_open: 0, seconds_to_close: 0, now_sydney: '' };
const defaultPaper = { starting_cash: 5000, cash: 5000, equity: 5000, open_risk: 0, open_positions: [], closed_trades: [] };

function money(value) {
  const n = Number(value || 0);
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function compactMoney(value) {
  const n = Number(value || 0);
  if (Math.abs(n) >= 1000000) return `$${(n / 1000000).toFixed(1)}m`;
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return money(n);
}
function countdown(seconds) {
  const s = Math.max(0, Number(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}
function normaliseSignal(s) {
  const entry = Number(s.entry || s.close || s.price || 0);
  const stop = Number(s.stop || s.stop_loss || entry * 0.97);
  const target = Number(s.target || entry * 1.06);
  const score = Math.round(Number(s.score || s.total_score || 0));
  const rr = Number(s.risk_reward || s.rr || ((target - entry) / Math.max(entry - stop, 0.01)));
  return {
    ticker: s.ticker,
    name: s.name || s.ticker,
    sector: s.sector || 'Unknown',
    score,
    confidence: Math.round(Number(s.confidence || s.strength || Math.min(99, score + 2))),
    status: s.status || (score >= 82 ? 'REVIEW' : score >= 70 ? 'WATCH' : 'BLOCKED'),
    setup: s.setup || s.pattern || 'ASX scan candidate',
    price: entry,
    entry,
    stop,
    target,
    rr,
    volume: Number(s.volume_multiple || s.volume_ratio || 0),
    change: Number(s.change_pct || s.change || 0),
    keyZone: s.key_zone || s.buy_zone || `${money(entry * 0.995)} to ${money(entry * 1.005)}`,
    why: s.reasons || s.why || [],
    risks: [...(s.risks || []), ...(s.blockers || [])],
  };
}
function buildChart(seed = 100) {
  const rows = [];
  for (let i = 0; i < 80; i += 1) {
    const trend = i * 0.12;
    const wave = Math.sin(i / 5) * 1.6;
    const price = seed + trend + wave;
    rows.push({ day: i + 1, price: Number(price.toFixed(2)), ma20: Number((price - 0.9 + Math.sin(i / 10)).toFixed(2)), vol: Math.round(700000 + Math.sin(i) * 120000 + i * 2000) });
  }
  return rows;
}

let audioContext = null;
function getAudio() {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioContext) audioContext = new AC();
  return audioContext;
}
async function unlockAudio() {
  const ctx = getAudio();
  if (ctx && ctx.state === 'suspended') await ctx.resume();
  return Boolean(ctx);
}
function tone(type = 'entry') {
  const ctx = getAudio();
  if (!ctx || ctx.state !== 'running') return;
  const map = { entry: [880, 1100], exit: [520, 390], stop: [250, 170], target: [700, 900, 1100] };
  (map[type] || map.entry).forEach((freq, index) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const start = ctx.currentTime + index * 0.11;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.06, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.1);
    osc.start(start);
    osc.stop(start + 0.11);
  });
}
function speak(text) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.92;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

function StatusPill({ status }) {
  const clean = String(status || 'WATCH').toUpperCase();
  return <span className={`status ${clean.toLowerCase()}`}>{clean}</span>;
}
function Metric({ label, value, sub, toneClass = '' }) {
  return <div className={`metric ${toneClass}`}><span>{label}</span><strong>{value}</strong>{sub && <small>{sub}</small>}</div>;
}
function ScoreBar({ value }) {
  return <div className="scorebar"><i style={{ width: `${Math.max(0, Math.min(100, Number(value || 0)))}%` }} /></div>;
}

function TopBar({ clock, paper, signals, apiState, lastRefresh, paused, setPaused, refresh, audioArmed }) {
  const open = Boolean(clock?.is_open);
  const ready = signals.filter((s) => ['READY', 'ARMED', 'REVIEW'].includes(String(s.status).toUpperCase())).length;
  return (
    <div className="topbar">
      <div className="brandBlock">
        <div className="buildTag">{BUILD_ID}</div>
        <h1>AUSTRALIAN INSTITUTIONAL TRADE DESK</h1>
        <p>{apiState} · last refresh {lastRefresh || 'never'} · sound {audioArmed ? 'armed' : 'arms on first click'}</p>
      </div>
      <div className="topMetrics">
        <Metric label="ASX session" value={open ? 'OPEN' : 'CLOSED'} sub={open ? `closes in ${countdown(clock?.seconds_to_close)}` : `opens in ${countdown(clock?.seconds_to_open)}`} toneClass={open ? 'good' : 'warn'} />
        <Metric label="Signal book" value={signals.length} sub={`${ready} reviewable`} />
        <Metric label="Paper book" value={money(paper?.equity ?? 5000)} sub="$5,000 start" />
        <Metric label="Next refresh" value={`${AUTO_REFRESH_MS / 1000}s`} sub={paused ? 'paused' : 'running'} />
      </div>
      <div className="topActions">
        <button onClick={refresh}><RefreshCw size={16} />Scan</button>
        <button onClick={() => setPaused((p) => !p)} className={paused ? 'run' : 'hold'}>{paused ? <Play size={16} /> : <Pause size={16} />}{paused ? 'Resume' : 'Pause'}</button>
      </div>
    </div>
  );
}

function PriorityQueue({ signals, selected, setSelected }) {
  return (
    <aside className="queuePanel">
      <div className="panelTitle"><Zap size={18} /><span>Priority Queue</span></div>
      <div className="queueList">
        {signals.slice(0, 12).map((s, idx) => (
          <button key={s.ticker} className={`queueRow ${selected?.ticker === s.ticker ? 'active' : ''}`} onClick={() => setSelected(s)}>
            <div className="rank">{idx + 1}</div>
            <div className="qMain"><strong>{s.ticker}</strong><small>{s.setup}</small></div>
            <div className="qScore"><b>{s.score}</b><StatusPill status={s.status} /></div>
          </button>
        ))}
      </div>
      <div className="riskBox">
        <div className="panelTitle"><ShieldCheck size={17} /><span>Desk Rules</span></div>
        <ul>
          <li>Paper execution only until proof.</li>
          <li>Closed market = review only, no entry.</li>
          <li>Costs and slippage must be included.</li>
          <li>No signal without stop, target and reason.</li>
        </ul>
      </div>
    </aside>
  );
}

function SignalBook({ signals, selected, setSelected }) {
  return (
    <div className="signalBook">
      <div className="panelTitle"><Activity size={18} /><span>Signal Blotter</span><em>click a row to update chart and trade plan</em></div>
      <div className="tableWrap">
        <table>
          <thead><tr><th>Ticker</th><th>Sector</th><th>Setup</th><th>Score</th><th>Confidence</th><th>Entry</th><th>Stop</th><th>Target</th><th>R/R</th><th>Status</th></tr></thead>
          <tbody>
            {signals.map((s) => (
              <tr key={s.ticker} className={selected?.ticker === s.ticker ? 'selected' : ''} onClick={() => setSelected(s)}>
                <td><b>{s.ticker}</b><small>{s.name}</small></td>
                <td>{s.sector}</td>
                <td>{s.setup}</td>
                <td><b>{s.score}</b><ScoreBar value={s.score} /></td>
                <td>{s.confidence}</td>
                <td>{money(s.entry)}</td>
                <td className="dangerText">{money(s.stop)}</td>
                <td className="goodText">{money(s.target)}</td>
                <td>{Number(s.rr || 0).toFixed(2)}R</td>
                <td><StatusPill status={s.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DeskChart({ selected, chart }) {
  const data = chart?.length ? chart : buildChart(Number(selected?.entry || 100));
  return (
    <section className="chartPanel">
      <div className="chartHeader">
        <div>
          <h2>{selected?.ticker || 'No ticker'} <span>{selected?.name}</span></h2>
          <p>{selected?.sector} · {selected?.setup} · buy zone {selected?.keyZone}</p>
        </div>
        <div className="chartStats"><StatusPill status={selected?.status} /><b>{selected?.score || 0}</b></div>
      </div>
      <div className="chartBox">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <CartesianGrid stroke="rgba(148,163,184,.12)" vertical={false} />
            <XAxis dataKey="day" tick={{ fill: '#7b8aaa', fontSize: 11 }} />
            <YAxis yAxisId="price" domain={['dataMin - 2', 'dataMax + 2']} tick={{ fill: '#7b8aaa', fontSize: 11 }} />
            <YAxis yAxisId="vol" orientation="right" hide />
            <Tooltip contentStyle={{ background: '#08111f', border: '1px solid #25416a', color: '#eaf2ff' }} />
            {selected?.entry ? <ReferenceLine yAxisId="price" y={selected.entry} stroke="#39a7ff" strokeDasharray="5 4" label={{ value: 'ENTRY', fill: '#39a7ff', position: 'insideTopRight' }} /> : null}
            {selected?.stop ? <ReferenceLine yAxisId="price" y={selected.stop} stroke="#ff4d6d" strokeDasharray="5 4" label={{ value: 'STOP', fill: '#ff4d6d', position: 'insideBottomRight' }} /> : null}
            {selected?.target ? <ReferenceLine yAxisId="price" y={selected.target} stroke="#26d07c" strokeDasharray="5 4" label={{ value: 'TARGET', fill: '#26d07c', position: 'insideTopRight' }} /> : null}
            <Bar yAxisId="vol" dataKey="vol" fill="rgba(57,167,255,.18)" />
            <Area yAxisId="price" type="monotone" dataKey="price" stroke="#39a7ff" fill="rgba(57,167,255,.14)" strokeWidth={2.5} />
            <Line yAxisId="price" type="monotone" dataKey="ma20" stroke="#f5c542" strokeWidth={1.5} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function TradePlan({ selected, clock, onPaper, onRead }) {
  const canEnter = Boolean(clock?.is_open) && ['READY', 'ARMED', 'REVIEW'].includes(String(selected?.status).toUpperCase());
  const risk = Math.max(Number(selected?.entry || 0) - Number(selected?.stop || 0), 0);
  const roundTrip = 19 + 2.5;
  const maxRisk = 25;
  const qty = risk > 0 ? Math.floor(Math.max(0, maxRisk - roundTrip) / risk) : 0;
  return (
    <aside className="planPanel">
      <div className="panelTitle"><Bell size={18} /><span>Trade Plan</span></div>
      <div className="planTicker"><h2>{selected?.ticker}</h2><StatusPill status={selected?.status} /></div>
      <div className="planGrid">
        <Metric label="Entry" value={money(selected?.entry)} />
        <Metric label="Stop" value={money(selected?.stop)} toneClass="bad" />
        <Metric label="Target" value={money(selected?.target)} toneClass="good" />
        <Metric label="R/R" value={`${Number(selected?.rr || 0).toFixed(2)}R`} />
        <Metric label="Est. cost drag" value={money(roundTrip)} sub="brokerage + slippage" />
        <Metric label="Paper qty" value={qty} sub="based on $25 risk" />
      </div>
      <div className="noteBlock"><b>Why it is on the desk</b>{(selected?.why?.length ? selected.why : ['Scanner produced a review candidate.']).map((x) => <p key={x}>• {x}</p>)}</div>
      <div className="noteBlock warning"><b>Risk notes</b>{(selected?.risks?.length ? selected.risks : ['No extra risk notes returned.']).map((x) => <p key={x}>• {x}</p>)}</div>
      <div className="planActions">
        <button onClick={onRead}><Headphones size={15} />Read setup</button>
        <button className="paper" disabled={!canEnter} onClick={() => onPaper(selected)}>{canEnter ? 'Send to paper' : 'Review only'}</button>
      </div>
    </aside>
  );
}

function SectorMatrix() {
  return (
    <section className="matrixPanel">
      <div className="panelTitle"><Database size={18} /><span>ASX Sector & Commodity Matrix</span></div>
      <div className="matrixGrid">
        {sectors.map((s) => (
          <div key={s.name} className={`sectorTile ${s.strength >= 70 ? 'hot' : s.strength < 45 ? 'cold' : ''}`}>
            <div><b>{s.name}</b><span>{s.state}</span></div>
            <strong>{s.strength}</strong>
            <ScoreBar value={s.strength} />
            <small>{s.flow} · leaders: {s.leaders}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function PaperLedger({ paper }) {
  const open = paper?.open_positions || [];
  const closed = paper?.closed_trades || [];
  return (
    <section className="ledgerPanel">
      <div className="panelTitle"><Lock size={18} /><span>$5,000 Paper Execution Book</span><em>no fake trades shown</em></div>
      <div className="ledgerMetrics">
        <Metric label="Cash" value={money(paper?.cash ?? 5000)} />
        <Metric label="Equity" value={money(paper?.equity ?? 5000)} />
        <Metric label="Open risk" value={money(paper?.open_risk ?? 0)} />
        <Metric label="Open trades" value={open.length} />
        <Metric label="Closed trades" value={closed.length} />
      </div>
      <div className="ledgerEmpty">{open.length || closed.length ? 'Paper trades are loaded from backend ledger.' : 'No paper trades yet. The book will stay clean until a real paper entry is made.'}</div>
    </section>
  );
}

function Readiness() {
  const rows = [
    ['Real ASX data', 'Delayed path built, licensed live feed recommended', 'partial'],
    ['10-year history', 'Request path built through provider configuration', 'built'],
    ['Delisted stocks', 'Needs vendor before institutional backtest claims', 'blocked'],
    ['Announcements', 'Needs ASX/vendor feed for halts and price-sensitive news', 'planned'],
    ['Costs', 'Brokerage and slippage included', 'built'],
    ['Broker execution', 'Locked until proof', 'locked'],
  ];
  return <section className="readinessPanel"><div className="panelTitle"><CheckCircle2 size={18} /><span>Production Readiness</span></div>{rows.map(([a,b,c]) => <div className={`readyRow ${c}`} key={a}><b>{a}</b><span>{b}</span><em>{c}</em></div>)}</section>;
}

function App() {
  const [signals, setSignals] = useState(fallbackSignals);
  const [selected, setSelected] = useState(fallbackSignals[0]);
  const [paper, setPaper] = useState(defaultPaper);
  const [clock, setClock] = useState(defaultClock);
  const [chart, setChart] = useState([]);
  const [apiState, setApiState] = useState('loading backend');
  const [lastRefresh, setLastRefresh] = useState('never');
  const [paused, setPaused] = useState(false);
  const [audioArmed, setAudioArmed] = useState(false);
  const [alert, setAlert] = useState(null);
  const timer = useRef(null);

  const armOnce = async () => {
    if (!audioArmed) {
      const ok = await unlockAudio();
      setAudioArmed(ok);
    }
  };

  const fetchJson = async (path) => {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) throw new Error(`${path} ${res.status}`);
    return res.json();
  };

  const refresh = async () => {
    try {
      const [sig, clk, ppr] = await Promise.all([
        fetchJson('/signals'),
        fetchJson('/market-clock').catch(() => defaultClock),
        fetchJson('/paper').catch(() => defaultPaper),
      ]);
      const rows = (sig.signals || sig || []).map(normaliseSignal).filter((x) => x.ticker);
      const nextRows = rows.length ? rows : fallbackSignals;
      setSignals(nextRows);
      setSelected((old) => nextRows.find((x) => x.ticker === old?.ticker) || nextRows[0]);
      setClock(clk || defaultClock);
      setPaper(ppr || defaultPaper);
      setApiState(sig.mode || 'backend connected');
      setLastRefresh(new Date().toLocaleTimeString());
    } catch (err) {
      setSignals(fallbackSignals);
      setSelected((old) => fallbackSignals.find((x) => x.ticker === old?.ticker) || fallbackSignals[0]);
      setApiState(`offline fallback: ${err.message}`);
      setLastRefresh(new Date().toLocaleTimeString());
    }
  };

  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (!paused) timer.current = setInterval(refresh, AUTO_REFRESH_MS);
    return () => timer.current && clearInterval(timer.current);
  }, [paused]);
  useEffect(() => {
    if (!selected?.ticker) return;
    fetchJson(`/prices/${selected.ticker}`).then((data) => {
      const rows = (data.prices || data || []).map((x, i) => ({ day: i + 1, price: Number(x.close || x.price || x.Price || 0), ma20: Number(x.ma20 || x.close || x.price || 0), vol: Number(x.volume || 0) })).filter((x) => x.price);
      setChart(rows.length ? rows.slice(-120) : buildChart(Number(selected.entry || 100)));
    }).catch(() => setChart(buildChart(Number(selected.entry || 100))));
  }, [selected?.ticker]);

  const readSelected = async () => {
    await armOnce();
    tone('entry');
    speak(`${selected.ticker} review. Entry ${money(selected.entry)}. Stop ${money(selected.stop)}. Target ${money(selected.target)}. Buy zone ${selected.keyZone}. ${clock?.is_open ? 'Market is open, paper entry can be reviewed.' : 'Market is closed, review only. Do not enter until market opens.'}`);
  };
  const sendPaper = async (stock) => {
    await armOnce();
    try {
      const res = await fetch(`${API_BASE}/paper/enter`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticker: stock.ticker, side: 'LONG', quantity: 1, entry_price: stock.entry, stop: stock.stop, target: stock.target, setup: stock.setup, score: stock.score }) });
      if (!res.ok) throw new Error('paper entry blocked');
      setAlert(`${stock.ticker} paper trade entered.`);
      tone('entry'); speak(`${stock.ticker} paper trade entered. Entry ${money(stock.entry)} stop ${money(stock.stop)} target ${money(stock.target)}.`);
      refresh();
    } catch (err) {
      setAlert(`${stock.ticker} paper entry blocked. ${err.message}`);
      tone('stop'); speak(`${stock.ticker} paper entry blocked. Check market status and risk gate.`);
    }
    setTimeout(() => setAlert(null), 60000);
  };

  const sorted = useMemo(() => [...signals].sort((a, b) => Number(b.score || 0) - Number(a.score || 0)), [signals]);

  return (
    <main className="appShell" onClick={armOnce}>
      <TopBar clock={clock} paper={paper} signals={sorted} apiState={apiState} lastRefresh={lastRefresh} paused={paused} setPaused={setPaused} refresh={refresh} audioArmed={audioArmed} />
      {alert && <div className="tradeToast"><Bell size={18} /><span>{alert}</span><button onClick={() => setAlert(null)}>close</button></div>}
      <div className="deskGrid">
        <PriorityQueue signals={sorted} selected={selected} setSelected={setSelected} />
        <section className="centreStack">
          <DeskChart selected={selected} chart={chart} />
          <SignalBook signals={sorted} selected={selected} setSelected={setSelected} />
        </section>
        <section className="rightStack">
          <TradePlan selected={selected} clock={clock} onPaper={sendPaper} onRead={readSelected} />
          <SectorMatrix />
        </section>
      </div>
      <div className="bottomGrid">
        <PaperLedger paper={paper} />
        <Readiness />
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
