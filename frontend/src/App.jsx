import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import {
  Activity, AlertTriangle, BarChart3, Bell, BookOpen, CheckCircle,
  CheckCircle2, Clock3, Flame, Gauge, Grid3X3, Layers, Lock,
  Megaphone, MousePointerClick, Radio, RadioTower, Search, ShieldCheck,
  StopCircle, Target, TrendingUp, Volume2, VolumeX, WalletCards
} from 'lucide-react';
import './styles.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const AUTO_REFRESH_MS = Number(import.meta.env.VITE_AUTO_REFRESH_MS || 60000);
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

const demoStocks = {
  CBA: {
    ticker: 'CBA', name: 'Commonwealth Bank', sector: 'Banks', price: 123.4, change: 1.8,
    score: 91, confidence: 88, grade: 'A+', status: 'READY', setup: 'Clean pullback', rr: 2.8, volume: 1.7,
    entry: 123.2, stop: 119.8, target: 132.7, risk: '0.50%', why: ['Demo only'], risks: ['Connect API for real data'], chart: []
  }
};

const buildStatus = [
  ['Free delayed ASX data path','BUILT','built','Backend can use Yahoo Finance/yfinance for delayed ASX prices using .AX symbols. Set ASX_DATA_PROVIDER=yfinance.'],
  ['10+ years historical data','BUILT VIA PROVIDER','built','Scanner and backtest can request period=10y from the yfinance provider. For institutional quality, import licensed historical data.'],
  ['Delisted stock database','NEEDS DATA','blocked','Still needs a paid/curated delisted universe to remove survivorship bias. Do not fake this.'],
  ['ASX announcements feed','PLANNED','planned','Structure is ready, but a real announcements provider or ASX integration must be connected.'],
  ['Earnings and dividend calendar','PLANNED','planned','Needed for gap-risk warnings and ex-dividend handling.'],
  ['Brokerage and slippage engine','BUILT','built','Paper and backtest cost modelling includes buy/sell brokerage and slippage.'],
  ['Liquidity and spread model','PART BUILT','partial','Average daily value is built. True live bid/ask spread still needs a live data feed.'],
  ['Walk-forward testing','PART BUILT','partial','Backtest structure exists. Full rolling windows and reports need expansion.'],
  ['Paper-trading journal','BUILT','built','Tracks trade ID, ticker, entry, exit, quantity, P/L, R multiple, result and reason.'],
  ['Sound alerts and voice readouts','BUILT','built','Requires the user to click Enable sound & voice because browsers block autoplay audio.'],
  ['User settings and saved watchlists','PART BUILT','partial','Config exists. Persistent frontend watchlists/settings still need storage.'],
  ['Broker connection only after proof','LOCKED','locked','Correctly locked until backtest, walk-forward and paper trading pass.'],
  ['Chart click-through for every ticker','BUILT','built','Clicking a ticker fetches price history from the backend /prices endpoint.'],
  ['Plain-English signal explanation engine','BUILT','built','Explains pass/fail reasons and trade risk.'],
  ['Market open/close clock','BUILT','built','Backend exposes Australia/Sydney ASX session state and countdowns.'],
];

const sectors = [
  { name: 'Banks', score: 0, change: '-', leaders: 'From live scan', breadth: '-', note: 'Connect backend data' },
  { name: 'Materials', score: 0, change: '-', leaders: 'From live scan', breadth: '-', note: 'Connect backend data' },
  { name: 'Gold', score: 0, change: '-', leaders: 'From live scan', breadth: '-', note: 'Connect backend data' },
  { name: 'Energy', score: 0, change: '-', leaders: 'From live scan', breadth: '-', note: 'Connect backend data' },
];

function money(v){ return `$${Number(v || 0).toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2})}`; }
function fmtPct(v){ return Number.isFinite(Number(v)) ? `${Number(v).toFixed(2)}%` : '-'; }
function statusClass(s){ return `pill ${String(s || 'WATCH').toLowerCase()}`; }
function Card({children, className=''}){ return <section className={`card ${className}`}>{children}</section>; }
function Stat({icon:Icon,label,value,sub, danger}){ return <Card><div className="statTop"><span className="icon"><Icon size={18}/></span><span className={danger?'sub danger':'sub'}>{sub}</span></div><div className="label">{label}</div><div className="statValue">{value}</div></Card>; }

function normaliseSignal(signal){
  const entry = Number(signal.entry || 0);
  return {
    ticker: signal.ticker,
    name: signal.name || signal.ticker,
    sector: signal.sector || 'Unknown',
    price: entry,
    change: 0,
    score: Math.round(Number(signal.score || 0)),
    confidence: Math.round(Number(signal.confidence || 0)),
    grade: signal.grade || 'D',
    status: signal.status || 'BLOCKED',
    setup: signal.setup || 'System scan',
    rr: Number(signal.risk_reward || 0),
    volume: Number(signal.volume_multiple || 0),
    entry,
    stop: Number(signal.stop || 0),
    target: Number(signal.target || 0),
    avgDailyValue: Number(signal.avg_daily_value || 0),
    spreadPct: Number(signal.spread_pct || 0),
    why: signal.reasons || [],
    risks: [...(signal.risks || []), ...(signal.blockers || [])],
    chart: []
  };
}

function countdown(seconds){
  const s = Math.max(0, Number(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return `${h}h ${m}m ${sec}s`;
}

let sharedAudioContext = null;
function getAudioContext(){
  if(typeof window === 'undefined') return null;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if(!AudioContext) return null;
  if(!sharedAudioContext) sharedAudioContext = new AudioContext();
  return sharedAudioContext;
}
async function unlockAudioContext(){
  const ctx = getAudioContext();
  if(ctx && ctx.state === 'suspended') await ctx.resume();
  return Boolean(ctx);
}
function playTone(enabled, type='entry'){
  if(!enabled) return;
  try{
    const ctx = getAudioContext();
    if(!ctx) return;
    const pattern = type === 'stop' ? [260, 190, 160] : type === 'exit' ? [520, 420] : type === 'target' ? [700, 880, 1040] : [880, 1120];
    pattern.forEach((freq, i)=>{
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.frequency.value = freq; osc.type = 'sine';
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i*0.15);
      gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + i*0.15 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i*0.15 + 0.12);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i*0.15); osc.stop(ctx.currentTime + i*0.15 + 0.13);
    });
  }catch(e){ console.warn('Sound failed', e); }
}
function readAloud(enabled, message){
  if(!enabled || typeof window === 'undefined' || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(message);
  u.rate = 0.9; u.pitch = 1; u.volume = 1;
  window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
}
function voiceMessage(type, stock){
  if(!stock) return 'No stock selected.';
  if(type === 'entry') return `${stock.ticker} paper entry alert. Entry ${money(stock.entry)}. Stop ${money(stock.stop)}. Target ${money(stock.target)}. Risk reward ${Number(stock.rr || 0).toFixed(2)} R. Exit if stop, target, or invalidation is reached.`;
  if(type === 'exit') return `${stock.ticker} exit review. Check the trade rules now. Close the paper trade if the exit condition is met.`;
  if(type === 'stop') return `${stock.ticker} stop alert. The stop area has been reached. Exit the paper trade and record the loss unless manual review overrides it.`;
  if(type === 'target') return `${stock.ticker} target alert. The target area has been reached. Take profit or trail according to the plan.`;
  return `${stock.ticker} alert.`;
}

function MarketClock({clock}){
  const open = clock?.is_open;
  return <Card className="clockCard"><h2><Clock3 size={18}/> ASX Market Clock</h2><div className={open?'marketOpen':'marketClosed'}>{clock ? clock.session : 'NO API CLOCK'}</div><p>{clock?.message || 'Connect the backend API to get Australia/Sydney market time.'}</p><div className="miniGrid"><span>Now: {clock?.now_local ? new Date(clock.now_local).toLocaleString() : '-'}</span><span>Next open: {clock?.next_open ? new Date(clock.next_open).toLocaleString() : '-'}</span><span>Next close: {clock?.next_close ? new Date(clock.next_close).toLocaleString() : '-'}</span><span>{open ? `Closes in ${countdown(clock.seconds_to_close)}` : `Opens in ${countdown(clock?.seconds_to_open)}`}</span></div></Card>;
}

function StockChart({ stock, chart, onEntry, onRead }){
  if(!stock) return <Card><h2>No live signals loaded</h2><p className="muted">Set VITE_API_BASE_URL to your backend and set ASX_DATA_PROVIDER=yfinance on the API service to scan real delayed ASX market data.</p></Card>;
  const chartData = chart?.length ? chart : stock.chart;
  return <Card className="chartCard"><div className="chartHead"><div><h2>{stock.ticker} <span className={statusClass(stock.status)}>{stock.status}</span></h2><p>{stock.name} • {stock.sector} • confidence {stock.confidence}/100</p></div><div className="planGrid"><b>Entry<br/><span>{money(stock.entry)}</span></b><b>Stop<br/><span className="red">{money(stock.stop)}</span></b><b>Target<br/><span className="green">{money(stock.target)}</span></b></div></div><div className="tradeActions inline"><button onClick={()=>onEntry(stock)}>Paper Entry Alert</button><button className="ghost" onClick={()=>onRead(stock)}>Read Setup</button></div><div className="chartBox"><ResponsiveContainer width="100%" height={330}><LineChart data={chartData} margin={{top:10,right:20,left:0,bottom:0}}><CartesianGrid stroke="#1e293b" strokeDasharray="3 3"/><XAxis dataKey="d" stroke="#64748b"/><YAxis stroke="#64748b" domain={['dataMin - 2','dataMax + 2']}/><Tooltip contentStyle={{background:'#020617',border:'1px solid #1e293b',color:'#fff'}}/><ReferenceLine y={stock.entry} stroke="#38bdf8" strokeDasharray="5 5"/><ReferenceLine y={stock.stop} stroke="#f87171" strokeDasharray="5 5"/><ReferenceLine y={stock.target} stroke="#34d399" strokeDasharray="5 5"/><Line type="monotone" dataKey="price" stroke="#38bdf8" strokeWidth={3} dot={false}/><Line type="monotone" dataKey="ma20" stroke="#fbbf24" dot={false}/><Line type="monotone" dataKey="ma50" stroke="#a78bfa" dot={false}/></LineChart></ResponsiveContainer></div><div className="explainGrid"><div><h3><CheckCircle2 size={16}/> Why it passed</h3><ul>{(stock.why || []).map(x=><li key={x}>{x}</li>)}</ul></div><div><h3><AlertTriangle size={16}/> Risks / blockers</h3><ul>{(stock.risks || []).map(x=><li key={x}>{x}</li>)}</ul></div><div><h3><BookOpen size={16}/> Costs</h3><p>Costs are modelled in the paper/backtest engine. The trade should be judged on net P/L after entry brokerage, exit brokerage and slippage.</p></div></div></Card>;
}

function TradePopup({trade, onClose, soundOn, voiceOn}){
  if(!trade) return null;
  const title = trade.type === 'stop' ? 'Stop Alert' : trade.type === 'target' ? 'Target Alert' : trade.type === 'exit' ? 'Exit Review' : 'Paper Entry Alert';
  return <div className={`tradePopup ${trade.type || 'entry'}`}><div><h3><Bell size={18}/> {title}</h3><button onClick={onClose}>Close</button></div><b>{trade.ticker} needs action</b><p>Entry {money(trade.entry)} • Stop {money(trade.stop)} • Target {money(trade.target)}</p><p>{trade.message}</p><small>Auto closes after 1 minute. Sound {soundOn?'ON':'OFF'} • Voice {voiceOn?'ON':'OFF'}</small></div>;
}
function AudioPanel({soundOn,setSoundOn,voiceOn,setVoiceOn,onUnlock,audioReady,onAlertTest,onRead}){
  return <Card><h2><Megaphone size={18}/> Sound & Voice Assistant</h2><div className="audioGrid"><button className={audioReady?'ready':'important'} onClick={onUnlock}><RadioTower size={18}/> {audioReady?'Audio unlocked':'Enable sound & voice'}</button><button onClick={()=>setSoundOn(!soundOn)}>{soundOn?<Volume2 size={18}/>:<VolumeX size={18}/>} Sound: {soundOn?'ON':'OFF'}</button><button onClick={()=>setVoiceOn(!voiceOn)}><Megaphone size={18}/> Voice: {voiceOn?'ON':'OFF'}</button><button onClick={onRead}>Read selected setup</button><button onClick={()=>onAlertTest('entry')}><Bell size={18}/> Test entry</button><button onClick={()=>onAlertTest('exit')}><StopCircle size={18}/> Test exit</button></div><p className="muted">Sound will not work until the button is clicked. Also check browser tab mute, system volume and site permissions.</p></Card>;
}
function TradeJournal({trades}){
  const rows = trades || [];
  return <Card><h2>Paper Trade Journal</h2>{rows.length === 0 ? <p className="muted">No paper trades have been entered yet. This is correct for a fresh $5,000 paper account. The old fake win/loss rows have been removed.</p> : <div className="journalTable"><table><thead><tr>{['ID','Ticker','Side','Entry','Exit','Qty','Net P/L','R','Result','Reason'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(t=><tr key={t.trade_id || t.id}><td>{t.trade_id}</td><td>{t.ticker}</td><td>{t.side}</td><td>{money(t.entry_price)}</td><td>{t.exit_price ? money(t.exit_price) : 'OPEN'}</td><td>{t.qty}</td><td className={Number(t.net_pnl)>=0?'green':'red'}>{money(t.net_pnl)}</td><td>{Number(t.r_multiple || 0).toFixed(2)}R</td><td>{t.result}</td><td>{t.exit_reason || '-'}</td></tr>)}</tbody></table></div>}</Card>;
}
function BuildStatusBoard(){ return <Card><h2><CheckCircle size={18}/> Build Status & Real Money Readiness</h2><p className="muted">The free real-data path is now added. Items that still need external licensed data are clearly marked.</p><div className="buildGrid">{buildStatus.map(([item,status,level,detail])=><div key={item} className="buildItem"><div><b>{item}</b><span className={`buildBadge ${level}`}>{status}</span></div><p>{detail}</p></div>)}</div><div className="realMoneyLock"><Lock size={16}/> Real money stays locked until the real-data scan, 10-year test, walk-forward test and at least 50 paper trades pass.</div></Card>; }

function App(){
  const [signals, setSignals] = useState(DEMO_MODE ? demoStocks : {});
  const [selected, setSelected] = useState(DEMO_MODE ? 'CBA' : '');
  const [chart, setChart] = useState([]);
  const [marketClock, setMarketClock] = useState(null);
  const [paper, setPaper] = useState({cash: 5000, equity: 5000});
  const [trades, setTrades] = useState([]);
  const [apiStatus, setApiStatus] = useState(API_BASE ? 'Connecting to backend...' : 'Backend API not connected. Set VITE_API_BASE_URL.');
  const [lastRefresh, setLastRefresh] = useState('-');
  const [soundOn, setSoundOn] = useState(true);
  const [voiceOn, setVoiceOn] = useState(true);
  const [audioReady, setAudioReady] = useState(false);
  const [tradeAlert, setTradeAlert] = useState(null);
  const rows = useMemo(()=>Object.values(signals).sort((a,b)=>b.score-a.score),[signals]);
  const stock = selected ? signals[selected] : rows[0];

  async function api(path, options){
    if(!API_BASE) throw new Error('No VITE_API_BASE_URL configured');
    const res = await fetch(`${API_BASE}${path}`, {cache:'no-store', ...(options || {})});
    if(!res.ok) throw new Error(`${path} HTTP ${res.status}`);
    return res.json();
  }
  async function refreshAll(){
    try{
      const [clockPayload, signalsPayload, paperPayload, tradesPayload] = await Promise.all([
        api('/market-clock'), api('/signals'), api('/paper'), api('/paper/trades')
      ]);
      const next = {};
      (signalsPayload.signals || []).forEach(sig=>{ const row = normaliseSignal(sig); next[row.ticker] = row; });
      setMarketClock(clockPayload);
      setSignals(next);
      setSelected(prev => next[prev] ? prev : Object.keys(next)[0] || '');
      setPaper(paperPayload);
      setTrades(tradesPayload.trades || []);
      setLastRefresh(new Date().toLocaleTimeString());
      setApiStatus(`Connected • provider ${signalsPayload.provider || 'unknown'} • history ${signalsPayload.period || '-'}`);
    }catch(err){ setApiStatus(`API problem: ${err.message}`); }
  }
  useEffect(()=>{ refreshAll(); const timer = setInterval(refreshAll, AUTO_REFRESH_MS); return ()=>clearInterval(timer); },[]);
  useEffect(()=>{
    if(!stock || !API_BASE) return;
    api(`/prices/${stock.ticker}`).then(payload=>{
      const prices = payload.prices || [];
      const mapped = prices.slice(-120).map((p, i)=>({d: String(p.date).slice(5,10), price: Number(p.close), ma20: undefined, ma50: undefined, volume: Number(p.volume || 0)}));
      const withMa = mapped.map((row, i, arr)=>{
        const avg = (n)=> i+1<n ? undefined : arr.slice(i+1-n, i+1).reduce((s,x)=>s+x.price,0)/n;
        return {...row, ma20: avg(20), ma50: avg(50)};
      });
      setChart(withMa);
    }).catch(()=>setChart([]));
  },[selected]);
  useEffect(()=>{ if(!tradeAlert) return; const t=setTimeout(()=>setTradeAlert(null),60000); return ()=>clearTimeout(t); },[tradeAlert]);

  const unlock = async()=>{ const ok = await unlockAudioContext(); setAudioReady(ok); playTone(soundOn, 'target'); readAloud(voiceOn, 'Sound and voice alerts are now enabled for paper trading.'); };
  const triggerAlert = (type, s=stock)=>{ if(!s) return; const message = voiceMessage(type, s); setTradeAlert({...s,type,message}); playTone(soundOn && audioReady, type); readAloud(voiceOn && audioReady, message); };
  const readSetup = (s=stock)=> readAloud(voiceOn && audioReady, voiceMessage('entry', s));

  const marketScore = rows.length ? Math.round(rows.reduce((s,x)=>s+x.score,0)/rows.length) : 0;
  const readyCount = rows.filter(r=>['READY','ARMED'].includes(r.status)).length;
  const bestSector = rows[0]?.sector || '-';

  return <main>
    <header className="hero"><div><h1><Flame/> TRADERS SUCCESS FORMULA: ASX</h1><p>Real-data scanner mode. Auto refresh every {AUTO_REFRESH_MS/1000}s. {apiStatus}. Last refresh: {lastRefresh}</p></div><div className="actions"><button onClick={refreshAll}><Search size={16}/>Refresh now</button><button className="ghost"><BarChart3 size={16}/>Backtest</button><button className="lock"><Lock size={16}/>Live Locked</button></div></header>
    <AudioPanel soundOn={soundOn} setSoundOn={setSoundOn} voiceOn={voiceOn} setVoiceOn={setVoiceOn} onUnlock={unlock} audioReady={audioReady} onAlertTest={(type)=>triggerAlert(type, stock)} onRead={()=>readSetup(stock)}/>
    <MarketClock clock={marketClock}/>
    <div className="stats"><Stat icon={Activity} label="Market Score" value={marketScore} sub={marketClock?.session || 'NO CLOCK'}/><Stat icon={TrendingUp} label="Best Sector" value={bestSector} sub="FROM SCAN"/><Stat icon={Target} label="Ready/Armed" value={readyCount} sub="REAL SCAN"/><Stat icon={ShieldCheck} label="Risk Per Trade" value="0.50%" sub="PAPER"/><Stat icon={WalletCards} label="Paper Equity" value={money(paper.equity || 5000)} sub="$5K START"/></div>
    <div className="gridMain"><Card className="signals"><div className="sectionHead"><h2>Top ASX Signals</h2><span><MousePointerClick size={14}/> click a ticker</span></div>{rows.length === 0 ? <p className="muted">No real signals loaded. Connect the backend API and use ASX_DATA_PROVIDER=yfinance for delayed ASX data.</p> : rows.map(r=><button key={r.ticker} onClick={()=>setSelected(r.ticker)} className={selected===r.ticker?'row active':'row'}><b>{r.ticker}<small>{money(r.price)} <em>{fmtPct(r.change)}</em></small></b><span>{r.setup}</span><span className="score"><i style={{width:`${r.score}%`}}/> {r.score}</span><span>{Number(r.rr || 0).toFixed(2)}R<br/><small>{Number(r.volume || 0).toFixed(2)}x vol</small></span><span className={statusClass(r.status)}>{r.status}</span></button>)}</Card><Card><h2><Radio size={18}/> Alerts</h2><div className={marketClock?.is_open ? 'alert' : 'alert bad'}>{marketClock?.is_open ? 'Market open: scan and paper alerts active.' : 'Market closed: no new paper entries should be treated as live.'}</div><div className="paper"><h3>Paper Account</h3><p>Starting cash: $5,000</p><p>Cash: {money(paper.cash || 5000)}</p><p>Equity: {money(paper.equity || 5000)}</p><p>Open risk: {money(paper.open_risk || 0)}</p><p>Trades: {trades.length}</p></div></Card></div>
    <StockChart stock={stock} chart={chart} onEntry={(s)=>triggerAlert('entry', s)} onRead={readSetup}/><TradePopup trade={tradeAlert} onClose={()=>setTradeAlert(null)} soundOn={soundOn} voiceOn={voiceOn}/>
    <div className="tabsGrid"><Card><h2><Gauge size={18}/> Understand</h2><p>The system now explains when it is safe to scan, whether the ASX is open, why each signal exists, and whether the paper account is taking real paper trades or staying flat.</p></Card><Card><h2><Layers size={18}/> Heatmap</h2><div className="heatmap">{sectors.map(s=><div key={s.name} className={s.score>=70?'hot':s.score<45?'cold':'neutral'}><b>{s.name}</b><strong>{s.score}</strong><small>{s.change}</small><em>{s.breadth}</em><em>{s.note}</em></div>)}</div></Card></div>
    <div className="tabsGrid"><Card><h2>Backtest Equity Curve</h2><ResponsiveContainer width="100%" height={220}><AreaChart data={[]}><XAxis dataKey="week" stroke="#64748b"/><YAxis stroke="#64748b"/><Tooltip/><Area type="monotone" dataKey="value" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.15}/></AreaChart></ResponsiveContainer><p className="muted">No fake backtest chart shown. Run real 10-year backtest from backend/CLI to populate this.</p></Card><Card><h2>Setup Performance</h2><ResponsiveContainer width="100%" height={220}><BarChart data={[]}><XAxis dataKey="name" stroke="#64748b"/><YAxis stroke="#64748b"/><Tooltip/><Bar dataKey="score" fill="#38bdf8" radius={[8,8,0,0]}/></BarChart></ResponsiveContainer><p className="muted">No fake performance shown until real testing runs.</p></Card></div>
    <TradeJournal trades={trades}/><BuildStatusBoard/>
  </main>;
}

createRoot(document.getElementById('root')).render(<App/>);
