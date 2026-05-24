import React, { useMemo, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import {
  AlertTriangle, Activity, BarChart3, BookOpen, CheckCircle2, Flame,
  Gauge, Layers, Lock, MousePointerClick, Radio, Search, ShieldCheck,
  Target, TrendingUp, WalletCards, XCircle, Bell, Volume2, VolumeX, Megaphone, Grid3X3,
  RadioTower, ClipboardList, CheckCircle, StopCircle
} from 'lucide-react';
import './styles.css';

const stocks = {
  CBA: {
    ticker: 'CBA', name: 'Commonwealth Bank', sector: 'Banks', price: 123.4, change: 1.8,
    score: 91, confidence: 88, grade: 'A+', status: 'READY', setup: 'Clean pullback', rr: 2.8, volume: 1.7,
    entry: 123.2, stop: 119.8, target: 132.7, risk: '0.50%', paperQty: 147,
    why: ['Trend above 20MA, 50MA, and 200MA', 'Banks sector is leading', 'Pullback held support', 'Volume returned on trigger'],
    risks: ['Bank sector is crowded', 'Needs ASX 200 to hold support'],
    chart: [116.5, 117.4, 119.1, 118.6, 120.2, 121.5, 123.4].map((price, i) => ({ d: `D${i+1}`, price, ma20: 115+i*.55, ma50: 113+i*.42, volume: [1,1.1,1.3,.9,1.2,1.4,1.7][i] }))
  },
  BHP: {
    ticker: 'BHP', name: 'BHP Group', sector: 'Materials', price: 45.12, change: 1.2,
    score: 86, confidence: 82, grade: 'A', status: 'ARMED', setup: 'Breakout watch', rr: 2.4, volume: 1.5,
    entry: 45.3, stop: 43.7, target: 49.1, risk: '0.50%', paperQty: 312,
    why: ['Materials sector is strong', 'Price is pressing resistance', 'Volume is expanding', 'Commodity confirmation required'],
    risks: ['Commodity-sensitive', 'China news can gap price'],
    chart: [42.7,43.2,43.8,44.1,44.5,44.9,45.12].map((price, i) => ({ d: `D${i+1}`, price, ma20: 42.3+i*.27, ma50: 41.9+i*.22, volume: [.9,1,1.2,1.1,1.3,1.4,1.5][i] }))
  },
  WES: {
    ticker: 'WES', name: 'Wesfarmers', sector: 'Consumer', price: 67.8, change: .6,
    score: 78, confidence: 71, grade: 'B', status: 'WATCH', setup: 'Base forming', rr: 1.9, volume: 1.1,
    entry: 68.5, stop: 66.2, target: 72.8, risk: '0.25%', paperQty: 108,
    why: ['Base is forming', 'Trend is acceptable', 'Needs cleaner trigger'],
    risks: ['Reward is not high enough yet', 'Volume is not strong enough'],
    chart: [66.8,67.1,66.7,67.3,67.5,67.6,67.8].map((price, i) => ({ d: `D${i+1}`, price, ma20: 66.1+i*.18, ma50: 65+i*.2, volume: [.8,.9,.8,1,1,1,1.1][i] }))
  },
  CSL: {
    ticker: 'CSL', name: 'CSL Limited', sector: 'Healthcare', price: 284.1, change: -.9,
    score: 62, confidence: 43, grade: 'C', status: 'BLOCKED', setup: 'Weak relative strength', rr: 1.3, volume: .8,
    entry: 291, stop: 279, target: 306, risk: '0%', paperQty: 0,
    why: ['Quality company, but not a quality setup today'],
    risks: ['Healthcare sector is weak', 'No real entry trigger', 'Reward is not high enough'],
    chart: [292,290,288,286,285.5,286,284.1].map((price, i) => ({ d: `D${i+1}`, price, ma20: 293-i*.72, ma50: 296-i*.5, volume: [1,.9,.8,.9,.8,.7,.8][i] }))
  }
};

const sectors = [
  { name: 'Banks', score: 87, change: '+1.4%', leaders: 'CBA, NAB, WBC', breadth: '82% above 20MA', note: 'Crowded but strong' },
  { name: 'Materials', score: 79, change: '+1.1%', leaders: 'BHP, RIO, FMG', breadth: '71% above 20MA', note: 'Check iron ore' },
  { name: 'Gold', score: 74, change: '+0.9%', leaders: 'NEM, NST, EVN', breadth: '68% above 20MA', note: 'Gold tape supportive' },
  { name: 'Tech', score: 66, change: '+0.7%', leaders: 'XRO, WTC', breadth: '61% above 20MA', note: 'Needs Nasdaq lead' },
  { name: 'Energy', score: 58, change: '+0.2%', leaders: 'WDS, STO, ALD', breadth: '49% above 20MA', note: 'Oil mixed' },
  { name: 'REITs', score: 52, change: '+0.1%', leaders: 'GMG, SCG', breadth: '47% above 20MA', note: 'Rate sensitive' },
  { name: 'Healthcare', score: 43, change: '-0.6%', leaders: 'RMD, COH', breadth: '34% above 20MA', note: 'CSL weak' },
  { name: 'Lithium', score: 31, change: '-1.8%', leaders: 'PLS, MIN', breadth: '22% above 20MA', note: 'Avoid weak tape' }
];
const heatmapGroups = [
  { title: 'Market', items: [['ASX 200',74,'+0.8%','Tradeable'], ['ASX 300',69,'+0.5%','Positive'], ['Small Ords',54,'+0.1%','Mixed'], ['Breadth',67,'63%','Above 20MA']] },
  { title: 'Commodities', items: [['Gold',76,'+0.9%','Supports gold miners'], ['Iron Ore',72,'+0.6%','Supports BHP/RIO'], ['Oil',51,'-0.2%','Neutral energy'], ['Lithium',29,'-2.1%','Avoid weak names']] },
  { title: 'Signal Flow', items: [['Breakouts',70,'8 found','Selective'], ['Pullbacks',81,'5 ready','Best setup'], ['Volume Spikes',73,'12 names','Confirm entries'], ['Blocked',38,'21 names','Weak RS/liquidity']] }
];
const equity = [100,101.2,100.8,103.1,104.6,104.1,106.7,108.9].map((value, i) => ({ week: `W${i+1}`, value }));
const setupPerformance = [{name:'Breakout',score:68},{name:'Pullback',score:74},{name:'GMMA',score:61},{name:'News',score:55}];

const buildStatus = [
  ['Real ASX data provider','NEEDS PROVIDER','blocked','Interface exists, but a paid/free ASX data feed must be selected and connected.'],
  ['10+ years historical data','NEEDS DATA','blocked','Backtest engine exists, but full daily history must be imported before trusting results.'],
  ['Delisted stock database','NEEDS DATA','blocked','Needed to remove survivorship bias so old failed companies are included.'],
  ['ASX announcements feed','PLANNED','planned','Required for trading halts, capital raises, price-sensitive announcements and news-risk blocking.'],
  ['Earnings and dividend calendar','PLANNED','planned','Required to warn before results, ex-dividend dates and possible gap-risk events.'],
  ['Brokerage and slippage engine','BUILT','built','Included in paper/backtest cost modelling and configurable by broker.'],
  ['Liquidity and spread model','PART BUILT','partial','Rules exist, but live bid/ask spread needs a market data feed.'],
  ['Walk-forward testing','PART BUILT','partial','Backtest structure exists, but full rolling walk-forward windows need expanding.'],
  ['Paper-trading journal','BUILT','built','Tracks trade ID, ticker, entry, exit, quantity, P/L, R multiple, result and reason.'],
  ['Sound alerts and voice readouts','BUILT','built','Frontend includes browser audio unlock, tones and voice readouts for entry/exit/stop/target.'],
  ['User settings and saved watchlists','PART BUILT','partial','Config exists. Persistent frontend settings and saved watchlists need storage.'],
  ['Broker connection only after proof','LOCKED','locked','Correctly locked. No real broker connection until backtest and paper trading pass.'],
  ['Chart click-through for every ticker','BUILT','built','Clicking a ticker opens chart, plan, reasons, risks and paper trade action.'],
  ['Plain-English signal explanation engine','BUILT','built','Explains why a trade passed, failed, or needs review.'],
  ['Confidence score based on past similar trades','PART BUILT','partial','Framework exists. Needs historical similarity database to make it real.'],
];


function money(v){ return `$${Number(v).toLocaleString(undefined,{maximumFractionDigits:2})}`; }
function statusClass(s){ return `pill ${s.toLowerCase()}`; }
function Card({children, className=''}){ return <section className={`card ${className}`}>{children}</section>; }
function Stat({icon:Icon,label,value,sub, danger}){ return <Card><div className="statTop"><span className="icon"><Icon size={18}/></span><span className={danger?'sub danger':'sub'}>{sub}</span></div><div className="label">{label}</div><div className="statValue">{value}</div></Card> }

function StockChart({ stock }){
  return <Card className="chartCard">
    <div className="chartHead">
      <div><h2>{stock.ticker} <span className={statusClass(stock.status)}>{stock.status}</span></h2><p>{stock.name} • {stock.sector} • confidence {stock.confidence}/100</p></div>
      <div className="planGrid"><b>Entry<br/><span>{money(stock.entry)}</span></b><b>Stop<br/><span className="red">{money(stock.stop)}</span></b><b>Target<br/><span className="green">{money(stock.target)}</span></b></div>
    </div>
    <div className="chartBox">
      <ResponsiveContainer width="100%" height={330}>
        <LineChart data={stock.chart} margin={{top:10,right:20,left:0,bottom:0}}>
          <CartesianGrid stroke="#1e293b" strokeDasharray="3 3"/><XAxis dataKey="d" stroke="#64748b"/><YAxis stroke="#64748b" domain={['dataMin - 2','dataMax + 2']}/><Tooltip contentStyle={{background:'#020617',border:'1px solid #1e293b',color:'#fff'}}/>
          <ReferenceLine y={stock.entry} stroke="#38bdf8" strokeDasharray="5 5"/><ReferenceLine y={stock.stop} stroke="#f87171" strokeDasharray="5 5"/><ReferenceLine y={stock.target} stroke="#34d399" strokeDasharray="5 5"/>
          <Line type="monotone" dataKey="price" stroke="#38bdf8" strokeWidth={3}/><Line type="monotone" dataKey="ma20" stroke="#fbbf24" dot={false}/><Line type="monotone" dataKey="ma50" stroke="#a78bfa" dot={false}/>
        </LineChart>
      </ResponsiveContainer>
    </div>
    <div className="explainGrid">
      <div><h3><CheckCircle2 size={16}/> Why it passed</h3><ul>{stock.why.map(x=><li key={x}>{x}</li>)}</ul></div>
      <div><h3><AlertTriangle size={16}/> What can go wrong</h3><ul>{stock.risks.map(x=><li key={x}>{x}</li>)}</ul></div>
      <div><h3><BookOpen size={16}/> Plain English</h3><p>{stock.status === 'BLOCKED' ? 'Do not trade this yet. The system is protecting the account.' : `${stock.ticker} has a valid trade plan. The entry, stop and target are visible so the user knows exactly what has to happen.`}</p></div>
    </div>
  </Card>
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
function playTone(enabled, type='entry'){
  if(!enabled) return;
  try{
    const ctx = getAudioContext();
    if(!ctx) return;
    const pattern = type === 'exit' ? [520, 420] : type === 'stop' ? [260, 190, 160] : type === 'target' ? [700, 880, 1040] : [880, 1120];
    pattern.forEach((freq, i)=>{
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i*0.15);
      gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + i*0.15 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i*0.15 + 0.12);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i*0.15);
      osc.stop(ctx.currentTime + i*0.15 + 0.13);
    });
  }catch(e){}
}
function speak(enabled, message){
  if(!enabled || typeof window === 'undefined' || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(message);
  u.rate = 0.92; u.pitch = 1; u.volume = 1;
  window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
}
function buildVoiceMessage(type, stock){
  if(type === 'entry') return `${stock.ticker} paper trade entered. Entry ${money(stock.entry)}. Stop ${money(stock.stop)}. Target ${money(stock.target)}. Risk is controlled. Exit if stop, target, or invalidation occurs.`;
  if(type === 'exit') return `${stock.ticker} exit alert. Close the paper trade and record the exit reason, price, net profit and R multiple.`;
  if(type === 'stop') return `${stock.ticker} stop alert. Price has hit the stop area. Exit the paper trade and mark it as a loss unless the user manually overrides in review mode.`;
  if(type === 'target') return `${stock.ticker} target alert. Price has reached the target area. Take profit or trail according to the trade plan.`;
  return `${stock.ticker} alert.`;
}
function TradePopup({trade, onClose, soundOn, voiceOn}){
  if(!trade) return null;
  const title = trade.type === 'stop' ? 'Stop Alert' : trade.type === 'target' ? 'Target Alert' : trade.type === 'exit' ? 'Exit Alert' : 'Paper Trade Entered';
  return <div className={`tradePopup ${trade.type || 'entry'}`}><div><h3><Bell size={18}/> {title}</h3><button onClick={onClose}>Close</button></div><b>{trade.ticker} {trade.type === 'entry' ? 'opened' : 'needs action'}</b><p>Entry {money(trade.entry)} • Stop {money(trade.stop)} • Target {money(trade.target)}</p><p>{trade.message}</p><small>Auto closes after 1 minute. Sound {soundOn?'ON':'OFF'} • Voice {voiceOn?'ON':'OFF'}</small></div>
}
function AudioPanel({soundOn,setSoundOn,voiceOn,setVoiceOn,onTest,onUnlock,audioReady,onAlertTest}){
  return <Card><h2><Megaphone size={18}/> Sound & Voice Assistant</h2><div className="audioGrid"><button className={audioReady?'ready':''} onClick={onUnlock}><RadioTower size={18}/> {audioReady?'Audio unlocked':'Enable sound & voice'}</button><button onClick={()=>setSoundOn(!soundOn)}>{soundOn?<Volume2 size={18}/>:<VolumeX size={18}/>} Sound alerts: {soundOn?'ON':'OFF'}</button><button onClick={()=>setVoiceOn(!voiceOn)}><Megaphone size={18}/> Voice readouts: {voiceOn?'ON':'OFF'}</button><button onClick={onTest}>Read selected setup</button><button onClick={()=>onAlertTest('entry')}><Bell size={18}/> Test entry</button><button onClick={()=>onAlertTest('exit')}><StopCircle size={18}/> Test exit</button></div><p className="muted">Browsers block sound until the user clicks Enable sound & voice. After that, the system can beep and read entry, exit, stop-hit, target-hit, invalidation and blocked-trade alerts during paper testing.</p></Card>
}
function TradeJournal(){
  const trades = [
    ['T-001','CBA','LONG','$121.10','Open','2','+$4.60','+0.68R','OPEN','Still above stop'],
    ['T-002','BHP','LONG','$44.20','$45.90','10','+$17.00','+1.06R','WIN','Target trail hit'],
    ['T-003','WES','LONG','$67.10','$66.20','4','-$3.60','-1.00R','LOSS','Stop hit'],
  ];
  return <Card><h2><ClipboardList size={18}/> Paper Trade Journal</h2><div className="journalTable"><table><thead><tr>{['ID','Ticker','Side','Entry','Exit','Qty','Net P/L','R','Result','Reason'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{trades.map(t=><tr key={t[0]}>{t.map((c,i)=><td key={i} className={String(c).startsWith('+$')?'green':String(c).startsWith('-$')?'red':''}>{c}</td>)}</tr>)}</tbody></table></div></Card>
}

function BuildStatusBoard(){
  const cls = (level) => `buildBadge ${level}`;
  return <Card><h2><CheckCircle size={18}/> Build Status & Real Money Readiness</h2><p className="muted">This replaces the old missing list. Some parts are built, some are partly built, and some require external ASX data before they can be completed.</p><div className="buildGrid">{buildStatus.map(([item,status,level,detail])=><div key={item} className="buildItem"><div><b>{item}</b><span className={cls(level)}>{status}</span></div><p>{detail}</p></div>)}</div><div className="realMoneyLock"><Lock size={16}/> Real money stays locked until historical testing, walk-forward testing and 50+ paper trades pass.</div></Card>
}

function HeatmapDetails(){
  return <div className="heatmapGroups">{heatmapGroups.map(group=><Card key={group.title}><h2><Grid3X3 size={18}/> {group.title}</h2><div className="heatmap mini">{group.items.map(([name,score,change,note])=><div key={name} className={score>=70?'hot':score<45?'cold':'neutral'}><b>{name}</b><strong>{score}</strong><small>{change}</small><em>{note}</em></div>)}</div></Card>)}</div>
}

function App(){
  const [selected, setSelected] = useState('CBA');
  const [soundOn, setSoundOn] = useState(true);
  const [voiceOn, setVoiceOn] = useState(true);
  const [audioReady, setAudioReady] = useState(false);
  const [tradeAlert, setTradeAlert] = useState(null);
  const stock = stocks[selected];
  const rows = useMemo(()=>Object.values(stocks).sort((a,b)=>b.score-a.score),[]);
  const paperEquity = 5018;
  const paperCash = 4971;
  useEffect(()=>{ if(!tradeAlert) return; const t=setTimeout(()=>setTradeAlert(null),60000); return ()=>clearTimeout(t); },[tradeAlert]);
  const triggerAlert = (type, s=stock)=>{
    const message = buildVoiceMessage(type, s);
    setTradeAlert({...s, type, message});
    playTone(soundOn && audioReady, type);
    speak(voiceOn && audioReady, message);
  };
  const enterPaper = (s)=> triggerAlert('entry', s);
  const testVoice = ()=> triggerAlert('entry', stock);
  const unlock = async()=>{
    await unlockAudio();
    setAudioReady(true);
    playTone(soundOn, 'target');
    speak(voiceOn, 'Sound and voice alerts are now enabled for paper trading.');
  };
  return <main>
    <header className="hero">
      <div><h1><Flame/> TRADERS SUCCESS FORMULA: ASX</h1><p>Australian trading command centre, built for GitHub, paper testing, signal education, and risk-first execution.</p></div>
      <div className="actions"><button><Search size={16}/>Scan</button><button className="ghost"><BarChart3 size={16}/>Backtest</button><button className="lock"><Lock size={16}/>Live Locked</button></div>
    </header>
    <div className="stats"><Stat icon={Activity} label="ASX Market Score" value="74" sub="TRADEABLE"/><Stat icon={TrendingUp} label="Best Sector" value="Banks" sub="HOT"/><Stat icon={Target} label="A-Grade Setups" value="2" sub="TODAY"/><Stat icon={ShieldCheck} label="Risk Per Trade" value="0.50%" sub="SAFE"/><Stat icon={WalletCards} label="Paper Equity" value={money(paperEquity)} sub="$5K START"/></div>
    <div className="gridMain">
      <Card className="signals"><div className="sectionHead"><h2>Top ASX Signals</h2><span><MousePointerClick size={14}/> click a ticker</span></div>{rows.map(r=><button key={r.ticker} onClick={()=>setSelected(r.ticker)} className={selected===r.ticker?'row active':'row'}><b>{r.ticker}<small>{money(r.price)} <em className={r.change>=0?'green':'red'}>{r.change}%</em></small></b><span>{r.setup}</span><span className="score"><i style={{width:`${r.score}%`}}/> {r.score}</span><span>{r.rr}R<br/><small>{r.volume}x vol</small></span><span className={statusClass(r.status)}>{r.status}</span></button>)}</Card>
      <Card><h2><Radio size={18}/> Live Alerts</h2><div className="alert">CBA trigger confirmed with 1.7x volume.</div><div className="alert">BHP requires commodity confirmation.</div><div className="alert bad">CSL blocked due to weak RS.</div><div className="paper"><h3>Paper Account</h3><p>Starting cash: $5,000</p><p>Cash: {money(paperCash)}</p><p>Equity: {money(paperEquity)}</p><p>Open risk: $25</p><p>Mode: testing only</p></div></Card>
    </div>
    <div className="tradeActions"><button onClick={()=>enterPaper(stock)}>Send {stock.ticker} to Paper Account</button><button className="ghost" onClick={()=>speak(voiceOn, `${stock.ticker}. Entry ${money(stock.entry)}. Stop ${money(stock.stop)}. Target ${money(stock.target)}. Current status ${stock.status}.`)}>Read this setup</button></div><StockChart stock={stock}/><TradePopup trade={tradeAlert} onClose={()=>setTradeAlert(null)} soundOn={soundOn} voiceOn={voiceOn}/><AudioPanel soundOn={soundOn} setSoundOn={setSoundOn} voiceOn={voiceOn} setVoiceOn={setVoiceOn} onTest={testVoice} onUnlock={unlock} audioReady={audioReady} onAlertTest={(type)=>triggerAlert(type, stock)}/>
    <div className="tabsGrid">
      <Card><h2><Gauge size={18}/> Understand</h2><p>The system explains each trade so the user learns what is happening, not just whether to buy or avoid.</p><div className="miniGrid"><span>Trend 78</span><span>Breadth 67</span><span>Sector Flow 82</span><span>Risk 71</span></div></Card>
      <Card><h2><Layers size={18}/> Heatmap</h2><div className="heatmap">{sectors.map(s=><div key={s.name} className={s.score>=70?'hot':s.score<45?'cold':'neutral'}><b>{s.name}</b><strong>{s.score}</strong><small>{s.change}</small><em>{s.breadth}</em><em>Leaders: {s.leaders}</em><em>{s.note}</em></div>)}</div></Card>
    </div>
    <HeatmapDetails/>
    <div className="tabsGrid">
      <Card><h2>Backtest Equity Curve</h2><ResponsiveContainer width="100%" height={220}><AreaChart data={equity}><XAxis dataKey="week" stroke="#64748b"/><YAxis stroke="#64748b"/><Tooltip contentStyle={{background:'#020617',border:'1px solid #1e293b',color:'#fff'}}/><Area type="monotone" dataKey="value" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.15}/></AreaChart></ResponsiveContainer></Card>
      <Card><h2>Setup Performance</h2><ResponsiveContainer width="100%" height={220}><BarChart data={setupPerformance}><XAxis dataKey="name" stroke="#64748b"/><YAxis stroke="#64748b"/><Tooltip contentStyle={{background:'#020617',border:'1px solid #1e293b',color:'#fff'}}/><Bar dataKey="score" fill="#38bdf8" radius={[8,8,0,0]}/></BarChart></ResponsiveContainer></Card>
    </div>
    <TradeJournal/>
    <BuildStatusBoard/>
  </main>
}

createRoot(document.getElementById('root')).render(<App/>);

// Paper Trade Journal and 60-second alert modal are included in the production roadmap and canvas mockup.
