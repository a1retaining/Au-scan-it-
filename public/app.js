let selectedSignal = null;
let lastSignals = [];
let voiceEnabled = false;

const $ = (id) => document.getElementById(id);
const money = (v) => Number.isFinite(Number(v)) ? "$" + Number(v).toLocaleString(undefined,{maximumFractionDigits:2}) : "-";
const num = (v) => Number.isFinite(Number(v)) ? Number(v).toFixed(2) : "-";

function endpoint(path, params = {}) {
  const url = new URL(path, window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value).trim() !== "") url.searchParams.set(key, value);
  }
  return url.toString();
}
async function getJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  const json = await response.json();
  if (!response.ok || json.ok === false) throw new Error(json.error || "Request failed");
  return json;
}
function toast(message) {
  const t = $("toast");
  t.textContent = message;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), 4200);
}
function speak(text) {
  if (!voiceEnabled || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.95;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}
function scoreClass(score) {
  score = Number(score || 0);
  if (score >= 78) return "good";
  if (score >= 60) return "mid";
  return "bad";
}
function decisionClass(decision) {
  const d = String(decision || "");
  if (d.includes("ENTER") || d.includes("READY")) return "enter";
  if (d.includes("BLOCK") || d.includes("AVOID")) return "block";
  return "";
}
function shortSymbol(symbol) { return String(symbol || "").replace(".AX", ""); }
function trendWord(s) {
  const c5 = Number(s.change5dPct || 0);
  const c20 = Number(s.change20dPct || 0);
  if (c5 > 1 && c20 > 2) return "BULLISH";
  if (c5 < -1 && c20 < -2) return "BEARISH";
  return "NEUTRAL";
}
function qualityRank(s) {
  const score = Number(s.score || 0);
  const rr = Number(s.riskReward || 0);
  const liq = Number(s.avgDollarVolume20 || 0);
  let q = score + Math.min(12, rr * 3);
  if (liq >= 20000000) q += 5;
  if (String(s.decision || "").includes("ENTER")) q += 7;
  if ((s.warnings || []).length) q -= Math.min(10, s.warnings.length * 2);
  return Math.round(q);
}
function signalSector(symbol) {
  const s = shortSymbol(symbol);
  if (["CBA","NAB","WBC","ANZ","MQG","BEN","BOQ"].includes(s)) return "Banks";
  if (["BHP","RIO","FMG","S32","NST","NEM","MIN","IGO","LYC","PLS"].includes(s)) return "Materials";
  if (["WDS","STO","ORG","BPT","VEA","WHC","YAL"].includes(s)) return "Energy";
  if (["CSL","RMD","SHL","COH","FPH","PME","RHC"].includes(s)) return "Healthcare";
  if (["XRO","WTC","ALU","NXT","SEK","CPU","ZIP"].includes(s)) return "Technology";
  if (["WOW","COL","WES","A2M","TWE","EDV"].includes(s)) return "Staples";
  return "Other";
}
function renderHeatmap(signals) {
  const grouped = new Map();
  for (const s of signals || []) {
    const sector = s.sector || signalSector(s.symbol);
    if (!grouped.has(sector)) grouped.set(sector, []);
    grouped.get(sector).push(Number(s.score || 0));
  }
  const rows = [...grouped.entries()].map(([sector, scores]) => ({ sector, avg: scores.reduce((a,b)=>a+b,0)/scores.length, count: scores.length })).sort((a,b)=>b.avg-a.avg);
  $("heatmapGrid").innerHTML = rows.map((r, i) => `<div class="tile"><strong>${i+1} ${r.sector}</strong><span>${r.count} signals | strength ${Math.round(r.avg)}/100</span></div>`).join("") || `<div class="tile"><strong>No sector data</strong><span>Run a scan first</span></div>`;
  $("sectorStat").textContent = rows[0] ? rows[0].sector.toUpperCase() : "-";
}
function renderSnapshot(signals) {
  const top = [...(signals || [])].sort((a,b)=>qualityRank(b)-qualityRank(a)).slice(0,6);
  $("marketSnapshot").innerHTML = top.length ? top.map(s => `<div class="snapshot-item"><strong>${shortSymbol(s.symbol)}</strong><span>${num(s.changePercent)}% | ${s.score}/100</span></div>`).join("") : `<p class="muted">Run scan to populate.</p>`;
  const tape = top.map(s => `${shortSymbol(s.symbol)} ${num(s.changePercent)}%`).join("   •   ");
  $("tickerbar").textContent = `ASX REAL PUBLIC DATA MODE • ${tape || "NO SCAN YET"} • NO FAKE OPTION CHAINS • PAPER ONLY`;
}
function renderSignals(data) {
  lastSignals = (data.signals || []).slice().sort((a,b)=>qualityRank(b)-qualityRank(a));
  const aGrades = lastSignals.filter(s => Number(s.score || 0) >= 78).length;
  $("marketRegime").textContent = String(data.marketRegime || data.market || "ASX").toUpperCase();
  $("regimeCard").textContent = String(data.marketRegime || data.market || "ASX").toUpperCase();
  $("regimeSub").textContent = data.marketSource ? `Source: ${data.marketSource}` : "Sydney market";
  $("trendStat").textContent = lastSignals.length && lastSignals[0] ? trendWord(lastSignals[0]) : "SCANNING";
  $("countStat").textContent = String(data.count ?? lastSignals.length);
  $("aGradeStat").textContent = String(aGrades);
  $("confidenceStat").textContent = aGrades >= 3 ? "HIGH" : aGrades >= 1 ? "MEDIUM" : "LOW";
  $("updatedStat").textContent = data.updatedAt ? new Date(data.updatedAt).toLocaleTimeString() : "Updated";
  $("meta").textContent = `${data.mode || "scan"} | ${lastSignals.length} returned | Sorted by quality gate | ${data.dataReality || "Public ASX chart feed"}`;

  $("signals").innerHTML = lastSignals.map((s, idx) => {
    const selected = selectedSignal && selectedSignal.symbol === s.symbol ? "selected" : "";
    const trend = trendWord(s);
    return `<tr class="${selected}" data-symbol="${s.symbol}">
      <td>${idx + 1}</td>
      <td><strong>${shortSymbol(s.symbol)}</strong></td>
      <td>${s.setup || "Watch"}</td>
      <td><span class="score ${scoreClass(s.score)}">${s.score}</span></td>
      <td>${num(s.riskReward)}</td>
      <td>${trend}</td>
      <td>${money(s.price)}</td>
      <td>${money(s.buyZoneLow)} - ${money(s.buyZoneHigh)}</td>
      <td><span class="pill ${decisionClass(s.decision)}">${s.decision || "WATCH"}</span></td>
    </tr>`;
  }).join("") || `<tr><td colspan="9">No signals returned. If this is during a Yahoo outage, the backend will show the real error instead of fake data.</td></tr>`;

  document.querySelectorAll("#signals tr[data-symbol]").forEach(row => row.addEventListener("click", () => selectSignal(row.dataset.symbol)));
  renderHeatmap(lastSignals);
  renderSnapshot(lastSignals);
  if (!selectedSignal && lastSignals[0]) selectSignal(lastSignals[0].symbol, true);
}
function selectSignal(symbol, quiet = false) {
  selectedSignal = lastSignals.find(s => s.symbol === symbol) || null;
  document.querySelectorAll("#signals tr").forEach(r => r.classList.toggle("selected", selectedSignal && r.dataset.symbol === selectedSignal.symbol));
  renderDetail(selectedSignal);
  if (selectedSignal) drawChart(selectedSignal);
  if (selectedSignal && !quiet) speak(`${shortSymbol(selectedSignal.symbol)} ${selectedSignal.setup}. Score ${selectedSignal.score}. Risk reward ${selectedSignal.riskReward}.`);
}
function renderDetail(s) {
  if (!s) { $("detail").innerHTML = `<h3>TRADE DECISION STREAM</h3><p class="muted">Select a signal to inspect entry, stop, target, score breakdown and risk notes.</p>`; return; }
  const reasons = (s.reasons || []).slice(0,5).map(x => `<li>${x}</li>`).join("");
  const warnings = (s.warnings || []).slice(0,5).map(x => `<li>${x}</li>`).join("") || `<li>No major warning returned by scanner.</li>`;
  const parts = (s.scoreParts || []).slice().sort((a,b)=>Number(b.points||0)-Number(a.points||0)).slice(0,7).map(p => `<div class="snapshot-item"><strong>${p.name}</strong><span>${p.points}</span></div>`).join("");
  $("detail").innerHTML = `<h3>TRADE DECISION STREAM</h3>
    <div class="detail-title">${shortSymbol(s.symbol)} <small>${s.setup || "ASX setup"} | ${s.decision || "WATCH"}</small></div>
    <div class="metric-row">
      <div class="small-metric"><span>Entry area</span><strong>${money(s.buyZoneLow)} - ${money(s.buyZoneHigh)}</strong></div>
      <div class="small-metric"><span>Score</span><strong class="score ${scoreClass(s.score)}">${s.score}/100</strong></div>
      <div class="small-metric"><span>Stop loss</span><strong>${money(s.stopLoss)}</strong></div>
      <div class="small-metric"><span>Target 1</span><strong>${money(s.target1)}</strong></div>
      <div class="small-metric"><span>Risk/reward</span><strong>${num(s.riskReward)} : 1</strong></div>
      <div class="small-metric"><span>20D momentum</span><strong>${num(s.change20dPct)}%</strong></div>
    </div>
    <div class="button-row"><button class="secondary" onclick="openPaperTrade('${s.symbol}')">Paper Entry</button><button class="secondary" onclick="checkOptions('${s.symbol}')">Check Options Reality</button></div>
    <h4>Why it ranked</h4><ul class="reason-list">${reasons || "<li>No reasons returned.</li>"}</ul>
    <h4>Risk warnings</h4><ul class="reason-list">${warnings}</ul>
    <h4>Score breakdown</h4><div class="snapshot-list">${parts}</div>`;
}
function drawChart(s) {
  const canvas = $("chart");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle = "#03070d"; ctx.fillRect(0,0,W,H);
  const bars = (s.bars || []).slice(-80);
  if (!bars.length) { ctx.fillStyle = "#8fa4bc"; ctx.fillText("No bars available", 30, 40); return; }
  const highs = bars.map(b=>b.high), lows = bars.map(b=>b.low);
  const max = Math.max(...highs, Number(s.target1||0));
  const min = Math.min(...lows, Number(s.stopLoss||Infinity));
  const pad = 28, chartH = H - 56, chartW = W - 70;
  const y = v => pad + (max - v) / Math.max(max - min, 0.01) * chartH;
  const x = i => 52 + i * (chartW / Math.max(1, bars.length-1));
  ctx.strokeStyle = "rgba(66,232,255,.12)"; ctx.lineWidth = 1;
  for (let i=0;i<6;i++){ const yy=pad+i*(chartH/5); ctx.beginPath(); ctx.moveTo(42,yy); ctx.lineTo(W-18,yy); ctx.stroke(); }
  bars.forEach((b,i)=>{
    const xx=x(i), bw=Math.max(3, chartW/bars.length*.55); const open=y(b.open), close=y(b.close), high=y(b.high), low=y(b.low);
    ctx.strokeStyle = b.close >= b.open ? "#34f59b" : "#ff5d5d";
    ctx.beginPath(); ctx.moveTo(xx, high); ctx.lineTo(xx, low); ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fillRect(xx-bw/2, Math.min(open, close), bw, Math.max(2, Math.abs(close-open)));
  });
  function line(val, color, label){ if(!Number.isFinite(Number(val)))return; const yy=y(Number(val)); ctx.strokeStyle=color; ctx.setLineDash([7,6]); ctx.beginPath(); ctx.moveTo(42,yy); ctx.lineTo(W-18,yy); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle=color; ctx.font="14px sans-serif"; ctx.fillText(label + " " + money(val), 54, yy-7); }
  line(s.buyZoneHigh, "#42e8ff", "Entry high"); line(s.stopLoss, "#ff5d5d", "Stop"); line(s.target1, "#34f59b", "Target");
  ctx.fillStyle="#8fa4bc"; ctx.fillText(`${shortSymbol(s.symbol)} | ${s.source || "public data"}`, 52, H-18);
  $("chartMeta").textContent = `${shortSymbol(s.symbol)} | ${bars.length} bars | Entry, stop and target from backend`;
}
async function runScan(mode = "scan") {
  try {
    toast("Running real ASX scan...");
    const sector = $("sector").value;
    const symbols = $("symbols").value;
    const data = await getJson(endpoint(mode === "discover" ? "/api/discover" : mode === "day" ? "/api/day-scan" : "/api/scan", { symbols, sector, scanLimit: 160, limit: 100 }));
    selectedSignal = null;
    renderSignals(data);
    toast("ASX scan complete");
  } catch (e) {
    toast(e.message);
    $("meta").textContent = "Scan failed: " + e.message;
  }
}
async function openPaperTrade(symbol) {
  const s = lastSignals.find(x => x.symbol === symbol);
  if (!s) return;
  const shares = Math.max(1, Math.floor(500 / Math.max(Number(s.price || 1), 1)));
  try {
    const response = await fetch("/api/paper/open", { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify({ symbol, side:"long", entry:s.price, shares, stop:s.stopLoss, target:s.target1, setup:s.setup }) });
    const json = await response.json();
    if (!response.ok || json.ok === false) throw new Error(json.error || "Paper entry failed");
    toast(`Paper trade opened for ${shortSymbol(symbol)}`); loadPaper();
  } catch(e) { toast(e.message); }
}
async function checkOptions(symbol) {
  try { const data = await getJson(endpoint("/api/options", { symbol })); alert(JSON.stringify(data, null, 2)); }
  catch(e) { toast(e.message); }
}
async function loadPaper() {
  try {
    const [stats, trades] = await Promise.all([getJson("/api/paper/stats"), getJson("/api/paper/trades")]);
    const st = stats.stats || {};
    const rows = (trades.trades || []).slice(0, 25);
    $("paperStats").innerHTML = `<div class="paper-summary">
      <div class="small-metric"><span>Closed trades</span><strong>${st.closedTrades || 0}</strong></div>
      <div class="small-metric"><span>Win rate</span><strong>${num(st.winRate)}%</strong></div>
      <div class="small-metric"><span>Net P/L</span><strong>${money(st.netPnl || 0)}</strong></div>
      <div class="small-metric"><span>Open trades</span><strong>${rows.filter(t=>t.status==='open').length}</strong></div>
    </div>
    <div class="paper-trades">${rows.map(t => `<div class="paper-trade">
      <div class="paper-trade-head"><strong>${shortSymbol(t.symbol)} ${String(t.status).toUpperCase()}</strong><small>${t.setup || 'manual'}</small></div>
      <small>Entry ${money(t.entry)} | Shares ${t.shares} | Stop ${money(t.stop)} | Target ${money(t.target)}</small>
      ${t.status === 'open' ? `<div class="paper-close-row"><input id="close-${t.id}" type="number" step="0.01" value="${t.entry}"><button class="mini" onclick="closePaperTrade('${t.id}')">Close</button></div>` : `<small>Exit ${money(t.exit)} | P/L ${money(t.pnl)} (${num(t.pnlPct)}%)</small>`}
    </div>`).join('') || `<div class="paper-trade"><strong>No paper trades yet</strong><small>Click Paper Entry on a selected ASX signal.</small></div>`}</div>`;
  } catch(e){ $("paperStats").innerHTML = `<p class="muted">${e.message}</p>`; }
}
async function closePaperTrade(id) {
  const el = $("close-" + id);
  const exit = el ? Number(el.value) : NaN;
  try {
    const response = await fetch("/api/paper/close", { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify({ id, exit, exitReason:"manual close from dashboard" }) });
    const json = await response.json();
    if (!response.ok || json.ok === false) throw new Error(json.error || "Paper close failed");
    toast("Paper trade closed");
    loadPaper();
  } catch(e) { toast(e.message); }
}
async function loadHealth() {
  try { const h = await getJson("/api/health"); $("systemHealth").textContent = JSON.stringify(h, null, 2); }
  catch(e){ $("systemHealth").textContent = e.message; }
}
async function runBacktest() {
  try { toast("Running ASX backtest..."); const data = await getJson(endpoint("/api/backtest", { symbols: $("symbols").value, years: 5, account: 5000, risk: 50 })); $("backtestOutput").textContent = JSON.stringify(data.stats || data, null, 2); toast("Backtest complete"); }
  catch(e){ toast(e.message); }
}
window.openPaperTrade = openPaperTrade;
window.checkOptions = checkOptions;
window.closePaperTrade = closePaperTrade;
$("scanBtn").addEventListener("click", () => runScan("scan"));
$("refreshBtn").addEventListener("click", () => runScan("scan"));
$("discoverBtn").addEventListener("click", () => runScan("discover"));
$("dayBtn").addEventListener("click", () => runScan("day"));
$("paperBtn").addEventListener("click", loadPaper);
$("runBacktest").addEventListener("click", runBacktest);
$("clearSelect").addEventListener("click", () => { selectedSignal=null; renderDetail(null); });
$("voiceBtn").addEventListener("click", () => { voiceEnabled = true; toast("Voice enabled"); speak("TradingMint ASX voice enabled"); });

document.querySelectorAll(".nav").forEach(btn => btn.addEventListener("click", () => {
  document.querySelectorAll(".nav").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  const mode = btn.dataset.mode || "dashboard";
  const map = {
    dashboard: "scanPanel", scan: "scanPanel", paper: "paperPanel", journal: "paperPanel", performance: "paperPanel",
    backtest: "healthPanel", regime: "sectorsPanel", sectors: "sectorsPanel", risk: "paperPanel", health: "healthPanel"
  };
  const id = map[mode] || "scanPanel";
  const el = $(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  if (["paper", "journal", "performance", "risk"].includes(mode)) loadPaper();
  if (mode === "health") loadHealth();
}));
loadHealth(); loadPaper(); runScan("scan");
