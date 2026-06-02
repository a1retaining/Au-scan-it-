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
  if (!response.ok) throw new Error(json.error || "Request failed");
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

function signalSector(symbol) {
  const s = String(symbol || "").replace(".AX", "");
  if (["CBA","NAB","WBC","ANZ","MQG","BEN","BOQ"].includes(s)) return "Banks";
  if (["BHP","RIO","FMG","S32","NST","NEM","MIN","IGO","LYC","PLS"].includes(s)) return "Materials";
  if (["WDS","STO","ORG","BPT","VEA","WHC","YAL"].includes(s)) return "Energy";
  if (["CSL","RMD","SHL","COH","FPH","PME","RHC"].includes(s)) return "Healthcare";
  if (["XRO","WTC","ALU","NXT","SEK","CPU","ZIP"].includes(s)) return "Technology";
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
  $("heatmapGrid").innerHTML = rows.map(r => `<div class="tile"><strong>${r.sector}</strong><span>${r.count} signals | avg score ${Math.round(r.avg)}</span></div>`).join("") || `<div class="tile"><strong>No sector data</strong><span>Run a scan first</span></div>`;
  $("sectorStat").textContent = rows[0] ? rows[0].sector : "-";
}

function renderSignals(data) {
  lastSignals = data.signals || [];
  $("marketStat").textContent = data.market || "ASX";
  $("countStat").textContent = String(data.count ?? lastSignals.length);
  $("updatedStat").textContent = data.updatedAt ? new Date(data.updatedAt).toLocaleString() : "Updated";
  $("meta").textContent = `${data.mode || "scan"} | Regime: ${data.marketRegime || "n/a"} | Source: Yahoo public ASX chart data`;
  const tbody = $("signals");
  tbody.innerHTML = "";
  for (const s of lastSignals) {
    const tr = document.createElement("tr");
    const setup = s.setup || s.decision || "Watch";
    tr.innerHTML = `
      <td><strong>${s.symbol}</strong></td>
      <td class="score ${scoreClass(s.score)}">${s.score ?? "-"}</td>
      <td><span class="pill ${decisionClass(s.decision)}">${s.decision || "WATCH"}</span></td>
      <td>${setup}</td>
      <td>${money(s.price)}</td>
      <td>${money(s.buyZoneLow)} - ${money(s.buyZoneHigh)}</td>
      <td>${money(s.stopLoss ?? s.tightStop)}</td>
      <td>${money(s.target1 ?? s.dayTarget)}</td>
      <td>${num(s.riskReward ?? s.dayRiskReward)}</td>`;
    tr.onclick = () => selectSignal(s, tr);
    tbody.appendChild(tr);
  }
  renderHeatmap(lastSignals);
  if (lastSignals[0]) selectSignal(lastSignals[0], tbody.querySelector("tr"));
  $("output").textContent = data.errors && data.errors.length ? JSON.stringify(data.errors, null, 2) : "Scan complete. No fake fallback data shown.";
}

async function selectSignal(s, row) {
  selectedSignal = s;
  document.querySelectorAll("tbody tr").forEach(r => r.classList.remove("selected"));
  if (row) row.classList.add("selected");
  const reasons = (s.reasons || []).slice(0,5).map(r => `<li>${r}</li>`).join("");
  const warnings = (s.warnings || []).slice(0,4).map(r => `<li>${r}</li>`).join("");
  $("selected").innerHTML = `
    <div class="setup-title">${s.symbol} <small>${s.decision || "WATCH"}</small></div>
    <p>${s.summary || s.actionPlan || "No explanation returned."}</p>
    <div class="metric-row">
      <div class="metric"><span>Score</span><strong>${s.score ?? "-"}</strong></div>
      <div class="metric"><span>Risk/reward</span><strong>${num(s.riskReward ?? s.dayRiskReward)}</strong></div>
      <div class="metric"><span>Entry area</span><strong>${money(s.buyZoneLow)} - ${money(s.buyZoneHigh)}</strong></div>
      <div class="metric"><span>Stop / target</span><strong>${money(s.stopLoss ?? s.tightStop)} / ${money(s.target1 ?? s.dayTarget)}</strong></div>
    </div>
    <strong>Reasons</strong><ul class="reason-list">${reasons || "<li>No reasons returned.</li>"}</ul>
    <strong>Warnings</strong><ul class="reason-list">${warnings || "<li>No warnings returned.</li>"}</ul>`;
  $("optionsOut").textContent = "";
  await loadChart(s.symbol, s);
}

async function loadChart(symbol, signal) {
  try {
    $("chartMeta").textContent = `Loading ${symbol}`;
    const data = await getJson(endpoint("/api/bars", { symbol, range: "6mo", interval: "1d" }));
    drawChart(data.bars || [], signal);
    $("chartMeta").textContent = `${symbol} | ${data.source || "Yahoo"} | ${data.count || 0} bars`;
  } catch (error) {
    $("chartMeta").textContent = error.message;
    drawChart([], signal);
  }
}

function drawChart(bars, signal) {
  const canvas = $("chart");
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle = "#06101d"; ctx.fillRect(0,0,w,h);
  if (!bars.length) { ctx.fillStyle="#8ea8c3"; ctx.fillText("No chart data", 30, 40); return; }
  const data = bars.slice(-80);
  const prices = data.flatMap(b => [b.high,b.low, signal?.stopLoss, signal?.target1, signal?.buyZoneLow, signal?.buyZoneHigh].filter(Number.isFinite));
  const min = Math.min(...prices), max = Math.max(...prices);
  const pad = 24, top = 18, bottom = 34;
  const y = v => top + (max - v) / Math.max(max-min, .01) * (h - top - bottom);
  const xStep = (w - pad*2) / data.length;
  ctx.strokeStyle = "rgba(142,168,195,.15)"; ctx.lineWidth = 1;
  for (let i=0;i<5;i++){ const yy=top+i*(h-top-bottom)/4; ctx.beginPath(); ctx.moveTo(pad,yy); ctx.lineTo(w-pad,yy); ctx.stroke(); }
  data.forEach((b,i)=>{
    const x = pad + i*xStep + xStep/2;
    const up = b.close >= b.open;
    ctx.strokeStyle = up ? "#35d399" : "#ff6b6b";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath(); ctx.moveTo(x,y(b.high)); ctx.lineTo(x,y(b.low)); ctx.stroke();
    const bodyY = Math.min(y(b.open), y(b.close));
    const bodyH = Math.max(2, Math.abs(y(b.open)-y(b.close)));
    ctx.fillRect(x - Math.max(2,xStep*.28), bodyY, Math.max(4,xStep*.56), bodyH);
  });
  function level(value, label, color){ if(!Number.isFinite(Number(value))) return; const yy=y(Number(value)); ctx.strokeStyle=color; ctx.setLineDash([6,5]); ctx.beginPath(); ctx.moveTo(pad,yy); ctx.lineTo(w-pad,yy); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle=color; ctx.fillText(label+" "+money(value), pad+8, yy-5); }
  level(signal?.buyZoneHigh, "Entry high", "#55a7ff");
  level(signal?.buyZoneLow, "Entry low", "#55a7ff");
  level(signal?.stopLoss ?? signal?.tightStop, "Stop", "#ff6b6b");
  level(signal?.target1 ?? signal?.dayTarget, "Target", "#35d399");
}

async function runScan(kind) {
  try {
    $("output").textContent = "Loading real ASX public data...";
    const sector = $("sector").value;
    const symbols = $("symbols").value;
    let url;
    if (kind === "day") url = endpoint("/api/day-scan", { sector, symbols: sector ? "" : symbols });
    else if (kind === "discover") url = endpoint("/api/discover", { scanLimit: 100, limit: 40 });
    else url = endpoint("/api/scan", { sector, symbols: sector ? "" : symbols });
    const data = await getJson(url);
    renderSignals(data);
  } catch (error) { $("output").textContent = error.message; }
}

async function runBacktest() {
  try {
    $("output").textContent = "Running historical ASX backtest...";
    const data = await getJson(endpoint("/api/backtest", { symbols: $("symbols").value, years: 5, account: 5000, risk: 50 }));
    $("output").textContent = JSON.stringify(data, null, 2);
  } catch (error) { $("output").textContent = error.message; }
}

async function checkOptions() {
  if (!selectedSignal) return toast("Select a signal first.");
  const data = await getJson(endpoint("/api/options", { symbol: selectedSignal.symbol }));
  $("optionsOut").textContent = JSON.stringify(data, null, 2);
}

async function loadPaper() {
  try { const p = await getJson(endpoint("/api/paper/stats")); $("equityStat").textContent = money(p.equity ?? 5000); $("output").textContent = JSON.stringify(p, null, 2); }
  catch (e) { $("output").textContent = e.message; }
}

async function paperEnter() {
  if (!selectedSignal) return toast("Select a signal first.");
  try {
    const body = { symbol: selectedSignal.symbol, setup: selectedSignal.setup || selectedSignal.decision, entry: selectedSignal.price, stop: selectedSignal.stopLoss, target: selectedSignal.target1, score: selectedSignal.score };
    const res = await fetch(endpoint("/api/paper/open"), { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(body) });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Paper entry failed");
    toast("Paper trade recorded: " + selectedSignal.symbol);
    await loadPaper();
  } catch (e) { toast(e.message); }
}

document.querySelectorAll(".nav").forEach(btn => btn.onclick = () => {
  document.querySelectorAll(".nav").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  const mode = btn.dataset.mode;
  if (mode === "day") runScan("day"); else if (mode === "discover") runScan("discover"); else if (mode === "paper") loadPaper(); else if (mode === "backtest") runBacktest(); else runScan("scan");
});

$("refreshBtn").onclick = () => runScan("scan");
$("scanBtn").onclick = () => runScan("scan");
$("dayBtn").onclick = () => runScan("day");
$("discoverBtn").onclick = () => runScan("discover");
$("backtestBtn").onclick = runBacktest;
$("optionsBtn").onclick = checkOptions;
$("paperOpenBtn").onclick = paperEnter;
$("voiceBtn").onclick = () => { voiceEnabled = true; toast("Sound and voice enabled"); speak("Sound and voice enabled."); };
$("readBtn").onclick = () => { if (selectedSignal) speak(`${selectedSignal.symbol}. Score ${selectedSignal.score}. ${selectedSignal.summary || selectedSignal.actionPlan || "Review setup."}`); };

runScan("scan");
