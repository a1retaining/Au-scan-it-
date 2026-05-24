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
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock3,
  Database,
  Headphones,
  Lock,
  Pause,
  Play,
  Radar,
  RefreshCw,
  ShieldCheck,
  Speaker,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import './styles.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '');
const AUTO_REFRESH_MS = Number(import.meta.env.VITE_AUTO_REFRESH_MS || 60000);

const fallbackSectors = ['Banks', 'Materials', 'Gold', 'Energy', 'Healthcare', 'Lithium', 'REITs', 'Technology'];
const costDefaults = { brokerage: 19.0, slippage: 2.5 };

const buildStatus = [
  ['ASX delayed/live data route', 'CONNECTED PATH', 'built', 'The provider interface can use yfinance for delayed .AX data or a licensed data feed later.'],
  ['10-year history request', 'BUILT', 'built', 'Scanner/backtest can request 10y daily history. Institutional data is still recommended.'],
  ['Delisted equities', 'NEEDS VENDOR', 'blocked', 'Needed before claiming production-grade backtest results.'],
  ['Announcements and halts', 'VENDOR NEXT', 'planned', 'Requires ASX/vendor feed for price-sensitive announcements, halts and capital raises.'],
  ['Brokerage and slippage', 'BUILT', 'built', 'Entry and exit costs flow into paper trading and backtest P/L.'],
  ['Paper trading ledger', 'BUILT', 'built', 'Tracks entries, exits, net P/L, R multiple, result and exit reason.'],
  ['Sound and voice alerts', 'BUILT', 'built', 'No test buttons. First user click arms browser sound/voice automatically.'],
  ['Broker execution', 'LOCKED', 'locked', 'Correctly locked. No live order routing until proof, data QA and controls pass.'],
];

function money(v) {
  const n = Number(v || 0);
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function pct(v) {
  return Number.isFinite(Number(v)) ? `${Number(v).toFixed(2)}%` : '-';
}
function countDown(seconds) {
  const s = Math.max(0, Number(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return `${h}h ${m}m ${sec}s`;
}
function gradeFromScore(score) {
  if (score >= 90) return 'A+';
  if (score >= 82) return 'A';
  if (score >= 72) return 'B';
  if (score >= 60) return 'C';
  return 'D';
}
function normaliseSignal(signal) {
  const entry = Number(signal.entry || signal.close || signal.price || 0);
  const score = Math.round(Number(signal.score || signal.total_score || 0));
  const stop = Number(signal.stop || signal.stop_loss || entry * 0.97 || 0);
  const target = Number(signal.target || entry * 1.06 || 0);
  const riskReward = Number(signal.risk_reward || signal.rr || ((target - entry) / Math.max(entry - stop, 0.01)) || 0);
  return {
    ticker: signal.ticker,
    name: signal.name || signal.ticker,
    sector: signal.sector || 'Unknown',
    price: entry,
    change: Number(signal.change_pct || signal.change || 0),
    score,
    confidence: Math.round(Number(signal.confidence || signal.strength || Math.min(99, score + 3))),
    grade: signal.grade || gradeFromScore(score),
    status: signal.status || (score >= 82 ? 'ARMED' : score >= 68 ? 'WATCH' : 'BLOCKED'),
    setup: signal.setup || signal.pattern || 'ASX system scan',
    rr: riskReward,
    volume: Number(signal.volume_multiple || signal.volume_ratio || 0),
    entry,
    stop,
    target,
    keyZone: signal.key_zone || signal.buy_zone || `${money(entry * 0.995)} to ${money(entry * 1.005)}`,
    avgDailyValue: Number(signal.avg_daily_value || 0),
    spreadPct: Number(signal.spread_pct || 0),
    why: signal.reasons || signal.why || [],
    risks: [...(signal.risks || []), ...(signal.blockers || [])],
  };
}

let sharedAudioContext = null;
function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  if (!sharedAudioContext) sharedAudioContext = new AudioContext();
  return sharedAudioContext;
}
async function armAudio() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') await ctx.resume();
  return Boolean(ctx);
}
function playTone(type = 'entry') {
  try {
    const ctx = getAudioContext();
    if (!ctx || ctx.state !== 'running') return;
    const patterns = {
      entry: [880, 1120],
      exit: [520, 420],
      stop: [260, 190, 160],
      target: [700, 880, 1040],
    };
    (patterns[type] || patterns.entry).forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = 'sine';
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.13);
      gain.gain.exponentialRampToValueAtTime(0.075, ctx.currentTime + i * 0.13 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.13 + 0.11);
      osc.start(ctx.currentTime + i * 0.13);
      osc.stop(ctx.currentTime + i * 0.13 + 0.12);
    });
  } catch (_) {}
}
function speak(message) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  try {
    const u = new SpeechSynthesisUtterance(message);
    u.rate = 0.92;
    u.pitch = 1;
    u.volume = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch (_) {}
}
function voiceMessage(type, stock) {
  if (!stock) return 'No stock selected.';
  if (type === 'entry') return `${stock.ticker} paper entry review. Entry ${money(stock.entry)}. Buy zone ${stock.keyZone}. Stop ${money(stock.stop)}. Target ${money(stock.target)}. Do not enter outside the plan.`;
  if (type === 'exit') return `${stock.ticker} exit review. Check stop, target, invalidation and market conditions now.`;
  if (type === 'stop') return `${stock.ticker} stop alert. Exit paper trade and record the loss unless manual review overrides it.`;
  if (type === 'target') return `${stock.ticker} target reached. Take profit or trail the stop according to the plan.`;
  return `${stock.ticker} alert.`;
}

function Tile({ label, value, sub, intent = 'neutral' }) {
  return (
    <div className={`tile ${intent}`}>
      <span>{label}</span>
      <b>{value}</b>
      {sub ? <small>{sub}</small> : null}
    </div>
  );
}
function Pill({ children, type = 'neutral' }) {
  return <span className={`pill ${type}`}>{children}</span>;
}
function statusType(status) {
  const s = String(status || '').toUpperCase();
  if (['READY', 'ARMED'].includes(s)) return 'armed';
  if (s === 'BLOCKED') return 'blocked';
  return 'watch';
}
function buildClass(level) {
  return `statusBadge ${level}`;
}

function CommandHeader({ apiStatus, clock, paper, paused, onRefresh, onPause, soundArmed, lastRefresh, rows }) {
  const open = Boolean(clock?.is_open);
  const armedCount = rows.filter((r) => ['READY', 'ARMED'].includes(String(r.status).toUpperCase())).length;
  return (
    <header className="deskHeader">
      <section className="brandPanel">
        <div className="brandRow">
          <Radar size={24} />
          <div>
            <h1>ASX Institutional Trade Desk</h1>
            <p>{apiStatus}</p>
          </div>
        </div>
        <div className="microLine">
          <span className={soundArmed ? 'dot ok' : 'dot'} /> Sound/voice {soundArmed ? 'armed' : 'arms on first click'}
          <span>Last refresh {lastRefresh}</span>
        </div>
      </section>
      <section className="headerTiles">
        <Tile label="ASX Session" value={clock?.session || 'Unknown'} sub={open ? `closes ${countDown(clock?.seconds_to_close)}` : `opens ${countDown(clock?.seconds_to_open)}`} intent={open ? 'good' : 'warn'} />
        <Tile label="Signals" value={rows.length} sub={`${armedCount} actionable`} />
        <Tile label="Paper Equity" value={money(paper?.equity || 5000)} sub="starting bank $5,000" />
        <Tile label="Auto Refresh" value={`${AUTO_REFRESH_MS / 1000}s`} sub="background scan" />
      </section>
      <section className="actionDock">
        <button onClick={onRefresh}><RefreshCw size={15} /> Scan</button>
        <button onClick={onPause} className={paused ? 'resume' : 'pause'}>{paused ? <Play size={15} /> : <Pause size={15} />} {paused ? 'Resume' : 'Pause'}</button>
      </section>
    </header>
  );
}

function SignalStack({ rows, selectedTicker, onSelect }) {
  const leaders = rows.slice(0, 5);
  return (
    <section className="stackPanel">
      <div className="panelTitle"><span>Priority Queue</span><small>ranked by score, strength, liquidity and setup quality</small></div>
      <div className="queueList">
        {leaders.map((r, i) => (
          <button key={r.ticker} onClick={() => onSelect(r.ticker)} className={`queueCard ${selectedTicker === r.ticker ? 'active' : ''}`}>
            <div className="rank">{String(i + 1).padStart(2, '0')}</div>
            <div className="queueMain"><b>{r.ticker}</b><span>{r.sector} • {r.setup}</span></div>
            <Pill type={statusType(r.status)}>{r.status}</Pill>
            <div className="queueScore"><b>{r.score}</b><span>{r.grade}</span></div>
          </button>
        ))}
        {!leaders.length ? <div className="empty">No candidates returned from backend.</div> : null}
      </div>
    </section>
  );
}

function Blotter({ rows, selectedTicker, onSelect }) {
  return (
    <section className="blotterPanel">
      <div className="panelTitle"><span>Signal Blotter</span><small>not a fake P/L screen, every row is a current scan candidate</small></div>
      <div className="tableShell">
        <table className="blotter">
          <thead>
            <tr>
              <th>Ticker</th><th>Sector</th><th>Status</th><th>Score</th><th>Conf.</th><th>Price</th><th>Buy Zone</th><th>Stop</th><th>Target</th><th>R/R</th><th>Cost Drag</th><th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ticker} onClick={() => onSelect(r.ticker)} className={selectedTicker === r.ticker ? 'active' : ''}>
                <td className="ticker">{r.ticker}</td>
                <td>{r.sector}</td>
                <td><Pill type={statusType(r.status)}>{r.status}</Pill></td>
                <td><Score value={r.score} /></td>
                <td>{r.confidence}</td>
                <td>{money(r.price)}</td>
                <td>{r.keyZone}</td>
                <td className="negative">{money(r.stop)}</td>
                <td className="positive">{money(r.target)}</td>
                <td>{Number(r.rr || 0).toFixed(2)}R</td>
                <td>{money(costDefaults.brokerage + costDefaults.slippage)}</td>
                <td>{(r.why && r.why[0]) || r.setup || 'Awaiting explanation.'}</td>
              </tr>
            ))}
            {!rows.length ? <tr><td colSpan="12" className="empty">No signals loaded. Check API URL, Render backend and data provider.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function Score({ value }) {
  return <div className="score"><i style={{ width: `${Math.max(2, Math.min(100, value))}%` }} /><b>{value}</b></div>;
}

function TradePlan({ stock, marketOpen, soundArmed, onAlert, onRead }) {
  if (!stock) return <section className="tradePlan"><div className="panelTitle"><span>Trade Plan</span></div><div className="empty">Select a candidate.</div></section>;
  const canPaper = marketOpen && ['READY', 'ARMED'].includes(String(stock.status).toUpperCase());
  return (
    <section className="tradePlan">
      <div className="panelTitle"><span>Trade Plan: {stock.ticker}</span><small>{stock.name || stock.ticker}</small></div>
      <div className="planGrid">
        <Tile label="Entry" value={money(stock.entry)} sub={stock.keyZone} />
        <Tile label="Stop" value={money(stock.stop)} sub="hard invalidation" intent="bad" />
        <Tile label="Target" value={money(stock.target)} sub={`${Number(stock.rr || 0).toFixed(2)}R profile`} intent="good" />
        <Tile label="Costs" value={money(costDefaults.brokerage + costDefaults.slippage)} sub="round trip estimate" intent="warn" />
      </div>
      <div className="planActions">
        <button disabled={!canPaper} onClick={() => onAlert('entry', stock)}>{canPaper ? 'Send to Paper' : marketOpen ? 'Blocked by status' : 'Paper locked, market closed'}</button>
        <button onClick={() => onAlert('exit', stock)}>Exit Review</button>
        <button onClick={() => onAlert('stop', stock)}>Stop Alert</button>
        <button onClick={() => onAlert('target', stock)}>Target Alert</button>
        <button onClick={() => onRead(stock)}><Speaker size={14} /> Read Plan</button>
      </div>
      <div className="explainGrid">
        <div><h3>Why this is on the desk</h3><ul>{(stock.why?.length ? stock.why : ['Trend, relative strength, risk/reward and sector checks are being assessed.']).slice(0, 6).map((x) => <li key={x}>{x}</li>)}</ul></div>
        <div><h3>Risk notes</h3><ul>{(stock.risks?.length ? stock.risks : ['No broker execution is enabled.', 'Do not enter outside the stated buy zone.', 'Market-closed candidates are review-only.']).slice(0, 6).map((x) => <li key={x}>{x}</li>)}</ul></div>
      </div>
      {!soundArmed ? <p className="deskNote"><Headphones size={14} /> Click anywhere once to arm browser sound and voice. There are no test buttons taking space.</p> : null}
    </section>
  );
}

function ChartPanel({ stock, chart }) {
  return (
    <section className="chartPanel">
      <div className="panelTitle"><span>Market Structure Chart</span><small>{stock ? `${stock.ticker} with entry, stop and target overlays` : 'Select a ticker'}</small></div>
      <div className="chartBox">
        {stock && chart.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chart} margin={{ top: 16, right: 45, bottom: 12, left: 0 }}>
              <CartesianGrid stroke="rgba(148,163,184,.12)" vertical={false} />
              <XAxis dataKey="d" stroke="#8191a8" fontSize={11} minTickGap={28} />
              <YAxis yAxisId="price" stroke="#8191a8" fontSize={11} domain={['dataMin - 2', 'dataMax + 2']} />
              <YAxis yAxisId="volume" hide domain={[0, 'dataMax']} />
              <Tooltip contentStyle={{ background: '#08111f', border: '1px solid #24364f', color: '#e5eefc' }} />
              <Bar yAxisId="volume" dataKey="volume" fill="rgba(55,183,255,.18)" />
              <Area yAxisId="price" type="monotone" dataKey="price" fill="rgba(42,167,255,.10)" stroke="none" />
              <Line yAxisId="price" type="monotone" dataKey="price" stroke="#2aa7ff" strokeWidth={2.5} dot={false} />
              <Line yAxisId="price" type="monotone" dataKey="ma20" stroke="#f6c958" strokeWidth={1.6} dot={false} />
              <Line yAxisId="price" type="monotone" dataKey="ma50" stroke="#b78cff" strokeWidth={1.6} dot={false} />
              <ReferenceLine yAxisId="price" y={stock.entry} stroke="#2aa7ff" strokeDasharray="5 5" label={{ value: 'ENTRY', fill: '#2aa7ff', fontSize: 10 }} />
              <ReferenceLine yAxisId="price" y={stock.stop} stroke="#ff5d73" strokeDasharray="5 5" label={{ value: 'STOP', fill: '#ff5d73', fontSize: 10 }} />
              <ReferenceLine yAxisId="price" y={stock.target} stroke="#34d399" strokeDasharray="5 5" label={{ value: 'TARGET', fill: '#34d399', fontSize: 10 }} />
            </ComposedChart>
          </ResponsiveContainer>
        ) : <div className="empty">Waiting for chart history from backend.</div>}
      </div>
    </section>
  );
}

function RiskDesk({ readiness, quality, rows }) {
  const risk = readiness?.risk_book || {};
  const issues = [
    ['Data QA', quality?.passed ? 'PASS' : 'CHECK', quality?.passed ? 'good' : 'warn'],
    ['Live Trading', readiness?.live_trading_allowed ? 'UNLOCKED' : 'LOCKED', readiness?.live_trading_allowed ? 'good' : 'bad'],
    ['Ready/Armed', String(risk.ready ?? rows.filter((r) => ['READY', 'ARMED'].includes(String(r.status).toUpperCase())).length), 'neutral'],
    ['Blocked', String(risk.blocked ?? rows.filter((r) => String(r.status).toUpperCase() === 'BLOCKED').length), 'warn'],
  ];
  return (
    <section className="riskDesk">
      <div className="panelTitle"><span><ShieldCheck size={15} /> Institutional Risk Controls</span><small>data quality, lockouts and pre-trade gates</small></div>
      <div className="riskTiles">{issues.map(([a, b, c]) => <Tile key={a} label={a} value={b} intent={c} />)}</div>
      <div className="qaBox">
        <b>{quality?.ticker ? `${quality.ticker} data QA` : 'Selected data QA'}</b>
        <p>Rows {quality?.rows ?? '-'} • First {quality?.first_date || '-'} • Last {quality?.last_date || '-'} • Stale days {quality?.stale_days ?? '-'}</p>
        {quality?.warnings?.length ? <ul>{quality.warnings.map((w) => <li key={w}>{w}</li>)}</ul> : <small>No major warnings returned.</small>}
      </div>
    </section>
  );
}

function SectorMatrix({ rows }) {
  const groups = fallbackSectors.map((sector) => {
    const list = rows.filter((r) => String(r.sector).toLowerCase().includes(sector.toLowerCase()) || (sector === 'Technology' && String(r.sector).toLowerCase().includes('tech')));
    const avg = list.length ? Math.round(list.reduce((s, r) => s + r.score, 0) / list.length) : 0;
    const armed = list.filter((r) => ['READY', 'ARMED'].includes(String(r.status).toUpperCase())).length;
    return { sector, avg, count: list.length, armed, leaders: list.slice(0, 3).map((r) => r.ticker).join(', ') };
  });
  return (
    <section className="sectorPanel">
      <div className="panelTitle"><span>ASX Sector and Commodity Matrix</span><small>Australia-specific flow map, not US scanner clone</small></div>
      <div className="sectorGrid">
        {groups.map((g) => <div key={g.sector} className={`sectorCard ${g.avg >= 75 ? 'hot' : g.avg < 45 ? 'cold' : ''}`}><b>{g.sector}</b><strong>{g.avg || '-'}</strong><span>{g.count} names • {g.armed} armed</span><small>{g.leaders || 'No leaders'}</small></div>)}
      </div>
    </section>
  );
}

function PaperBook({ paper, trades, onReset }) {
  return (
    <section className="paperBook">
      <div className="panelTitle"><span>Paper Execution Book</span><small>$5,000 testing account, no fake market profits</small></div>
      <div className="riskTiles">
        <Tile label="Cash" value={money(paper?.cash ?? 5000)} />
        <Tile label="Equity" value={money(paper?.equity ?? 5000)} />
        <Tile label="Open Trades" value={paper?.open_positions?.length ?? trades?.filter((t) => !t.exit_price).length ?? 0} />
        <Tile label="Open Risk" value={money(paper?.open_risk ?? 0)} intent="warn" />
      </div>
      <div className="tableShell small">
        <table className="blotter">
          <thead><tr><th>ID</th><th>Ticker</th><th>Side</th><th>Entry</th><th>Exit</th><th>Qty</th><th>Net P/L</th><th>R</th><th>Result</th><th>Reason</th></tr></thead>
          <tbody>{trades?.length ? trades.map((t) => <tr key={t.trade_id || t.id}><td>{t.trade_id || t.id}</td><td className="ticker">{t.ticker}</td><td>{t.side}</td><td>{money(t.entry_price)}</td><td>{t.exit_price ? money(t.exit_price) : 'OPEN'}</td><td>{t.qty}</td><td className={Number(t.net_pnl || 0) >= 0 ? 'positive' : 'negative'}>{money(t.net_pnl)}</td><td>{Number(t.r_multiple || 0).toFixed(2)}R</td><td>{t.result || 'OPEN'}</td><td>{t.exit_reason || '-'}</td></tr>) : <tr><td colSpan="10" className="empty">No paper trades yet. Real entries will appear here only after paper order creation.</td></tr>}</tbody>
        </table>
      </div>
      <button className="dangerButton" onClick={onReset}>Reset Paper Account</button>
    </section>
  );
}

function BuildStrip() {
  return (
    <section className="buildStrip">
      <div className="panelTitle"><span>Build Status</span><small>transparent production readiness</small></div>
      <div className="buildGrid">{buildStatus.map(([name, status, level, detail]) => <div className="buildItem" key={name}><b>{name}</b><span className={buildClass(level)}>{status}</span><p>{detail}</p></div>)}</div>
    </section>
  );
}

function AlertToast({ alert, onClose }) {
  if (!alert) return null;
  return <div className={`alertToast ${alert.type || 'entry'}`}><button onClick={onClose}>×</button><b><Bell size={14} /> {String(alert.type || 'entry').toUpperCase()} ALERT</b><p>{alert.message}</p><small>Auto closes after 60 seconds. Sound/voice requires first page click.</small></div>;
}

function App() {
  const [signals, setSignals] = useState({});
  const [selected, setSelected] = useState('');
  const [chart, setChart] = useState([]);
  const [clock, setClock] = useState(null);
  const [paper, setPaper] = useState({ cash: 5000, equity: 5000 });
  const [trades, setTrades] = useState([]);
  const [apiStatus, setApiStatus] = useState('Connecting to Render API');
  const [scanMessage, setScanMessage] = useState('Waiting for scan.');
  const [lastRefresh, setLastRefresh] = useState('-');
  const [soundArmed, setSoundArmed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [alert, setAlert] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [quality, setQuality] = useState(null);
  const didSpeakRef = useRef(false);
  const rows = useMemo(() => Object.values(signals).sort((a, b) => b.score - a.score), [signals]);
  const stock = selected ? signals[selected] : rows[0];
  const marketOpen = Boolean(clock?.is_open);

  async function api(path, options) {
    const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store', ...(options || {}) });
    if (!res.ok) throw new Error(`${path} HTTP ${res.status}`);
    return res.json();
  }
  async function refreshAll() {
    if (paused) return;
    try {
      const [clockPayload, signalsPayload, paperPayload, tradesPayload, readyPayload] = await Promise.all([
        api('/market-clock'),
        api('/signals'),
        api('/paper'),
        api('/paper/trades'),
        api('/institutional-readiness').catch(() => null),
      ]);
      const next = {};
      (signalsPayload.signals || []).forEach((sig) => {
        const r = normaliseSignal(sig);
        if (r.ticker) next[r.ticker] = r;
      });
      setClock(clockPayload);
      setSignals(next);
      setSelected((prev) => next[prev] ? prev : Object.keys(next)[0] || '');
      setPaper(paperPayload || { cash: 5000, equity: 5000 });
      setTrades(tradesPayload.trades || []);
      setReadiness(readyPayload);
      setLastRefresh(new Date().toLocaleTimeString());
      setScanMessage(signalsPayload.message || 'Scan complete.');
      setApiStatus(`Connected • ${signalsPayload.provider || 'provider'} • ${signalsPayload.period || '-'} • ${signalsPayload.mode || 'scan'}`);
    } catch (err) {
      setApiStatus(`API problem: ${err.message}`);
      setScanMessage('Backend is not returning scan data. Check Render API URL and logs.');
    }
  }
  useEffect(() => { refreshAll(); const timer = setInterval(refreshAll, AUTO_REFRESH_MS); return () => clearInterval(timer); }, [paused]);
  useEffect(() => {
    async function arm() {
      const ok = await armAudio();
      setSoundArmed(ok);
      if (ok && !didSpeakRef.current) {
        didSpeakRef.current = true;
        playTone('target');
        speak('ASX institutional desk sound and voice alerts are armed.');
      }
    }
    window.addEventListener('pointerdown', arm, { once: true });
    return () => window.removeEventListener('pointerdown', arm);
  }, []);
  useEffect(() => {
    if (!stock) return;
    api(`/prices/${stock.ticker}`).then((payload) => {
      const prices = (payload.prices || []).slice(-160);
      const mapped = prices.map((p) => ({ d: String(p.date).slice(5, 10), price: Number(p.close), volume: Number(p.volume || 0) }));
      const withMa = mapped.map((row, i, arr) => {
        const avg = (n) => i + 1 < n ? undefined : arr.slice(i + 1 - n, i + 1).reduce((s, x) => s + x.price, 0) / n;
        return { ...row, ma20: avg(20), ma50: avg(50) };
      });
      setChart(withMa);
    }).catch(() => setChart([]));
    api(`/data-quality/${stock.ticker}`).then(setQuality).catch(() => setQuality(null));
  }, [selected, stock?.ticker]);
  useEffect(() => { if (!alert) return; const timer = setTimeout(() => setAlert(null), 60000); return () => clearTimeout(timer); }, [alert]);

  function trigger(type, s = stock) {
    if (!s) return;
    const message = voiceMessage(type, s);
    setAlert({ type, message, ticker: s.ticker });
    if (soundArmed) { playTone(type); speak(message); }
  }
  function readPlan(s = stock) {
    if (!s) return;
    const message = voiceMessage('entry', s);
    if (soundArmed) speak(message);
    setAlert({ type: 'entry', message, ticker: s.ticker });
  }
  async function resetPaper() {
    try { await api('/paper/reset', { method: 'POST' }); refreshAll(); } catch (e) { setScanMessage(`Paper reset failed: ${e.message}`); }
  }

  return (
    <main className="desk">
      <CommandHeader apiStatus={apiStatus} clock={clock} paper={paper} paused={paused} onRefresh={refreshAll} onPause={() => setPaused(!paused)} soundArmed={soundArmed} lastRefresh={lastRefresh} rows={rows} />
      <section className="situationBar">
        <div><b>Desk Brief</b><span>{rows[0] ? `${rows[0].ticker} is top-ranked. ${scanMessage}` : scanMessage}</span></div>
        {!marketOpen ? <Pill type="watch">AFTER-HOURS REVIEW MODE</Pill> : <Pill type="armed">MARKET OPEN</Pill>}
        <Pill type="blocked"><Lock size={12} /> Live broker locked</Pill>
      </section>
      <div className="workspace">
        <aside className="leftRail"><SignalStack rows={rows} selectedTicker={stock?.ticker || selected} onSelect={setSelected} /><RiskDesk readiness={readiness} quality={quality} rows={rows} /></aside>
        <section className="centerStage"><ChartPanel stock={stock} chart={chart} /><Blotter rows={rows} selectedTicker={stock?.ticker || selected} onSelect={setSelected} /></section>
        <aside className="rightRail"><TradePlan stock={stock} marketOpen={marketOpen} soundArmed={soundArmed} onAlert={trigger} onRead={readPlan} /><SectorMatrix rows={rows} /></aside>
      </div>
      <div className="lowerDeck"><PaperBook paper={paper} trades={trades} onReset={resetPaper} /><BuildStrip /></div>
      <AlertToast alert={alert} onClose={() => setAlert(null)} />
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
