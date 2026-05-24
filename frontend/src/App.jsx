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
const BUILD_ID = 'AU-ASX-INSTITUTIONAL-DESK-V22';

const fallbackSignals = [
  { ticker: 'CBA', name: 'Commonwealth Bank', sector: 'Banks', score: 88, confidence: 82, status: 'REVIEW', setup: 'Pullback to value', price: 123.4, entry: 123.2, stop: 119.8, target: 132.7, rr: 2.79, volume: 1.3, change: 0.8, keyZone: '$122.40 to $124.10', why: ['Trend structure still positive', 'Banks sector holding up better than market', 'Price is near a defined buy zone'], risks: ['Market is closed, no entry now', 'Needs fresh liquidity check at open'] },
  { ticker: 'BHP', name: 'BHP Group', sector: 'Materials', score: 84, confidence: 78, status: 'REVIEW', setup: 'Breakout watch', price: 45.12, entry: 45.3, stop: 43.7, target: 49.1, rr: 2.38, volume: 1.1, change: 0.5, keyZone: '$44.90 to $45.40', why: ['Materials heatmap is strong', 'Entry is close to resistance break', 'Risk is defined'], risks: ['Commodity-sensitive', 'Needs iron ore confirmation'] },
  { ticker: 'NAB', name: 'National Australia Bank', sector: 'Banks', score: 82, confidence: 76, status: 'REVIEW', setup: 'Higher-low continuation', price: 34.8, entry: 35.1, stop: 33.9, target: 38.2, rr: 2.58, volume: 1.2, change: 0.4, keyZone: '$34.80 to $35.20', why: ['Bank sector strength', 'Higher low holding'], risks: ['Needs open liquidity confirmation'] },
  { ticker: 'RIO', name: 'Rio Tinto', sector: 'Materials', score: 80, confidence: 75, status: 'REVIEW', setup: 'Base breakout watch', price: 128.2, entry: 129.0, stop: 124.4, target: 139.8, rr: 2.35, volume: 1.0, change: 0.3, keyZone: '$128.40 to $129.30', why: ['Materials sector supportive', 'Clean base structure'], risks: ['Commodity and China headline risk'] },
  { ticker: 'WES', name: 'Wesfarmers', sector: 'Consumer', score: 72, confidence: 67, status: 'WATCH', setup: 'Base forming', price: 67.8, entry: 68.5, stop: 66.2, target: 72.8, rr: 1.87, volume: 0.9, change: 0.2, keyZone: '$67.90 to $68.70', why: ['Base structure is improving'], risks: ['Reward is below 2R', 'Volume not strong enough'] },
  { ticker: 'CSL', name: 'CSL Limited', sector: 'Healthcare', score: 51, confidence: 48, status: 'BLOCKED', setup: 'Weak relative strength', price: 284.1, entry: 291, stop: 279, target: 306, rr: 1.25, volume: 0.8, change: -0.9, keyZone: 'No clean buy zone', why: ['High quality company, poor current setup'], risks: ['Sector weak', 'No entry trigger', 'Below trade threshold'] },
  { ticker: 'WBC', name: 'Westpac', sector: 'Banks', score: 78, confidence: 71, status: 'WATCH', setup: 'Pullback watch', price: 27.9, entry: 28.2, stop: 27.1, target: 30.5, rr: 2.09, volume: 1.0, change: 0.2, keyZone: '$27.90 to $28.30', why: ['Sector supports watch status'], risks: ['Needs stronger trigger'] },
  { ticker: 'MQG', name: 'Macquarie Group', sector: 'Financials', score: 79, confidence: 73, status: 'WATCH', setup: 'Trend continuation', price: 203.4, entry: 205.0, stop: 197.5, target: 221.0, rr: 2.13, volume: 0.95, change: 0.1, keyZone: '$203.50 to $205.40', why: ['Financials improving'], risks: ['Wide stop for $5k paper account'] },
  { ticker: 'FMG', name: 'Fortescue', sector: 'Materials', score: 76, confidence: 70, status: 'WATCH', setup: 'Commodity pullback', price: 24.6, entry: 24.9, stop: 23.7, target: 27.5, rr: 2.17, volume: 1.1, change: 0.4, keyZone: '$24.50 to $25.00', why: ['Materials flow positive'], risks: ['Iron ore sensitivity'] },
  { ticker: 'NEM', name: 'Newmont', sector: 'Gold', score: 77, confidence: 74, status: 'WATCH', setup: 'Gold strength pullback', price: 72.2, entry: 72.8, stop: 69.9, target: 79.4, rr: 2.28, volume: 1.2, change: 0.8, keyZone: '$72.00 to $73.00', why: ['Gold tape supportive'], risks: ['Gold/USD reversal risk'] },
  { ticker: 'WDS', name: 'Woodside Energy', sector: 'Energy', score: 66, confidence: 61, status: 'WATCH', setup: 'Range reclaim', price: 29.7, entry: 30.1, stop: 28.9, target: 32.8, rr: 2.25, volume: 0.85, change: -0.1, keyZone: '$29.80 to $30.20', why: ['Energy mixed but tradable watch'], risks: ['Oil price mixed'] },
  { ticker: 'XRO', name: 'Xero', sector: 'Technology', score: 74, confidence: 69, status: 'WATCH', setup: 'Momentum reset', price: 128.6, entry: 130.0, stop: 124.8, target: 141.2, rr: 2.15, volume: 1.05, change: 0.6, keyZone: '$128.50 to $130.20', why: ['Tech watchlist strength'], risks: ['Nasdaq lead needed'] },
  { ticker: 'GMG', name: 'Goodman Group', sector: 'REITs', score: 69, confidence: 63, status: 'WATCH', setup: 'Rate-sensitive base', price: 33.4, entry: 33.8, stop: 32.5, target: 36.5, rr: 2.08, volume: 0.9, change: 0.1, keyZone: '$33.40 to $33.90', why: ['Base still forming'], risks: ['Bond yield sensitivity'] },
  { ticker: 'PLS', name: 'Pilbara Minerals', sector: 'Lithium', score: 42, confidence: 39, status: 'BLOCKED', setup: 'Weak sector', price: 3.1, entry: 3.25, stop: 2.98, target: 3.85, rr: 2.22, volume: 1.0, change: -1.2, keyZone: 'Blocked until lithium improves', why: ['Low price may move'], risks: ['Lithium sector weak', 'Blocked by heatmap'] },
  { ticker: 'WOW', name: 'Woolworths', sector: 'Staples', score: 58, confidence: 55, status: 'BLOCKED', setup: 'Defensive laggard', price: 31.2, entry: 31.8, stop: 30.4, target: 34.4, rr: 1.86, volume: 0.7, change: -0.2, keyZone: 'No clean buy zone', why: ['Defensive liquidity'], risks: ['Weak relative strength', 'R/R under 2R'] },
  { ticker: 'TLS', name: 'Telstra', sector: 'Communications', score: 62, confidence: 58, status: 'WATCH', setup: 'Slow trend watch', price: 3.95, entry: 4.02, stop: 3.86, target: 4.38, rr: 2.25, volume: 0.8, change: 0.1, keyZone: '$3.96 to $4.03', why: ['Stable trend'], risks: ['Slow mover, costs matter'] },
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
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
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
function tickerHash(ticker = 'ASX') {
  return String(ticker).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
}
function buildChart(seed = 100, ticker = 'ASX') {
  const rows = [];
  const h = tickerHash(ticker);
  const phase = (h % 19) / 3;
  const vol = 0.55 + (h % 7) * 0.16;
  const trend = ((h % 11) - 3) * 0.025;
  let close = Number(seed || 100) * (0.94 + (h % 5) * 0.015);
  let ma = close;
  for (let i = 0; i < 100; i += 1) {
    const prevClose = close;
    const shock = Math.sin((i + phase) / (3.6 + (h % 5))) * vol + Math.cos((i + phase) / (7.5 + (h % 3))) * vol * 0.7;
    close = close + trend + shock * 0.16;
    const open = prevClose + Math.sin((i + phase) / 2.9) * vol * 0.07;
    const high = Math.max(open, close) + (0.18 + ((h + i) % 5) * 0.045) * Math.max(1, seed / 60);
    const low = Math.min(open, close) - (0.16 + ((h + i) % 4) * 0.045) * Math.max(1, seed / 60);
    ma = ma * 0.88 + close * 0.12;
    rows.push({
      day: i + 1,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      price: Number(close.toFixed(2)),
      ma20: Number(ma.toFixed(2)),
      vol: Math.round(550000 + ((Math.sin(i / 2 + phase) + 1) * 150000) + i * (900 + (h % 9) * 150)),
    });
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

function TopBar({ clock, paper, signals, apiState, lastRefresh, paused, setPaused, refresh, audioArmed, autoPaper }) {
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
        <Metric label="Auto paper" value={autoPaper?.enabled === false ? 'OFF' : 'ON'} sub={autoPaper?.market_open ? 'entry/exit active' : 'exit check only'} toneClass={autoPaper?.enabled === false ? 'bad' : 'good'} />
        <Metric label="Next refresh" value={`${AUTO_REFRESH_MS / 1000}s`} sub={paused ? 'paused' : 'running'} />
      </div>
      <div className="topActions">
        <button onClick={refresh}><RefreshCw size={16} />Scan</button>
        <button onClick={() => setPaused((p) => !p)} className={paused ? 'run' : 'hold'}>{paused ? <Play size={16} /> : <Pause size={16} />}{paused ? 'Resume' : 'Pause'}</button>
      </div>
    </div>
  );
}

function PriorityQueue({ signals, selected, onSelect }) {
  return (
    <aside className="queuePanel">
      <div className="panelTitle"><Zap size={18} /><span>Priority Queue</span></div>
      <div className="queueList">
        {signals.slice(0, 12).map((s, idx) => (
          <button key={s.ticker} className={`queueRow ${selected?.ticker === s.ticker ? 'active' : ''}`} onClick={() => onSelect(s)}>
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

function SignalBook({ signals, selected, onSelect }) {
  return (
    <div className="signalBook">
      <div className="panelTitle"><Activity size={18} /><span>Signal Blotter</span><em>click a row to update chart and trade plan</em></div>
      <div className="tableWrap">
        <table>
          <thead><tr><th>Ticker</th><th>Sector</th><th>Setup</th><th>Score</th><th>Confidence</th><th>Entry</th><th>Stop</th><th>Target</th><th>R/R</th><th>Status</th></tr></thead>
          <tbody>
            {signals.map((s) => (
              <tr key={s.ticker} className={selected?.ticker === s.ticker ? 'selected' : ''} onClick={() => onSelect(s)}>
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

function CandleChart({ data, selected }) {
  const rows = (data?.length ? data : buildChart(Number(selected?.entry || 100), selected?.ticker)).slice(-100);
  const width = 1100;
  const height = 430;
  const pad = { left: 58, right: 28, top: 18, bottom: 58 };
  const chartH = height - pad.top - pad.bottom - 70;
  const volTop = pad.top + chartH + 22;
  const volH = 46;
  const highs = rows.map((r) => Number(r.high ?? r.close ?? r.price));
  const lows = rows.map((r) => Number(r.low ?? r.close ?? r.price));
  const lineVals = rows.map((r) => Number(r.ma20 || r.close || r.price)).filter(Number.isFinite);
  const minP = Math.min(...lows, ...lineVals, Number(selected?.stop || Infinity)) * 0.995;
  const maxP = Math.max(...highs, ...lineVals, Number(selected?.target || 0)) * 1.005;
  const xStep = (width - pad.left - pad.right) / Math.max(rows.length, 1);
  const candleW = Math.max(3, Math.min(10, xStep * 0.58));
  const y = (price) => pad.top + (maxP - price) / Math.max(maxP - minP, 0.01) * chartH;
  const x = (i) => pad.left + i * xStep + xStep / 2;
  const vols = rows.map((r) => Number(r.vol || r.volume || 0));
  const maxVol = Math.max(...vols, 1);
  const maPath = rows.map((r, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(Number(r.ma20 || r.close || r.price)).toFixed(1)}`).join(' ');
  const levels = [
    ['ENTRY', selected?.entry, '#39a7ff'],
    ['STOP', selected?.stop, '#ff4d6d'],
    ['TARGET', selected?.target, '#26d07c'],
  ].filter(([, value]) => Number(value));
  const grid = Array.from({ length: 5 }, (_, i) => minP + (maxP - minP) * (i / 4));
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="candleSvg" role="img" aria-label={`${selected?.ticker} candlestick chart`}>
      <rect x="0" y="0" width={width} height={height} rx="18" fill="#050915" />
      {grid.map((g) => <g key={g}><line x1={pad.left} x2={width - pad.right} y1={y(g)} y2={y(g)} stroke="rgba(148,163,184,.12)" /><text x="8" y={y(g) + 4} fill="#7b8aaa" fontSize="12">{money(g)}</text></g>)}
      {rows.map((r, i) => {
        const open = Number(r.open ?? r.close ?? r.price);
        const high = Number(r.high ?? r.close ?? r.price);
        const low = Number(r.low ?? r.close ?? r.price);
        const close = Number(r.close ?? r.price);
        const up = close >= open;
        const cx = x(i);
        const bodyY = Math.min(y(open), y(close));
        const bodyH = Math.max(2, Math.abs(y(open) - y(close)));
        const color = up ? '#23f0a0' : '#ff4d6d';
        const volHeight = Math.max(1, (Number(r.vol || r.volume || 0) / maxVol) * volH);
        return <g key={i}>
          <line x1={cx} x2={cx} y1={y(high)} y2={y(low)} stroke={color} strokeWidth="1.4" />
          <rect x={cx - candleW / 2} y={bodyY} width={candleW} height={bodyH} rx="1.5" fill={color} opacity="0.95" />
          <rect x={cx - candleW / 2} y={volTop + volH - volHeight} width={candleW} height={volHeight} fill={color} opacity="0.23" />
        </g>;
      })}
      <path d={maPath} fill="none" stroke="#f5c542" strokeWidth="2" />
      {levels.map(([label, value, color]) => <g key={label}>
        <line x1={pad.left} x2={width - pad.right} y1={y(Number(value))} y2={y(Number(value))} stroke={color} strokeDasharray="7 5" strokeWidth="1.5" />
        <text x={width - pad.right - 74} y={y(Number(value)) - 7} fill={color} fontSize="14" fontWeight="800">{label}</text>
      </g>)}
      <text x={pad.left} y={height - 18} fill="#7b8aaa" fontSize="12">Candles: open, high, low, close • blue/yellow line: 20-period average • bars: volume</text>
    </svg>
  );
}

function DeskChart({ selected, chart }) {
  const data = chart?.length ? chart : buildChart(Number(selected?.entry || 100), selected?.ticker);
  return (
    <section className="chartPanel">
      <div className="chartHeader">
        <div>
          <h2>{selected?.ticker || 'No ticker'} <span>{selected?.name}</span></h2>
          <p>{selected?.sector} · {selected?.setup} · buy zone {selected?.keyZone}</p>
        </div>
        <div className="chartStats"><StatusPill status={selected?.status} /><b>{selected?.score || 0}</b></div>
      </div>
      <div className="chartBox candleBox"><CandleChart data={data} selected={selected} /></div>
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
      <div className="noteBlock"><b>Auto paper rule</b><p>• The paper account auto-enters READY/ARMED setups when the ASX is open and pre-trade risk passes.</p><p>• It auto-exits when stop or target is hit by the latest scan price.</p></div><div className="noteBlock"><b>Why it is on the desk</b>{(selected?.why?.length ? selected.why : ['Scanner produced a review candidate.']).map((x) => <p key={x}>• {x}</p>)}</div>
      <div className="noteBlock warning"><b>Risk notes</b>{(selected?.risks?.length ? selected.risks : ['No extra risk notes returned.']).map((x) => <p key={x}>• {x}</p>)}</div>
      <div className="planActions">
        <button onClick={onRead}><Headphones size={15} />Read setup</button>
        <button className="paper" disabled={!canEnter} onClick={() => onPaper(selected)}>{canEnter ? 'Manual paper' : 'Review only'}</button>
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
  const [autoPaper, setAutoPaper] = useState({ enabled: true, market_open: false, entries: 0, exits: 0, events: [] });
  const timer = useRef(null);

  const armOnce = async () => {
    if (!audioArmed) {
      const ok = await unlockAudio();
      setAudioArmed(ok);
      return ok;
    }
    return true;
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
      const nextAuto = sig.auto_paper || { enabled: true, events: [] };
      setAutoPaper(nextAuto);
      if (audioArmed && Array.isArray(nextAuto.events) && nextAuto.events.length) {
        const latest = nextAuto.events[nextAuto.events.length - 1];
        const type = String(latest.event_type || '').includes('EXIT') ? 'exit' : 'entry';
        tone(type);
        speak(latest.message || `${latest.ticker || 'Paper trade'} ${type} alert.`);
        setAlert(latest.message || `${latest.ticker || 'Paper trade'} ${type} alert.`);
        setTimeout(() => setAlert(null), 60000);
      }
      setApiState(sig.mode || 'backend connected');
      setLastRefresh(new Date().toLocaleTimeString());
    } catch (err) {
      setSignals(fallbackSignals);
      setSelected((old) => fallbackSignals.find((x) => x.ticker === old?.ticker) || fallbackSignals[0]);
      setAutoPaper({ enabled: false, market_open: false, entries: 0, exits: 0, events: [], message: 'Backend not connected, auto paper is offline.' });
      setApiState(`local fallback: ${err.message}`);
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
      const rows = (data.prices || data || []).map((x, i) => {
        const close = Number(x.close || x.price || x.Close || x.Price || 0);
        const open = Number(x.open || x.Open || close);
        const high = Number(x.high || x.High || Math.max(open, close));
        const low = Number(x.low || x.Low || Math.min(open, close));
        return { day: i + 1, open, high, low, close, price: close, ma20: Number(x.ma20 || x.sma20 || close), vol: Number(x.volume || x.Volume || 0) };
      }).filter((x) => x.close);
      setChart(rows.length ? rows.slice(-120) : buildChart(Number(selected.entry || 100), selected.ticker));
    }).catch(() => setChart(buildChart(Number(selected.entry || 100), selected.ticker)));
  }, [selected?.ticker]);

  const selectSignal = async (stock) => {
    setSelected(stock);
    const ok = await armOnce();
    if (ok) {
      tone(String(stock.status).toUpperCase() === 'BLOCKED' ? 'stop' : 'entry');
      speak(`${stock.ticker} selected. ${stock.status}. ${stock.setup}. Entry ${money(stock.entry)}. Stop ${money(stock.stop)}. Target ${money(stock.target)}.`);
    }
  };

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
      <TopBar clock={clock} paper={paper} signals={sorted} apiState={apiState} lastRefresh={lastRefresh} paused={paused} setPaused={setPaused} refresh={refresh} audioArmed={audioArmed} autoPaper={autoPaper} />
      {alert && <div className="tradeToast"><Bell size={18} /><span>{alert}</span><button onClick={() => setAlert(null)}>close</button></div>}
      <div className="deskGrid">
        <PriorityQueue signals={sorted} selected={selected} onSelect={selectSignal} />
        <section className="centreStack">
          <DeskChart selected={selected} chart={chart} />
          <SignalBook signals={sorted} selected={selected} onSelect={selectSignal} />
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
