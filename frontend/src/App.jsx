import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  CartesianGrid, ComposedChart, Line, Bar, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import { Bell, CheckCircle, Clock3, Flame, Lock, Pause, Play, Search, Volume2, ShieldCheck, Database, Activity } from 'lucide-react';
import './styles.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '');
const AUTO_REFRESH_MS = Number(import.meta.env.VITE_AUTO_REFRESH_MS || 60000);

const buildStatus = [
  ['Free delayed ASX data path','BUILT','built','Yahoo/yfinance .AX provider can be used for delayed ASX prices.'],
  ['10+ years historical data','BUILT VIA PROVIDER','built','Scanner/backtest can request period=10y. Proper licensed history is still better.'],
  ['Delisted stock database','NEEDS DATA','blocked','Needed to remove survivorship bias. This cannot be faked.'],
  ['ASX announcements feed','PLANNED','planned','Needed for halts, capital raises and price-sensitive announcements.'],
  ['Earnings and dividend calendar','PLANNED','planned','Needed for gap-risk and ex-dividend warnings.'],
  ['Brokerage and slippage engine','BUILT','built','Paper/backtest cost model includes entry/exit brokerage and slippage.'],
  ['Liquidity and spread model','PART BUILT','partial','Average value is built. True live bid/ask needs market data.'],
  ['Walk-forward testing','PART BUILT','partial','Base backtest exists. Rolling windows need full reporting.'],
  ['Paper-trading journal','BUILT','built','Tracks entries, exits, P/L, R multiple, result and reason.'],
  ['Sound and voice readouts','BUILT','built','Armed by default. Browser unlock happens on the first user click anywhere.'],
  ['Saved watchlists/settings','PART BUILT','partial','Config exists. Persistent browser storage still needs polishing.'],
  ['Broker connection','LOCKED','locked','Correctly locked until proof. No live broker execution yet.'],
  ['Chart click-through','BUILT','built','Clicking a ticker loads the selected chart and trade plan.'],
  ['Plain-English explanation','BUILT','built','Each selected stock explains entry, exit, warnings and blockers.'],
  ['Market open/close clock','BUILT','built','Uses Australia/Sydney ASX market session clock from backend.'],
];

const fallbackSectors = ['Banks','Materials','Gold','Energy','Healthcare','Lithium','REITs','Tech'];

function money(v){ return `$${Number(v || 0).toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2})}`; }
function pct(v){ return Number.isFinite(Number(v)) ? `${Number(v).toFixed(2)}%` : '-'; }
function timeText(v){ try{return v ? new Date(v).toLocaleTimeString() : '-';}catch{return '-';} }
function countdown(seconds){ const s=Math.max(0,Number(seconds||0)); const h=Math.floor(s/3600); const m=Math.floor((s%3600)/60); const sec=Math.floor(s%60); return `${h}h ${m}m ${sec}s`; }
function statusClass(s){ return `pill ${String(s || 'WATCH').toLowerCase()}`; }
function rowStatus(s){ return ['READY','ARMED'].includes(String(s).toUpperCase()) ? 'WAIT FOR PULLBACK' : String(s || 'WATCH'); }
function buildClass(level){ return `buildBadge ${level}`; }

function normaliseSignal(signal){
  const entry = Number(signal.entry || signal.close || signal.price || 0);
  const score = Math.round(Number(signal.score || signal.total_score || 0));
  return {
    ticker: signal.ticker,
    name: signal.name || signal.ticker,
    sector: signal.sector || 'Unknown',
    price: entry,
    change: Number(signal.change_pct || signal.change || 0),
    score,
    confidence: Math.round(Number(signal.confidence || signal.strength || score)),
    grade: signal.grade || (score >= 85 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : 'D'),
    status: signal.status || (score >= 80 ? 'ARMED' : score >= 65 ? 'WATCH' : 'BLOCKED'),
    setup: signal.setup || signal.pattern || 'System scan',
    rr: Number(signal.risk_reward || signal.rr || 0),
    volume: Number(signal.volume_multiple || signal.volume_ratio || 0),
    entry,
    stop: Number(signal.stop || signal.stop_loss || 0),
    target: Number(signal.target || 0),
    keyZone: signal.key_zone || signal.buy_zone || '',
    avgDailyValue: Number(signal.avg_daily_value || 0),
    spreadPct: Number(signal.spread_pct || 0),
    why: signal.reasons || signal.why || [],
    risks: [...(signal.risks || []), ...(signal.blockers || [])],
  };
}

let sharedAudioContext = null;
function getAudioContext(){
  if(typeof window === 'undefined') return null;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if(!AudioContext) return null;
  if(!sharedAudioContext) sharedAudioContext = new AudioContext();
  return sharedAudioContext;
}
async function unlockAudio(){
  const ctx = getAudioContext();
  if(ctx && ctx.state === 'suspended') await ctx.resume();
  return Boolean(ctx);
}
function playTone(type='entry'){
  try{
    const ctx = getAudioContext(); if(!ctx || ctx.state !== 'running') return;
    const pattern = type === 'stop' ? [260,190,160] : type === 'exit' ? [520,420] : type === 'target' ? [700,880,1040] : [880,1120];
    pattern.forEach((freq,i)=>{
      const osc=ctx.createOscillator(); const gain=ctx.createGain();
      osc.frequency.value=freq; osc.type='sine'; osc.connect(gain); gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001,ctx.currentTime+i*.15);
      gain.gain.exponentialRampToValueAtTime(.08,ctx.currentTime+i*.15+.02);
      gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+i*.15+.12);
      osc.start(ctx.currentTime+i*.15); osc.stop(ctx.currentTime+i*.15+.13);
    });
  }catch(e){ console.warn('sound failed', e); }
}
function speak(message){
  if(typeof window === 'undefined' || !window.speechSynthesis) return;
  try{ const u = new SpeechSynthesisUtterance(message); u.rate=.92; u.pitch=1; u.volume=1; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u); }catch(e){ console.warn('voice failed', e); }
}
function voiceMessage(type, stock){
  if(!stock) return 'No stock selected.';
  if(type==='entry') return `${stock.ticker} paper trade alert. Entry ${money(stock.entry)}. Buy zone ${stock.keyZone || money(stock.entry)}. Stop ${money(stock.stop)}. Target ${money(stock.target)}. Do not enter if price is outside the buy zone or market conditions fail.`;
  if(type==='exit') return `${stock.ticker} exit review. Check the exit rules now. Close the paper trade if stop, target or invalidation has triggered.`;
  if(type==='stop') return `${stock.ticker} stop alert. Exit the paper trade and record the loss unless manual review overrides the signal.`;
  if(type==='target') return `${stock.ticker} target alert. Take profit or trail the stop according to the plan.`;
  return `${stock.ticker} alert.`;
}

function TopBox({label,value,sub, danger}){ return <div className="statusCell"><label>{label}</label><b className={danger?'red':''}>{value}</b>{sub && <small className="muted">{sub}</small>}</div>; }
function TradePopup({trade,onClose}){ if(!trade) return null; return <div className={`tradePopup ${trade.type||'entry'}`}><button onClick={onClose}>CLOSE</button><h3><Bell size={16}/> {trade.type === 'exit' ? 'EXIT REVIEW' : trade.type === 'stop' ? 'STOP ALERT' : trade.type === 'target' ? 'TARGET ALERT' : 'PAPER ENTRY ALERT'}</h3><p><b>{trade.ticker}</b> {trade.message}</p><p className="compactNote">This box closes after 1 minute. Sound/voice is armed after first click anywhere on the page.</p></div>; }

function PriorityCards({rows}){
  const top = rows.slice(0,3);
  if(!top.length) return null;
  return <div className="priorityGrid">{top.map((r,i)=><div className="priority" key={r.ticker}><h4>{i+1}. {r.ticker}</h4><b>{rowStatus(r.status)}</b><span>Entry score: {r.score} | Strength: {r.confidence}</span><small className="muted">{r.rr ? `${r.rr.toFixed(2)}R reward profile` : 'Review buy zone and stop'}</small></div>)}</div>;
}

function SignalsTable({rows, selected, setSelected}){
  return <section className="signalsPanel"><div className="panelHead"><span>Advanced Signals</span><small>Auto-scan watchlist and expandable trade plan</small></div><div className="tableWrap"><table className="signalsTable"><thead><tr><th>Ticker</th><th>Action</th><th>Entry Score</th><th>Strength</th><th>Price</th><th>Key Zone</th><th>Stop</th><th>Target</th><th>R/R</th><th>Reason</th></tr></thead><tbody>{rows.length ? rows.map(r=><tr key={r.ticker} onClick={()=>setSelected(r.ticker)} className={selected===r.ticker?'active':''}><td className="ticker">{r.ticker}</td><td><span className={statusClass(r.status)}>{rowStatus(r.status)}</span></td><td>{r.score}</td><td>{r.confidence}</td><td>{money(r.price)}</td><td>{r.keyZone || `${money(r.entry)} to ${money(r.target)}`}</td><td>{money(r.stop)}</td><td>{money(r.target)}</td><td>{Number(r.rr||0).toFixed(2)}</td><td>{(r.why && r.why[0]) || r.setup || 'Signal generated from scan.'}</td></tr>) : <tr><td colSpan="10" className="emptyBox">No signals loaded yet. Check backend URL and data provider.</td></tr>}</tbody></table></div></section>;
}

function SelectedTrade({stock, marketOpen, onEntry, onExit, onRead}){
  if(!stock) return <section className="selectedPanel"><div className="panelHead"><span>Selected Trade</span></div><div className="emptyBox">No stock selected.</div></section>;
  const blocked = !marketOpen;
  return <section className="selectedPanel"><div className="panelHead"><span>Selected Trade</span><small>{stock.ticker}</small></div><div className="selectedGrid"><div className="selectedStat"><label>Price</label><b>{money(stock.price)}</b></div><div className="selectedStat"><label>Buy Zone</label><b>{stock.keyZone || `${money(stock.entry)} to ${money(stock.target)}`}</b></div><div className="selectedStat"><label>Stop</label><b className="red">{money(stock.stop)}</b></div><div className="selectedStat"><label>Target</label><b className="green">{money(stock.target)}</b></div></div><div className="tradeText"><h3>{stock.ticker} - {rowStatus(stock.status)}</h3><p><b>Action:</b> {blocked ? 'Market closed. Review plan only. No paper entry until ASX opens.' : `Do not enter unless price is inside the buy zone and entry rules still apply.`}</p><p><b>Exit plan:</b> Exit at stop, target, invalidation, or if the signal weakens below threshold.</p><p><b>Setup:</b> {stock.setup}. Score {stock.score}, strength {stock.confidence}, R/R {Number(stock.rr||0).toFixed(2)}.</p><div className="btnRow"><button className="tinyBtn" onClick={()=>onRead(stock)}><Volume2 size={13}/> READ PLAN</button><button className="tinyBtn gold" onClick={()=>onEntry(stock)} disabled={blocked}>{blocked?'MARKET CLOSED':'PAPER ENTRY ALERT'}</button><button className="tinyBtn danger" onClick={()=>onExit(stock)}>EXIT REVIEW</button></div></div><div className="warnings"><b>Warnings:</b><ul>{(stock.risks?.length?stock.risks:['No risk notes returned by backend. Check chart and market clock before action.']).map(x=><li key={x}>{x}</li>)}</ul></div><div className="whyBox"><h4>Why it ranked</h4><ul>{(stock.why?.length?stock.why:['Signal came from scanner ranking. Connect real provider for richer reasons.']).map(x=><li key={x}>{x}</li>)}</ul></div></section>;
}

function ChartPanel({stock, chart}){
  const data = chart?.length ? chart : [];
  return <section className="chartPanel"><div className="panelHead"><span>Clean Candlestick Check</span><small>Trend, buy zone, stop and target</small></div><div className="chartWrapper"><div className="chartTitle">{stock?.ticker || 'ASX'}</div><div className="chartBox">{stock && data.length ? <ResponsiveContainer width="100%" height="100%"><ComposedChart data={data} margin={{top:8,right:32,left:0,bottom:0}}><CartesianGrid stroke="#052b18"/><XAxis dataKey="d" stroke="#00aa66" tick={{fontSize:10}}/><YAxis stroke="#00aa66" tick={{fontSize:10}} domain={['dataMin - 2','dataMax + 2']}/><Tooltip contentStyle={{background:'#000905',border:'1px solid #00b86b',color:'#caffdf'}}/><ReferenceLine y={stock.entry} stroke="#f6b73c" strokeDasharray="4 4"/><ReferenceLine y={stock.stop} stroke="#ff3366" strokeDasharray="4 4"/><ReferenceLine y={stock.target} stroke="#00ff88" strokeDasharray="4 4"/><Bar dataKey="volumeScaled" fill="#052b18" yAxisId="vol"/><Line type="monotone" dataKey="price" stroke="#00ff88" strokeWidth={2} dot={false}/><Line type="monotone" dataKey="ma20" stroke="#f6b73c" dot={false}/><Line type="monotone" dataKey="ma50" stroke="#00a1ff" dot={false}/><YAxis yAxisId="vol" hide domain={[0,'dataMax']}/></ComposedChart></ResponsiveContainer> : <div className="emptyBox">Click a stock after signals load to show the chart.</div>}</div></div></section>;
}

function PaperPanel({paper,trades,onReset}){
  const rows = trades || [];
  return <section className="paperPanel"><div className="panelHead"><span>$5,000 Paper Account</span><small>No fake profits. Only real paper actions appear.</small></div><div className="paperStats"><TopBox label="Trades" value={rows.length}/><TopBox label="Cash" value={money(paper.cash||5000)}/><TopBox label="Equity" value={money(paper.equity||5000)}/><TopBox label="Open Risk" value={money(paper.open_risk||0)}/><TopBox label="Win Rate" value={paper.win_rate ? pct(paper.win_rate) : '0.00%'}/><TopBox label="Closed Trades" value={paper.closed_trades || 0}/><TopBox label="Auto Refresh" value={`${AUTO_REFRESH_MS/1000}s`}/><TopBox label="Status" value="Paper Only"/></div><div className="paperControls"><input placeholder="Manual symbol"/><input placeholder="Manual note"/><button onClick={onReset}>CLEAR PAPER</button></div><div className="activityLog">{rows.length ? rows.slice().reverse().map(t=><p key={t.trade_id || t.id}>{t.ticker} {t.result || 'OPEN'} net {money(t.net_pnl || 0)} reason {t.exit_reason || '-'}</p>) : <p>No paper trades yet. This is correct until a real paper entry is made.</p>}</div></section>;
}

function Heatmap({rows}){
  const grouped = fallbackSectors.map(sec=>{
    const list = rows.filter(r=>String(r.sector).toLowerCase().includes(sec.toLowerCase()) || (sec==='Gold' && /gold/i.test(r.name||'')) || (sec==='Lithium' && /lithium/i.test(r.name||'')));
    const avg = list.length ? Math.round(list.reduce((s,x)=>s+x.score,0)/list.length) : 0;
    return {name:sec, score:avg, count:list.length, leaders:list.slice(0,3).map(x=>x.ticker).join(', ') || 'Waiting'};
  });
  return <section className="heatPanel"><div className="panelHead"><span>Australian Heatmap</span><small>Sector strength from current scan list</small></div><div className="heatGrid">{grouped.map(g=><div key={g.name} className={`heatTile ${g.score>=75?'hot':g.score<45?'cold':''}`}><strong>{g.name}</strong><b>{g.score || '-'}</b><small>{g.count} names</small><small>{g.leaders}</small></div>)}</div></section>;
}
function Journal({trades}){ return <section className="journalPanel"><div className="panelHead"><span>Paper Trade Journal</span><small>Entries, exits, wins, losses, R multiple and reason</small></div><div className="journalTable"><table><thead><tr>{['ID','Ticker','Side','Entry','Exit','Qty','Net P/L','R','Result','Reason'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{trades?.length ? trades.map(t=><tr key={t.trade_id||t.id}><td>{t.trade_id}</td><td className="ticker">{t.ticker}</td><td>{t.side}</td><td>{money(t.entry_price)}</td><td>{t.exit_price ? money(t.exit_price) : 'OPEN'}</td><td>{t.qty}</td><td className={Number(t.net_pnl)>=0?'green':'red'}>{money(t.net_pnl)}</td><td>{Number(t.r_multiple||0).toFixed(2)}R</td><td>{t.result}</td><td>{t.exit_reason || '-'}</td></tr>) : <tr><td colSpan="10" className="emptyBox">No paper trades recorded.</td></tr>}</tbody></table></div></section>; }

function InstitutionalPanel({readiness, quality}){
  const items = readiness?.items || [];
  const risk = readiness?.risk_book || {};
  return <section className="institutionPanel"><div className="panelHead"><span><ShieldCheck size={15}/> Institutional Risk Desk</span><small>Hedge-fund style readiness, data quality, audit and risk-book view</small></div><div className="paperStats"><TopBox label="Desk Score" value={`${readiness?.score ?? 0}/100`}/><TopBox label="Signals" value={risk.count || 0}/><TopBox label="Ready/Armed" value={risk.ready || 0}/><TopBox label="Blocked" value={risk.blocked || 0}/><TopBox label="Avg Score" value={risk.avg_score || 0}/><TopBox label="Top Sector" value={risk.top_sector || '-'}/><TopBox label="Live Trading" value={readiness?.live_trading_allowed ? 'UNLOCKED' : 'LOCKED'} danger={!readiness?.live_trading_allowed}/><TopBox label="Data QA" value={quality?.passed ? 'PASS' : 'CHECK'} danger={!quality?.passed}/></div><div className="institutionGrid">{items.map((x)=><div key={x.gate} className="institutionItem"><b>{x.gate}</b><span className={buildClass(String(x.status).toLowerCase()==='pass'?'built':String(x.status).toLowerCase()==='warn'?'partial':String(x.status).toLowerCase()==='locked'?'locked':String(x.status).toLowerCase()==='blocked'?'blocked':'planned')}>{x.status}</span><p>{x.note}</p></div>)}</div>{quality && <div className="qaBox"><h4><Database size={14}/> Selected Data Quality: {quality.ticker}</h4><p>Rows: {quality.rows} • First: {quality.first_date || '-'} • Last: {quality.last_date || '-'} • Stale days: {quality.stale_days}</p>{quality.warnings?.length ? <ul>{quality.warnings.map(w=><li key={w}>{w}</li>)}</ul> : <p>No major data warnings returned.</p>}</div>}</section>;
}

function BuildStatusBoard(){ return <section className="buildPanel"><div className="panelHead"><span><CheckCircle size={15}/> Build Status</span><small>What is built vs what still needs licensed data</small></div><div className="buildGrid">{buildStatus.map(([item,status,level,detail])=><div key={item} className="buildItem"><b>{item}</b><span className={buildClass(level)}>{status}</span><p>{detail}</p></div>)}</div></section>; }

function App(){
  const [signals,setSignals] = useState({});
  const [selected,setSelected] = useState('');
  const [chart,setChart] = useState([]);
  const [clock,setClock] = useState(null);
  const [paper,setPaper] = useState({cash:5000,equity:5000});
  const [trades,setTrades] = useState([]);
  const [apiStatus,setApiStatus] = useState('Connecting');
  const [scanMessage,setScanMessage] = useState('Waiting for scan.');
  const [lastRefresh,setLastRefresh] = useState('-');
  const [soundArmed,setSoundArmed] = useState(false);
  const [paused,setPaused] = useState(false);
  const [tradeAlert,setTradeAlert] = useState(null);
  const [readiness,setReadiness] = useState(null);
  const [quality,setQuality] = useState(null);
  const didSpeakRef = useRef(false);
  const rows = useMemo(()=>Object.values(signals).sort((a,b)=>b.score-a.score),[signals]);
  const stock = selected ? signals[selected] : rows[0];

  async function api(path, options){ const res = await fetch(`${API_BASE}${path}`, {cache:'no-store', ...(options||{})}); if(!res.ok) throw new Error(`${path} HTTP ${res.status}`); return res.json(); }
  async function refreshAll(){
    if(paused) return;
    try{
      const [clockPayload, signalsPayload, paperPayload, tradesPayload, readyPayload] = await Promise.all([api('/market-clock'), api('/signals'), api('/paper'), api('/paper/trades'), api('/institutional-readiness')]);
      const next = {}; (signalsPayload.signals||[]).forEach(sig=>{ const r=normaliseSignal(sig); next[r.ticker]=r; });
      setClock(clockPayload); setSignals(next); setSelected(prev=>next[prev]?prev:Object.keys(next)[0]||''); setPaper(paperPayload||{cash:5000,equity:5000}); setTrades(tradesPayload.trades||[]);
      setReadiness(readyPayload); setLastRefresh(new Date().toLocaleTimeString()); setScanMessage(signalsPayload.message || 'Scan complete.'); setApiStatus(`Connected • ${signalsPayload.provider || 'provider'} • ${signalsPayload.period || '-'} • ${signalsPayload.mode || 'scan'}`);
    }catch(err){ setApiStatus(`API problem: ${err.message}`); setScanMessage('Backend is not returning scan data. Check Render API URL and logs.'); }
  }
  useEffect(()=>{ refreshAll(); const timer=setInterval(refreshAll,AUTO_REFRESH_MS); return()=>clearInterval(timer); },[paused]);
  useEffect(()=>{
    async function unlockOnFirstClick(){ const ok=await unlockAudio(); setSoundArmed(ok); if(ok && !didSpeakRef.current){ didSpeakRef.current=true; speak('ASX scanner sound and voice alerts are armed.'); playTone('target'); } }
    window.addEventListener('pointerdown', unlockOnFirstClick, {once:true});
    return()=>window.removeEventListener('pointerdown', unlockOnFirstClick);
  },[]);
  useEffect(()=>{
    if(!stock) return; api(`/prices/${stock.ticker}`).then(payload=>{
      const prices = (payload.prices||[]).slice(-130);
      const mapped = prices.map(p=>({d:String(p.date).slice(5,10), price:Number(p.close), volume:Number(p.volume||0)}));
      const maxVol = Math.max(...mapped.map(x=>x.volume),1);
      const withMa = mapped.map((row,i,arr)=>{ const avg=n=>i+1<n?undefined:arr.slice(i+1-n,i+1).reduce((s,x)=>s+x.price,0)/n; return {...row, ma20:avg(20), ma50:avg(50), volumeScaled: row.price - (row.volume/maxVol)*2}; });
      setChart(withMa);
    }).catch(()=>setChart([]));
    api(`/data-quality/${stock.ticker}`).then(setQuality).catch(()=>setQuality(null));
  },[selected]);
  useEffect(()=>{ if(!tradeAlert) return; const t=setTimeout(()=>setTradeAlert(null),60000); return()=>clearTimeout(t); },[tradeAlert]);
  function trigger(type,s=stock){ if(!s) return; const msg=voiceMessage(type,s); setTradeAlert({...s,type,message:msg}); if(soundArmed) {playTone(type); speak(msg);} }
  function readPlan(s=stock){ if(s && soundArmed) speak(voiceMessage('entry',s)); }
  async function resetPaper(){ try{ await api('/paper/reset',{method:'POST'}); refreshAll(); }catch(e){ setScanMessage(`Paper reset failed: ${e.message}`); } }

  const marketScore = rows.length ? Math.round(rows.reduce((s,x)=>s+x.score,0)/rows.length) : 0;
  const ready = rows.filter(r=>['READY','ARMED'].includes(String(r.status).toUpperCase())).length;
  const best = rows[0]?.sector || '-';
  const open = Boolean(clock?.is_open);

  return <main>
    <div className="header">
      <div className="titleBox terminal"><h1><Flame size={18}/> ASX Trade Scanner</h1><p><span className={API_BASE ? 'connectionDot':'connectionDot bad'}></span>{apiStatus}. Auto-refresh {AUTO_REFRESH_MS/1000}s. Last scan {lastRefresh}</p><p className="audioTiny">Sound/voice: {soundArmed?'ON':'click anywhere to arm'} • No test buttons</p></div>
      <div className="statusGrid"><TopBox label="Local Time" value={new Date().toLocaleTimeString()}/><TopBox label="ASX Market" value={clock?.session || 'Unknown'} danger={!open}/><TopBox label="Market Countdown" value={open?`closes in ${countdown(clock?.seconds_to_close)}`:`opens in ${countdown(clock?.seconds_to_open)}`}/><TopBox label="Next Scan" value={`${AUTO_REFRESH_MS/1000}s`}/><TopBox label="Equity" value={money(paper.equity||5000)}/></div>
      <div className="soundBox"><button className="scanBtn" onClick={refreshAll}><Search size={14}/> SCAN NOW</button><button className="pauseBtn" onClick={()=>setPaused(!paused)}>{paused?<Play size={14}/>:<Pause size={14}/>} {paused?'RESUME':'PAUSE'}</button></div>
    </div>
    <div className="banner"><h3>High-level signal now</h3><p>{rows[0] ? `${rows[0].ticker} is the current top-ranked candidate. ${scanMessage}` : scanMessage}</p></div>
    {!open && <div className="banner warn"><h3>Scanner resumed after-hours</h3><p>Market is closed, but candidates still show for planning. Paper entries are blocked until the ASX is open.</p></div>}
    <PriorityCards rows={rows}/>
    <SignalsTable rows={rows} selected={stock?.ticker || selected} setSelected={setSelected}/>
    <SelectedTrade stock={stock} marketOpen={open} onEntry={(s)=>trigger('entry',s)} onExit={(s)=>trigger('exit',s)} onRead={readPlan}/>
    <ChartPanel stock={stock} chart={chart}/>
    <PaperPanel paper={paper} trades={trades} onReset={resetPaper}/>
    <Journal trades={trades}/>
    <InstitutionalPanel readiness={readiness} quality={quality}/>
    <Heatmap rows={rows}/>
    <BuildStatusBoard/>
    <TradePopup trade={tradeAlert} onClose={()=>setTradeAlert(null)}/>
  </main>;
}

createRoot(document.getElementById('root')).render(<App/>);
