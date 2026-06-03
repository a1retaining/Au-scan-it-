let selectedSignal = null;
let lastSignals = [];
let voiceEnabled = false;
let currentRange = "1y";
let currentInterval = "1d";
let paperTradesCache = [];
let selectedPaperTradeId = null;

let autoTraderOn = true;
let autoTraderInterval = null;
let autoTraderCountdown = 60;
let lastWarningText = "";

let wakeLock = null;
let keepAliveInterval = null;
let hardRefreshInterval = null;
let autoTraderBusy = false;

const AUTO_SCAN_SECONDS = 60;
const ASX_TIMEZONE = "Australia/Sydney";
const ASX_OPEN_HOUR = 10;
const ASX_CLOSE_HOUR = 16;

const $ = (id) => document.getElementById(id);

function isGoodNumber(v) {
  if (v === null || v === undefined || v === "") return false;
  const n = Number(v);
  return Number.isFinite(n);
}

const money = (v) => {
  if (!isGoodNumber(v)) return "-";
  const n = Number(v);
  return "$" + n.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

const signedMoney = (v) => {
  if (!isGoodNumber(v)) return "-";
  const n = Number(v);
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return sign + "$" + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
};

const num = (v) => {
  if (!isGoodNumber(v)) return "-";
  return Number(v).toFixed(2);
};

function endpoint(path, params = {}) {
  const url = new URL(path, window.location.origin);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

async function getJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  const json = await response.json();

  if (!response.ok || json.ok === false) {
    throw new Error(json.error || "Request failed");
  }

  return json;
}

function toast(message) {
  const t = $("toast");
  if (!t) return;

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

function pnlClass(value) {
  const n = Number(value || 0);

  if (n > 0) return "profit-good";
  if (n < 0) return "profit-bad";
  return "profit-flat";
}

function decisionClass(decision) {
  const d = String(decision || "");

  if (d.includes("AUTO") || d.includes("READY") || d.includes("ENTER")) return "enter";
  if (d.includes("BLOCK") || d.includes("AVOID")) return "block";

  return "";
}

function shortSymbol(symbol) {
  return String(symbol || "").replace(".AX", "");
}

function trendWord(s) {
  const c5 = Number(s.change5dPct || 0);
  const c20 = Number(s.change20dPct || 0);

  if (c5 > 1 && c20 > 2) return "BULLISH";
  if (c5 < -1 && c20 < -2) return "BEARISH";

  return "NEUTRAL";
}

function isValidSignal(s) {
  return (
    s &&
    Number(s.price) > 0 &&
    Number(s.buyZoneHigh) > 0 &&
    Number(s.buyZoneLow) > 0 &&
    Number(s.stopLoss) > 0 &&
    Number(s.target1) > 0 &&
    Number(s.riskReward) >= 0 &&
    Number(s.riskReward) <= 20
  );
}

function qualityRank(s) {
  const score = Number(s.score || 0);
  const rr = Number(s.riskReward || 0);
  const liq = Number(s.avgDollarVolume20 || 0);

  let q = score + Math.min(12, rr * 3);

  if (liq >= 20000000) q += 5;
  if (s.paperRules && s.paperRules.allowed) q += 12;
  if (String(s.decision || "").includes("AUTO")) q += 7;
  if ((s.warnings || []).length) q -= Math.min(10, s.warnings.length * 2);

  return Math.round(q);
}

function signalSector(symbol) {
  const s = shortSymbol(symbol);

  if (["CBA", "NAB", "WBC", "ANZ", "MQG", "BEN", "BOQ"].includes(s)) return "Banks";
  if (["BHP", "RIO", "FMG", "S32", "NST", "NEM", "MIN", "IGO", "LYC", "PLS"].includes(s)) return "Materials";
  if (["WDS", "STO", "ORG", "BPT", "VEA", "WHC", "YAL"].includes(s)) return "Energy";
  if (["CSL", "RMD", "SHL", "COH", "FPH", "PME", "RHC"].includes(s)) return "Healthcare";
  if (["XRO", "WTC", "ALU", "NXT", "SEK", "CPU", "ZIP"].includes(s)) return "Technology";
  if (["WOW", "COL", "WES", "A2M", "TWE", "EDV"].includes(s)) return "Staples";

  return "Other";
}

function formatTradeTime(value) {
  if (!value) return "-";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleString("en-AU", {
    timeZone: "Australia/Sydney",
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit"
  });
}

function getPaperTradeById(id) {
  return paperTradesCache.find((t) => String(t.id) === String(id)) || null;
}

function bindPaperTradeClicks() {
  document.querySelectorAll(".clickable-paper-trade").forEach((card) => {
    card.onclick = async (event) => {
      const ignore = event.target.closest("button, input, select, textarea");
      if (ignore) return;

      const tradeId = card.dataset.tradeId;
      const symbol = card.dataset.symbol;

      if (!tradeId) {
        toast("No trade ID found on this card.");
        return;
      }

      await selectPaperTrade(tradeId, symbol);
    };
  });
}

async function selectPaperTrade(id, symbol) {
  selectedPaperTradeId = String(id);

  document.querySelectorAll(".paper-trade").forEach((el) => {
    el.classList.toggle("selected-paper-trade", el.dataset.tradeId === selectedPaperTradeId);
  });

  let trade = getPaperTradeById(selectedPaperTradeId);

  if (!trade) {
    try {
      const fresh = await getJson("/api/paper/trades");
      paperTradesCache = fresh.trades || [];
      trade = getPaperTradeById(selectedPaperTradeId);
    } catch (e) {
      toast("Could not reload paper trades: " + e.message);
    }
  }

  const cleanSymbol = symbol || (trade && trade.symbol);

  if (!cleanSymbol) {
    toast("Could not find that paper trade.");
    return;
  }

  const existingSignal = lastSignals.find((s) => shortSymbol(s.symbol) === shortSymbol(cleanSymbol));

  if (existingSignal) {
    selectedSignal = existingSignal;
  } else if (trade) {
    selectedSignal = {
      symbol: trade.symbol,
      setup: trade.setup || "Auto paper trade",
      price: Number(trade.exit || trade.entry || 0),
      buyZoneLow: Number(trade.entry || 0),
      buyZoneHigh: Number(trade.entry || 0),
      stopLoss: Number(trade.stop || 0),
      target1: Number(trade.target || 0),
      target2: Number(trade.target || 0),
      riskReward: Number(trade.riskReward || 0),
      score: Number(trade.score || 0),
      change5dPct: 0,
      change20dPct: 0,
      reasons: ["Loaded from $5,000 auto paper account."],
      warnings: [],
      scoreParts: [],
      paperRules: {
        allowed: false,
        checks: []
      }
    };
  }

  document.querySelectorAll("#signals tr").forEach((r) =>
    r.classList.toggle("selected", selectedSignal && r.dataset.symbol === selectedSignal.symbol)
  );

  if (selectedSignal) {
    renderDetail(selectedSignal);
    await loadChart(selectedSignal.symbol);
    document.getElementById("chartPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    toast(`Showing ${shortSymbol(cleanSymbol)} paper trade on chart.`);
  }
}

function getSydneyParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: ASX_TIMEZONE,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  const out = {};

  for (const p of parts) {
    if (p.type !== "literal") out[p.type] = p.value;
  }

  return {
    weekday: out.weekday,
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour),
    minute: Number(out.minute),
    second: Number(out.second)
  };
}

function getSydneyOffsetMinutes(date = new Date()) {
  const parts = getSydneyParts(date);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}

function makeSydneyTime(year, month, day, hour, minute = 0, second = 0) {
  const guessUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset = getSydneyOffsetMinutes(new Date(guessUtc));
  return new Date(guessUtc - offset * 60000);
}

function nextSydneyTradingOpen(from = new Date()) {
  const p = getSydneyParts(from);
  let y = p.year;
  let m = p.month;
  let d = p.day;

  for (let i = 0; i < 10; i++) {
    const candidate = makeSydneyTime(y, m, d + i, ASX_OPEN_HOUR, 0, 0);
    const cp = getSydneyParts(candidate);
    const weekdayNum = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(cp.weekday);

    if (weekdayNum >= 1 && weekdayNum <= 5 && candidate > from) {
      return candidate;
    }
  }

  return makeSydneyTime(y, m, d + 1, ASX_OPEN_HOUR, 0, 0);
}

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function updateMarketClock() {
  const now = new Date();
  const parts = getSydneyParts(now);
  const weekdayNum = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  const isWeekday = weekdayNum >= 1 && weekdayNum <= 5;

  const openTime = makeSydneyTime(parts.year, parts.month, parts.day, ASX_OPEN_HOUR, 0, 0);
  const closeTime = makeSydneyTime(parts.year, parts.month, parts.day, ASX_CLOSE_HOUR, 0, 0);

  let state = "ASX CLOSED";
  let timerText = "";
  let isOpen = false;

  if (isWeekday && now >= openTime && now < closeTime) {
    isOpen = true;
    state = "ASX OPEN";
    timerText = `Closes in ${formatCountdown(closeTime - now)}`;
  } else {
    const nextOpen = now < openTime && isWeekday ? openTime : nextSydneyTradingOpen(now);
    state = "ASX CLOSED";
    timerText = `Opens in ${formatCountdown(nextOpen - now)}`;
  }

  if ($("sessionState")) {
    $("sessionState").textContent = state;
    $("sessionState").classList.toggle("live", isOpen);
  }

  if ($("sessionTimer")) {
    $("sessionTimer").textContent = timerText;
  }
}

function renderHeatmap(signals) {
  const grouped = new Map();

  for (const s of signals || []) {
    const sector = s.sector || signalSector(s.symbol);

    if (!grouped.has(sector)) grouped.set(sector, []);
    grouped.get(sector).push(Number(s.score || 0));
  }

  const rows = [...grouped.entries()]
    .map(([sector, scores]) => ({
      sector,
      avg: scores.reduce((a, b) => a + b, 0) / scores.length,
      count: scores.length
    }))
    .sort((a, b) => b.avg - a.avg);

  if ($("heatmapGrid")) {
    $("heatmapGrid").innerHTML =
      rows
        .map(
          (r, i) =>
            `<div class="tile">
              <strong>${i + 1} ${r.sector}</strong>
              <span>${r.count} signals | strength ${Math.round(r.avg)}/100</span>
            </div>`
        )
        .join("") ||
      `<div class="tile">
        <strong>No sector data</strong>
        <span>Run a scan first</span>
      </div>`;
  }

  if ($("sectorStat")) {
    $("sectorStat").textContent = rows[0] ? rows[0].sector.toUpperCase() : "-";
  }
}

function renderSnapshot(signals) {
  const top = [...(signals || [])].sort((a, b) => qualityRank(b) - qualityRank(a)).slice(0, 6);

  if ($("marketSnapshot")) {
    $("marketSnapshot").innerHTML = top.length
      ? top
          .map(
            (s) =>
              `<div class="snapshot-item">
                <strong>${shortSymbol(s.symbol)}</strong>
                <span>${num(s.changePercent)}% | ${s.score}/100</span>
              </div>`
          )
          .join("")
      : `<p class="muted">Run scan to populate.</p>`;
  }

  const tape = top.map((s) => `${shortSymbol(s.symbol)} ${num(s.changePercent)}%`).join("   •   ");

  if ($("tickerbar")) {
    $("tickerbar").textContent =
      `ASX NEAR-LIVE PUBLIC CHART MODE • ${tape || "NO SCAN YET"} • NO FAKE OPTION CHAINS • AUTO PAPER ONLY`;
  }
}

function renderSignals(data) {
  const rawSignals = data.signals || [];
  const badSignals = rawSignals.filter((s) => !isValidSignal(s));

  lastSignals = rawSignals
    .filter(isValidSignal)
    .slice()
    .sort((a, b) => qualityRank(b) - qualityRank(a));

  const aGrades = lastSignals.filter((s) => Number(s.score || 0) >= 78).length;
  const autoReady = lastSignals.filter((s) => s.paperRules && s.paperRules.allowed).length;

  if ($("marketRegime")) {
    $("marketRegime").textContent = String(data.marketRegime || data.market || "ASX").toUpperCase();
  }

  if ($("trendStat")) {
    $("trendStat").textContent = lastSignals.length && lastSignals[0] ? trendWord(lastSignals[0]) : "SCANNING";
  }

  if ($("countStat")) $("countStat").textContent = String(lastSignals.length);
  if ($("aGradeStat")) $("aGradeStat").textContent = String(aGrades);
  if ($("confidenceStat")) $("confidenceStat").textContent = aGrades >= 3 ? "HIGH" : aGrades >= 1 ? "MEDIUM" : "LOW";

  if ($("updatedStat")) {
    $("updatedStat").textContent = data.updatedAt ? new Date(data.updatedAt).toLocaleTimeString() : "Updated";
  }

  if ($("regimeSub")) {
    $("regimeSub").textContent = data.marketSource ? `Source: ${data.marketSource}` : "Rule-gated paper scan";
  }

  if ($("meta")) {
    $("meta").textContent =
      `${data.mode || "scan"} | ${lastSignals.length} valid returned | Auto-paper candidates: ${autoReady} | Bad rows blocked: ${badSignals.length}`;
  }

  const tbody = $("signals");

  if (tbody) {
    tbody.innerHTML =
      lastSignals
        .map((s, idx) => {
          const selected = selectedSignal && selectedSignal.symbol === s.symbol ? "selected" : "";
          const trend = trendWord(s);
          const allowed = s.paperRules && s.paperRules.allowed ? "YES" : "NO";

          return `<tr class="${selected}" data-symbol="${s.symbol}">
            <td>${idx + 1}</td>
            <td><strong>${shortSymbol(s.symbol)}</strong></td>
            <td>${s.setup || "Watch"}</td>
            <td><span class="score ${scoreClass(s.score)}">${s.score}</span></td>
            <td>${num(s.riskReward)}</td>
            <td>${trend}</td>
            <td>${money(s.price)}</td>
            <td>${money(s.buyZoneLow)} - ${money(s.buyZoneHigh)}</td>
            <td>
              <span class="pill ${allowed === "YES" ? "enter" : decisionClass(s.decision)}">
                ${allowed === "YES" ? "AUTO READY" : s.decision || "WATCH"}
              </span>
            </td>
          </tr>`;
        })
        .join("") ||
      `<tr>
        <td colspan="9">No valid signals returned. Bad or zero-price data is blocked instead of being shown.</td>
      </tr>`;

    document.querySelectorAll("#signals tr[data-symbol]").forEach((row) =>
      row.addEventListener("click", () => selectSignal(row.dataset.symbol))
    );
  }

  renderHeatmap(lastSignals);
  renderSnapshot(lastSignals);

  if (!selectedSignal && lastSignals[0]) {
    selectSignal(lastSignals[0].symbol, true);
  }
}

function selectSignal(symbol, quiet = false) {
  selectedSignal = lastSignals.find((s) => s.symbol === symbol) || null;
  selectedPaperTradeId = null;
  window.selectedTicker = selectedSignal ? selectedSignal.symbol : null;

  document.querySelectorAll("#signals tr").forEach((r) =>
    r.classList.toggle("selected", selectedSignal && r.dataset.symbol === selectedSignal.symbol)
  );

  document.querySelectorAll(".paper-trade").forEach((el) => {
    el.classList.remove("selected-paper-trade");
  });

  renderDetail(selectedSignal);

  if (selectedSignal) {
    loadChart(selectedSignal.symbol);
  }

  if (selectedSignal && !quiet) {
    speak(
      `${shortSymbol(selectedSignal.symbol)} ${selectedSignal.setup}. Score ${selectedSignal.score}. Risk reward ${selectedSignal.riskReward}.`
    );
  }
}

function renderRuleChecks(s) {
  const checks = s && s.paperRules && Array.isArray(s.paperRules.checks) ? s.paperRules.checks : [];

  if (!checks.length) {
    return `<div class="snapshot-item">
      <strong>Rule gate</strong>
      <span>No rule data</span>
    </div>`;
  }

  return checks
    .map(
      (c) =>
        `<div class="snapshot-item">
          <strong>${c.name}</strong>
          <span>${c.pass ? "PASS" : "BLOCK"} | ${c.actual} / ${c.required}</span>
        </div>`
    )
    .join("");
}

function renderDetail(s) {
  if (!s) {
    $("detail").innerHTML =
      `<h3>SETUP DECISION</h3>
      <p class="muted">Select a signal to inspect entry, stop, target, score breakdown and rule gate. The $5,000 paper account is fully automatic.</p>`;
    return;
  }

  const reasons = (s.reasons || []).slice(0, 5).map((x) => `<li>${x}</li>`).join("");

  const warnings =
    (s.warnings || []).slice(0, 5).map((x) => `<li>${x}</li>`).join("") ||
    `<li>No major warning returned by scanner.</li>`;

  const parts = (s.scoreParts || [])
    .slice()
    .sort((a, b) => Number(b.points || 0) - Number(a.points || 0))
    .slice(0, 7)
    .map((p) => `<div class="snapshot-item"><strong>${p.name}</strong><span>${p.points}</span></div>`)
    .join("");

  const gate = s.paperRules && s.paperRules.allowed ? "AUTO PAPER READY" : "RULES BLOCK";

  $("detail").innerHTML = `<h3>SETUP DECISION</h3>
    <div class="detail-title">
      ${shortSymbol(s.symbol)}
      <small>${s.setup || "ASX setup"} | ${gate}</small>
    </div>

    <div class="metric-row">
      <div class="small-metric"><span>Entry area</span><strong>${money(s.buyZoneLow)} - ${money(s.buyZoneHigh)}</strong></div>
      <div class="small-metric"><span>Score</span><strong class="score ${scoreClass(s.score)}">${s.score}/100</strong></div>
      <div class="small-metric"><span>Stop loss</span><strong>${money(s.stopLoss)}</strong></div>
      <div class="small-metric"><span>Target 1</span><strong>${money(s.target1)}</strong></div>
      <div class="small-metric"><span>Risk/reward</span><strong>${num(s.riskReward)} : 1</strong></div>
      <div class="small-metric"><span>20D momentum</span><strong>${num(s.change20dPct)}%</strong></div>
    </div>

    <div class="button-row">
      <button class="secondary" onclick="runAutoPaper()">Run Auto Paper</button>
      <button class="secondary" onclick="document.getElementById('chartPanel').scrollIntoView({behavior:'smooth'})">View Chart</button>
      <button class="secondary" onclick="checkOptions('${s.symbol}')">Check Options Reality</button>
    </div>

    <h4>Auto Paper Rule Gate</h4>
    <div class="snapshot-list">${renderRuleChecks(s)}</div>

    <h4>Why it ranked</h4>
    <ul class="reason-list">${reasons || "<li>No reasons returned.</li>"}</ul>

    <h4>Risk warnings</h4>
    <ul class="reason-list">${warnings}</ul>

    <h4>Score breakdown</h4>
    <div class="snapshot-list">${parts}</div>`;
}

async function loadChart(symbol) {
  const selected = lastSignals.find((s) => s.symbol === symbol) || selectedSignal;
  if (!selected) return;

  selectedSignal = selected;
  window.selectedTicker = selected.symbol;

  if ($("chartTitle")) $("chartTitle").textContent = `${shortSymbol(selected.symbol)} ASX CANDLE CHART`;
  if ($("chartMeta")) $("chartMeta").textContent = `Loading ${currentRange} / ${currentInterval}...`;

  try {
    const data = await getJson(
      endpoint("/api/bars", {
        symbol: selected.symbol,
        range: currentRange,
        interval: currentInterval
      })
    );

    drawChart(selected, data.bars || selected.bars || [], data.source || selected.source || "public data");
  } catch (e) {
    drawChart(selected, selected.bars || [], selected.source || "public data");

    if ($("chartMeta")) {
      $("chartMeta").textContent = `${shortSymbol(selected.symbol)} | fallback chart | ${e.message}`;
    }
  }
}

function getTradesForSymbol(symbol) {
  const rows = paperTradesCache.filter((t) => t.symbol === symbol || shortSymbol(t.symbol) === shortSymbol(symbol));

  if (selectedPaperTradeId) {
    return rows.slice().sort((a, b) => {
      if (String(a.id) === String(selectedPaperTradeId)) return -1;
      if (String(b.id) === String(selectedPaperTradeId)) return 1;
      return 0;
    });
  }

  return rows;
}

function drawChart(s, incomingBars, sourceLabel) {
  const canvas = $("chart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#03070d";
  ctx.fillRect(0, 0, W, H);

  const bars = (incomingBars || s.bars || [])
    .filter((b) => Number(b.open) > 0 && Number(b.high) > 0 && Number(b.low) > 0 && Number(b.close) > 0)
    .slice(-140);

  if (!bars.length) {
    ctx.fillStyle = "#8fa4bc";
    ctx.font = "16px sans-serif";
    ctx.fillText("No valid bars available", 30, 40);
    return;
  }

  const tradeLevels = getTradesForSymbol(s.symbol).flatMap((t) =>
    [Number(t.entry), Number(t.exit), Number(t.stop), Number(t.target)].filter((x) => Number.isFinite(x) && x > 0)
  );

  const highs = bars.map((b) => Number(b.high)).filter((x) => Number.isFinite(x) && x > 0);
  const lows = bars.map((b) => Number(b.low)).filter((x) => Number.isFinite(x) && x > 0);

  const max = Math.max(...highs, Number(s.target1 || 0), ...tradeLevels);
  const min = Math.min(...lows, Number(s.stopLoss || Infinity), ...tradeLevels);

  const leftPad = 58;
  const rightPad = 24;
  const topPad = 28;
  const bottomPad = 42;
  const chartH = H - topPad - bottomPad;
  const chartW = W - leftPad - rightPad;

  const y = (v) => topPad + ((max - v) / Math.max(max - min, 0.01)) * chartH;
  const x = (i) => leftPad + i * (chartW / Math.max(1, bars.length - 1));

  ctx.strokeStyle = "rgba(66,232,255,.12)";
  ctx.lineWidth = 1;

  for (let i = 0; i < 6; i++) {
    const yy = topPad + i * (chartH / 5);
    ctx.beginPath();
    ctx.moveTo(leftPad - 10, yy);
    ctx.lineTo(W - rightPad, yy);
    ctx.stroke();

    const price = max - (i / 5) * (max - min);
    ctx.fillStyle = "#61758d";
    ctx.font = "11px sans-serif";
    ctx.fillText(money(price), 8, yy + 4);
  }

  bars.forEach((b, i) => {
    const xx = x(i);
    const bw = Math.max(3, (chartW / bars.length) * 0.58);

    const open = y(Number(b.open));
    const close = y(Number(b.close));
    const high = y(Number(b.high));
    const low = y(Number(b.low));

    const up = Number(b.close) >= Number(b.open);

    ctx.strokeStyle = up ? "#34f59b" : "#ff5d5d";
    ctx.fillStyle = ctx.strokeStyle;

    ctx.beginPath();
    ctx.moveTo(xx, high);
    ctx.lineTo(xx, low);
    ctx.stroke();

    ctx.fillRect(xx - bw / 2, Math.min(open, close), bw, Math.max(2, Math.abs(close - open)));
  });

  function line(val, color, label, width = 1.25) {
    if (!isGoodNumber(val) || Number(val) <= 0) return;

    const yy = y(Number(val));

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash([7, 6]);

    ctx.beginPath();
    ctx.moveTo(leftPad - 10, yy);
    ctx.lineTo(W - rightPad, yy);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.font = "13px sans-serif";
    ctx.fillText(label + " " + money(val), leftPad, yy - 7);
    ctx.restore();
  }

  function badge(val, color, text, alignRight = false, yOffset = 0) {
    if (!isGoodNumber(val) || Number(val) <= 0) return;

    const yy = y(Number(val)) + yOffset;
    ctx.save();
    ctx.font = "bold 13px sans-serif";
    const padX = 8;
    const textWidth = ctx.measureText(text).width;
    const boxW = Math.min(W - leftPad - rightPad, textWidth + padX * 2);
    const boxH = 24;
    const xx = alignRight ? W - rightPad - boxW : leftPad;

    ctx.fillStyle = color;
    ctx.globalAlpha = 0.92;
    ctx.fillRect(xx, yy - boxH / 2, boxW, boxH);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, xx + padX, yy + 5);
    ctx.restore();
  }

  line(s.buyZoneHigh, "#42e8ff", "Entry high");
  line(s.buyZoneLow, "#4ea1ff", "Entry low");
  line(s.stopLoss, "#ff5d5d", "Stop");
  line(s.target1, "#34f59b", "Target");

  const trades = getTradesForSymbol(s.symbol);

  trades.forEach((t) => {
    const isSelectedTrade = String(t.id) === String(selectedPaperTradeId);
    const entryLabel = isSelectedTrade
      ? `ENTRY ${shortSymbol(t.symbol)} ${money(t.entry)} | Bought ${formatTradeTime(t.openedAt)}`
      : `ENTRY ${money(t.entry)}`;

    const exitLabel = isSelectedTrade
      ? `EXIT ${shortSymbol(t.symbol)} ${money(t.exit)} | Sold ${formatTradeTime(t.closedAt)}`
      : `EXIT ${money(t.exit)}`;

    const profitLabel =
      t.status === "closed"
        ? `NET P/L ${signedMoney(t.pnl)} | Fees ${money(t.totalBrokerFees)}`
        : `TARGET PROFIT ${signedMoney(t.targetProfit)}`;

    line(t.entry, "#42e8ff", isSelectedTrade ? "SELECTED AUTO ENTRY" : "AUTO ENTRY", isSelectedTrade ? 3 : 2.2);
    line(t.stop, "#ff5d5d", "AUTO STOP", isSelectedTrade ? 2.2 : 1.8);
    line(t.target, "#34f59b", "AUTO TARGET", isSelectedTrade ? 2.2 : 1.8);

    badge(t.entry, "#1c79ff", entryLabel, false, isSelectedTrade ? -16 : 0);

    if (isGoodNumber(t.exit) && Number(t.exit) > 0) {
      line(t.exit, "#ffc857", isSelectedTrade ? "SELECTED AUTO EXIT" : "AUTO EXIT", isSelectedTrade ? 3 : 2.2);
      badge(t.exit, "#ffc857", exitLabel, true, isSelectedTrade ? 16 : 0);
    }

    if (isSelectedTrade) {
      const details = [
        `Shares ${t.shares}`,
        `Value ${money(t.tradeValue || t.capitalUsed)}`,
        `Entry fee ${money(t.entryBrokerFee)}`,
        t.status === "closed" ? `Exit fee ${money(t.exitBrokerFee)}` : `Est exit fee ${money(t.estimatedExitBrokerFee)}`
      ].join(" | ");

      badge(t.entry, "#0b1320", details, true, 16);
    }

    if (t.status === "closed" && isGoodNumber(t.pnl)) {
      badge(t.exit || t.entry, Number(t.pnl) >= 0 ? "#23c983" : "#ff5d5d", profitLabel, true, -16);
    } else if (isSelectedTrade && isGoodNumber(t.targetProfit)) {
      badge(t.target || t.entry, Number(t.targetProfit) >= 0 ? "#23c983" : "#ff5d5d", profitLabel, true, -16);
    }
  });

  ctx.fillStyle = "#8fa4bc";
  ctx.font = "13px sans-serif";
  ctx.fillText(
    `${shortSymbol(s.symbol)} | ${sourceLabel || s.source || "public data"} | ${bars.length} bars | ${currentRange}/${currentInterval}`,
    leftPad,
    H - 16
  );

  if ($("chartMeta")) {
    $("chartMeta").textContent =
      `${shortSymbol(s.symbol)} | ${bars.length} bars | ${currentRange} / ${currentInterval} | Click an auto trade to show bought time, sold time, entry, exit and profit`;
  }
}

async function runScan(mode = "scan") {
  try {
    toast("Running real ASX scan...");

    const sector = $("sector") ? $("sector").value : "";
    const symbols = $("symbols") ? $("symbols").value : "";

    const data = await getJson(
      endpoint(mode === "discover" ? "/api/discover" : mode === "day" ? "/api/day-scan" : "/api/scan", {
        symbols,
        sector,
        scanLimit: 160,
        limit: 100
      })
    );

    selectedSignal = null;
    selectedPaperTradeId = null;
    renderSignals(data);
    renderAutoWarnings();

    toast("ASX scan complete");
  } catch (e) {
    toast(e.message);
    if ($("meta")) $("meta").textContent = "Scan failed: " + e.message;
  }
}

async function runAutoPaper() {
  try {
    toast("Running auto paper rules...");

    const sector = $("sector") ? $("sector").value : "";
    const symbols = $("symbols") ? $("symbols").value : "";

    const response = await fetch("/api/paper/auto", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sector,
        symbols,
        scanLimit: 160,
        maxEntries: 2
      })
    });

    const json = await response.json();

    if (!response.ok || json.ok === false) {
      throw new Error(json.error || "Auto paper failed");
    }

    const account = json.accountAfter || {};

    const openedHtml = (json.opened || [])
      .map(
        (t) => `<div class="paper-trade clickable-paper-trade ${String(t.id) === String(selectedPaperTradeId) ? "selected-paper-trade" : ""}" data-trade-id="${t.id}" data-symbol="${t.symbol}">
          <div class="paper-trade-head">
            <strong>${shortSymbol(t.symbol)} AUTO OPENED</strong>
            <small>${t.setup}</small>
          </div>
          <div class="trade-profit ${pnlClass(t.targetProfit)}">
            TARGET PROFIT AFTER FEES: <strong>${signedMoney(t.targetProfit)}</strong>
          </div>
          <small><strong>Bought:</strong> ${formatTradeTime(t.openedAt)}</small>
          <small>Trade value ${money(t.tradeValue)} | Shares ${t.shares} | Entry fee ${money(t.entryBrokerFee)} | Cash committed ${money(t.cashCommitted)}</small>
          <small>Risk after fees ${money(t.riskAmount)} | Target reward after fees ${money(t.targetProfit)}</small>
        </div>`
      )
      .join("");

    const blockedHtml = (json.blocked || [])
      .slice(0, 12)
      .map(
        (b) => `<div class="paper-trade warning-card">
          <div class="paper-trade-head">
            <strong>${shortSymbol(b.symbol)} BLOCKED</strong>
            <small>Auto paper</small>
          </div>
          <small>${b.reason || "Blocked by rule gate."}</small>
        </div>`
      )
      .join("");

    const candidateHtml = (json.topCandidates || [])
      .slice(0, 8)
      .map(
        (c) => `<div class="paper-trade">
          <div class="paper-trade-head">
            <strong>${shortSymbol(c.symbol)} CANDIDATE</strong>
            <small>${c.setup || "Setup"}</small>
          </div>
          <small>Score ${c.score} | R:R ${num(c.riskReward)} | Price ${money(c.price)} | Entry ${money(c.buyZoneLow)} - ${money(c.buyZoneHigh)}</small>
        </div>`
      )
      .join("");

    if ($("autoPaperOutput")) {
      $("autoPaperOutput").innerHTML = `<div class="snapshot-list">
        <div class="snapshot-item"><strong>Opened this run</strong><span>${json.openedCount || 0}</span></div>
        <div class="snapshot-item"><strong>Blocked this run</strong><span>${json.blockedCount || 0}</span></div>
        <div class="snapshot-item"><strong>Cash left</strong><span>${money(account.cashAvailable)}</span></div>
        <div class="snapshot-item"><strong>In trades</strong><span>${money(account.capitalInOpenTrades)}</span></div>
        <div class="snapshot-item"><strong>Broker fee</strong><span>${money(account.brokerFeePerTrade)}</span></div>
        <div class="snapshot-item"><strong>Minimum trade</strong><span>${money(account.minTradeValue)}</span></div>
      </div>

      <h4>Opened this run</h4>
      <div class="paper-trades">
        ${openedHtml || `<div class="paper-trade"><strong>No trades opened</strong><small>No setup was actually entered this run.</small></div>`}
      </div>

      <h4>Blocked / skipped</h4>
      <div class="paper-trades">
        ${blockedHtml || `<div class="paper-trade"><strong>No blocked details</strong><small>The backend did not return block reasons.</small></div>`}
      </div>

      <h4>Top candidates</h4>
      <div class="paper-trades">
        ${candidateHtml || `<div class="paper-trade"><strong>No candidates</strong><small>No symbols passed the candidate filter.</small></div>`}
      </div>`;
    }

    bindPaperTradeClicks();

    if (Number(json.openedCount || 0) > 0) {
      const first = json.opened[0];
      selectedPaperTradeId = first.id;
      const msg = `${shortSymbol(first.symbol)} auto paper trade opened. Target profit after fees ${signedMoney(first.targetProfit)}, cash left ${money(account.cashAvailable)}.`;
      toast(msg);
      speak(msg);
    } else {
      toast("Auto paper complete. No trades opened. Check blocked reasons.");
    }

    await loadPaper();

    if (selectedPaperTradeId) {
      const trade = getPaperTradeById(selectedPaperTradeId);
      if (trade) await selectPaperTrade(trade.id, trade.symbol);
    } else if (selectedSignal) {
      await loadChart(selectedSignal.symbol);
    }
  } catch (e) {
    toast(e.message);

    if ($("autoPaperOutput")) {
      $("autoPaperOutput").innerHTML = `<p class="muted">${e.message}</p>`;
    }
  }
}

async function checkOptions(symbol) {
  try {
    const data = await getJson(endpoint("/api/options", { symbol }));
    alert(JSON.stringify(data, null, 2));
  } catch (e) {
    toast(e.message);
  }
}

function renderPaperAccount(stats, trades) {
  const st = stats || {};
  const rows = trades || [];
  const openRows = rows.filter((t) => t.status === "open");
  const closedRows = rows.filter((t) => t.status === "closed");

  if (!$("paperStats")) return;

  $("paperStats").innerHTML = `
    <div class="paper-account-head">
      <h3>$5,000 Auto Paper Account</h3>
      <small>Fully automatic rule-based paper account. Click any auto trade to show bought time, sold time, entry, exit, brokerage and profit on the chart.</small>
    </div>

    <div class="paper-summary account-summary">
      <div class="small-metric"><span>Starting balance</span><strong>${money(st.startingBalance || 5000)}</strong></div>
      <div class="small-metric"><span>Cash available</span><strong>${money(st.cashAvailable)}</strong></div>
      <div class="small-metric"><span>Capital in trades</span><strong>${money(st.capitalInOpenTrades)}</strong></div>
      <div class="small-metric"><span>Cash committed</span><strong>${money(st.cashCommittedToOpenTrades)}</strong></div>
      <div class="small-metric"><span>Account equity</span><strong>${money(st.accountEquity)}</strong></div>
      <div class="small-metric"><span>Open risk after fees</span><strong>${money(st.openRisk)}</strong></div>
      <div class="small-metric"><span>Target profit after fees</span><strong class="${pnlClass(st.openTargetReward)}">${signedMoney(st.openTargetReward)}</strong></div>
      <div class="small-metric"><span>Realised net P/L</span><strong class="${pnlClass(st.realisedPnl || st.netPnl || 0)}">${signedMoney(st.realisedPnl || st.netPnl || 0)}</strong></div>
      <div class="small-metric"><span>Broker fee each trade</span><strong>${money(st.brokerFeePerTrade || 9.5)}</strong></div>
      <div class="small-metric"><span>Open entry fees</span><strong>${money(st.openEntryBrokerFees)}</strong></div>
      <div class="small-metric"><span>Est. open exit fees</span><strong>${money(st.estimatedOpenExitFees)}</strong></div>
      <div class="small-metric"><span>Open trades</span><strong>${st.openTrades || 0} / ${st.maxOpenTrades || 5}</strong></div>
    </div>

    <h4>Open auto trades</h4>
    <div class="paper-trades">
      ${
        openRows
          .map(
            (t) => `<div class="paper-trade clickable-paper-trade ${String(t.id) === String(selectedPaperTradeId) ? "selected-paper-trade" : ""}" data-trade-id="${t.id}" data-symbol="${t.symbol}">
              <div class="paper-trade-head">
                <strong>${shortSymbol(t.symbol)} OPEN</strong>
                <small>${t.setup || "auto paper trade"}</small>
              </div>

              <div class="trade-profit ${pnlClass(t.targetProfit)}">
                TARGET PROFIT AFTER FEES: <strong>${signedMoney(t.targetProfit)}</strong>
              </div>

              <small><strong>Bought:</strong> ${formatTradeTime(t.openedAt)}</small>
              <small>Entry ${money(t.entry)} | Shares ${t.shares} | Trade value ${money(t.tradeValue || t.capitalUsed)}</small>
              <small>Entry fee ${money(t.entryBrokerFee)} | Est. exit fee ${money(t.estimatedExitBrokerFee)} | Cash committed ${money(t.cashCommitted)}</small>
              <small>Stop ${money(t.stop)} | Target ${money(t.target)}</small>
              <small>Risk after fees ${money(t.riskAmount)} | R:R ${num(t.riskReward)}</small>
              <small>Account used ${num(t.accountUsedPct)}% | Account risk ${num(t.accountRiskPct)}%</small>

              <div class="paper-close-row" onclick="event.stopPropagation()">
                <input id="close-${t.id}" type="number" step="0.01" value="${t.entry}">
                <button class="mini" onclick="closePaperTrade('${t.id}')">Close</button>
              </div>
            </div>`
          )
          .join("") ||
        `<div class="paper-trade">
          <strong>No open auto trades</strong>
          <small>The $5,000 auto paper account will open trades only after the rule gate passes and trade value is at least $500 before brokerage.</small>
        </div>`
      }
    </div>

    <h4>Closed auto trades</h4>
    <div class="paper-trades">
      ${
        closedRows
          .slice(0, 12)
          .map(
            (t) => `<div class="paper-trade clickable-paper-trade ${String(t.id) === String(selectedPaperTradeId) ? "selected-paper-trade" : ""}" data-trade-id="${t.id}" data-symbol="${t.symbol}">
              <div class="paper-trade-head">
                <strong>${shortSymbol(t.symbol)} CLOSED</strong>
                <small>${t.exitReason || "closed"}</small>
              </div>

              <div class="trade-profit ${pnlClass(t.pnl)}">
                NET PROFIT AFTER FEES: <strong>${signedMoney(t.pnl)}</strong>
              </div>

              <small><strong>Bought:</strong> ${formatTradeTime(t.openedAt)} | <strong>Sold:</strong> ${formatTradeTime(t.closedAt)}</small>
              <small>Entry ${money(t.entry)} | Exit ${money(t.exit)} | Shares ${t.shares}</small>
              <small>Trade value ${money(t.tradeValue || t.capitalUsed)} | Gross P/L ${signedMoney(t.grossPnl)}</small>
              <small>Broker fees ${money(t.totalBrokerFees)} | Net P/L ${signedMoney(t.pnl)} (${num(t.pnlPct)}%)</small>
            </div>`
          )
          .join("") ||
        `<div class="paper-trade">
          <strong>No closed auto trades yet</strong>
          <small>Closed trades will show net P/L after entry and exit brokerage.</small>
        </div>`
      }
    </div>
  `;

  bindPaperTradeClicks();
}

async function loadPaper() {
  try {
    const [statsResponse, tradesResponse] = await Promise.all([
      getJson("/api/paper/stats"),
      getJson("/api/paper/trades")
    ]);

    const stats = statsResponse.stats || tradesResponse.account || {};
    const rows = tradesResponse.trades || [];

    paperTradesCache = rows;

    renderPaperAccount(stats, rows);

    if (selectedSignal) {
      drawChart(selectedSignal, selectedSignal.bars || [], selectedSignal.source || "public data");
    }

    renderAutoWarnings();
  } catch (e) {
    if ($("paperStats")) $("paperStats").innerHTML = `<p class="muted">${e.message}</p>`;
  }
}

async function closePaperTrade(id) {
  const el = $("close-" + id);
  const exit = el ? Number(el.value) : NaN;

  try {
    const response = await fetch("/api/paper/close", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id,
        exit,
        exitReason: "manual close from dashboard"
      })
    });

    const json = await response.json();

    if (!response.ok || json.ok === false) {
      throw new Error(json.error || "Paper close failed");
    }

    const account = json.account || {};
    const trade = json.trade || {};
    selectedPaperTradeId = trade.id;

    toast(`Auto trade closed. Net profit after fees ${signedMoney(trade.pnl)}. Cash available ${money(account.cashAvailable)}.`);

    await loadPaper();
    await selectPaperTrade(trade.id, trade.symbol);
  } catch (e) {
    toast(e.message);
  }
}

async function loadHealth() {
  try {
    const h = await getJson("/api/health");

    if ($("systemHealth")) {
      $("systemHealth").textContent = JSON.stringify(h, null, 2);
    }
  } catch (e) {
    if ($("systemHealth")) $("systemHealth").textContent = e.message;
  }
}

async function runBacktest() {
  try {
    toast("Running ASX backtest...");

    const data = await getJson(
      endpoint("/api/backtest", {
        symbols: $("symbols") ? $("symbols").value : "",
        years: 5,
        account: 5000,
        risk: 50
      })
    );

    if ($("backtestOutput")) {
      $("backtestOutput").textContent = JSON.stringify(data.stats || data, null, 2);
    }

    toast("Backtest complete");
  } catch (e) {
    toast(e.message);
  }
}

function updateAutoTraderUi() {
  if ($("autoTraderStatus")) {
    $("autoTraderStatus").textContent = autoTraderOn ? "ON" : "OFF";
  }

  if ($("autoToggleBtn")) {
    $("autoToggleBtn").textContent = autoTraderOn ? "Auto Trader: ON" : "Auto Trader: OFF";
  }

  if ($("autoNextScan")) {
    $("autoNextScan").textContent = autoTraderOn ? `${autoTraderCountdown}s` : "Paused";
  }

  if ($("autoPaperState")) {
    $("autoPaperState").textContent = autoTraderOn ? "AUTO ON" : "PAUSED";
  }
}

function warnBeforeEntries() {
  const near = lastSignals
    .filter((s) => {
      const score = Number(s.score || 0);
      const rr = Number(s.riskReward || 0);
      const distance = Number(s.distanceToBuyZonePct || 999);

      return score >= 75 && rr >= 1.5 && distance <= 2.5 && Number(s.price) > 0;
    })
    .slice(0, 5);

  if ($("entryWarnings")) {
    $("entryWarnings").textContent = String(near.length);
  }

  return near.map((s) => ({
    type: "NEAR ENTRY",
    symbol: s.symbol,
    text: `${shortSymbol(s.symbol)} is near the auto-entry zone, but has not entered yet. Score ${s.score}, R:R ${num(s.riskReward)}, distance ${num(s.distanceToBuyZonePct)}%. Minimum trade is $500 before brokerage.`
  }));
}

function warnBeforeExits() {
  const warnings = [];

  for (const trade of paperTradesCache.filter((t) => t.status === "open")) {
    const signal = lastSignals.find((s) => shortSymbol(s.symbol) === shortSymbol(trade.symbol));
    if (!signal) continue;

    const price = Number(signal.price);
    const stop = Number(trade.stop);
    const target = Number(trade.target);

    if (!Number.isFinite(price) || price <= 0) continue;

    if (Number.isFinite(target) && target > 0) {
      const distanceToTargetPct = ((target - price) / price) * 100;

      if (distanceToTargetPct >= 0 && distanceToTargetPct <= 1.0) {
        warnings.push({
          type: "TARGET WARNING",
          symbol: trade.symbol,
          text: `${shortSymbol(trade.symbol)} is close to target. Price ${money(price)}, target ${money(target)}. Exit brokerage will apply.`
        });
      }
    }

    if (Number.isFinite(stop) && stop > 0) {
      const distanceToStopPct = ((price - stop) / price) * 100;

      if (distanceToStopPct >= 0 && distanceToStopPct <= 1.0) {
        warnings.push({
          type: "STOP WARNING",
          symbol: trade.symbol,
          text: `${shortSymbol(trade.symbol)} is close to stop. Price ${money(price)}, stop ${money(stop)}. Exit brokerage will apply.`
        });
      }
    }
  }

  if ($("exitWarnings")) {
    $("exitWarnings").textContent = String(warnings.length);
  }

  return warnings;
}

function renderAutoWarnings() {
  const entry = warnBeforeEntries();
  const exit = warnBeforeExits();
  const all = [...entry, ...exit];

  if (!$("autoWarnings")) return;

  $("autoWarnings").innerHTML = all.length
    ? all
        .map(
          (w) => `
          <div class="paper-trade warning-card">
            <div class="paper-trade-head">
              <strong>${w.type}</strong>
              <small>${shortSymbol(w.symbol)}</small>
            </div>
            <small>${w.text}</small>
          </div>
        `
        )
        .join("")
    : `<div class="paper-trade">
        <strong>No near-entry or near-exit warnings</strong>
        <small>Auto trader is monitoring. Minimum trade value is $500 before brokerage.</small>
      </div>`;

  if (all.length) {
    const first = all[0].text;

    if (first !== lastWarningText) {
      lastWarningText = first;
      toast(first);
      speak(first);
    }
  }
}

async function requestWakeLock() {
  try {
    if (!("wakeLock" in navigator)) {
      console.log("Wake Lock API is not supported in this browser.");
      return;
    }

    if (wakeLock) return;

    wakeLock = await navigator.wakeLock.request("screen");

    wakeLock.addEventListener("release", () => {
      wakeLock = null;
      console.log("Screen wake lock released.");
    });

    console.log("Screen wake lock active.");
  } catch (error) {
    console.log("Wake lock failed:", error.message);
  }
}

async function keepServerAwake() {
  try {
    const data = await getJson("/api/keepalive");

    if ($("systemHealth")) {
      const short = {
        status: data.status,
        serverTime: data.time,
        uptimeSeconds: data.uptimeSeconds,
        autoTrader: autoTraderOn ? "ON" : "OFF",
        lastKeepAlive: new Date().toLocaleTimeString()
      };

      const current = $("systemHealth").textContent || "";

      if (!current.includes("TradingMint ASX Real")) {
        $("systemHealth").textContent = JSON.stringify(short, null, 2);
      }
    }

    return true;
  } catch (error) {
    console.log("Keepalive failed:", error.message);
    return false;
  }
}

function startKeepAlive() {
  if (keepAliveInterval) clearInterval(keepAliveInterval);

  keepServerAwake();

  keepAliveInterval = setInterval(async () => {
    await keepServerAwake();

    if (document.visibilityState === "visible") {
      await requestWakeLock();
    }
  }, 60 * 1000);
}

function startHardRefreshLoop() {
  if (hardRefreshInterval) clearInterval(hardRefreshInterval);

  hardRefreshInterval = setInterval(async () => {
    if (!autoTraderOn) return;
    if (autoTraderBusy) return;

    try {
      autoTraderBusy = true;

      await keepServerAwake();
      await loadPaper();

      if (document.visibilityState === "visible") {
        renderAutoWarnings();

        const hasOpenTrades = paperTradesCache.some((t) => t.status === "open");

        if (hasOpenTrades || lastSignals.length === 0) {
          await runScan("scan");
        }

        if (selectedSignal) {
          await loadChart(selectedSignal.symbol);
        }
      }
    } catch (error) {
      console.log("Hard refresh loop failed:", error.message);
    } finally {
      autoTraderBusy = false;
    }
  }, 30 * 1000);
}

document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible") {
    await requestWakeLock();
    await keepServerAwake();
    await loadPaper();

    if (selectedSignal) {
      await loadChart(selectedSignal.symbol);
    }
  }
});

async function autoTraderTick(forceRun = false) {
  if (!autoTraderOn && !forceRun) return;
  if (autoTraderBusy) return;

  try {
    autoTraderBusy = true;

    await keepServerAwake();
    await runScan("scan");
    await loadPaper();
    renderAutoWarnings();

    const ready = lastSignals.filter((s) => s.paperRules && s.paperRules.allowed);

    if (ready.length > 0 || forceRun) {
      await runAutoPaper();
      await loadPaper();
      renderAutoWarnings();
    }

    if (selectedSignal) {
      await loadChart(selectedSignal.symbol);
    }
  } catch (e) {
    toast("Auto trader error: " + e.message);
  } finally {
    autoTraderBusy = false;
  }
}

function startAutoTrader() {
  if (autoTraderInterval) clearInterval(autoTraderInterval);

  autoTraderCountdown = AUTO_SCAN_SECONDS;
  updateAutoTraderUi();

  autoTraderInterval = setInterval(async () => {
    if (!autoTraderOn) {
      updateAutoTraderUi();
      return;
    }

    autoTraderCountdown -= 1;

    if (autoTraderCountdown <= 0) {
      autoTraderCountdown = AUTO_SCAN_SECONDS;
      await autoTraderTick(false);
    }

    updateAutoTraderUi();
  }, 1000);
}

function setupTimeframeButtons() {
  document.querySelectorAll(".tf").forEach((btn) => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll(".tf").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      currentRange = btn.dataset.range || "1y";
      currentInterval = btn.dataset.interval || "1d";

      if (selectedSignal) {
        await loadChart(selectedSignal.symbol);
      }
    });
  });
}

function setupNav() {
  document.querySelectorAll(".nav").forEach((btn) =>
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      const mode = btn.dataset.mode || "dashboard";

      const map = {
        dashboard: "chartPanel",
        chart: "chartPanel",
        scan: "scanPanel",
        paper: "paperPanel",
        journal: "paperPanel",
        performance: "paperPanel",
        settings: "settingsPanel",
        sectors: "sectorsPanel",
        backtest: "healthPanel",
        health: "healthPanel"
      };

      const id = map[mode] || "chartPanel";
      const el = $(id);

      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }

      if (["paper", "journal", "performance"].includes(mode)) loadPaper();
      if (mode === "health") loadHealth();
    })
  );
}

window.checkOptions = checkOptions;
window.closePaperTrade = closePaperTrade;
window.runAutoPaper = runAutoPaper;
window.selectPaperTrade = selectPaperTrade;

if ($("scanBtn")) $("scanBtn").addEventListener("click", () => runScan("scan"));
if ($("refreshBtn")) $("refreshBtn").addEventListener("click", () => runScan("scan"));
if ($("discoverBtn")) $("discoverBtn").addEventListener("click", () => runScan("discover"));
if ($("dayBtn")) $("dayBtn").addEventListener("click", () => runScan("day"));
if ($("paperBtn")) $("paperBtn").addEventListener("click", loadPaper);
if ($("runBacktest")) $("runBacktest").addEventListener("click", runBacktest);
if ($("autoPaperBtn")) $("autoPaperBtn").addEventListener("click", runAutoPaper);
if ($("topAutoPaperBtn")) $("topAutoPaperBtn").addEventListener("click", runAutoPaper);
if ($("paperAutoPanelBtn")) $("paperAutoPanelBtn").addEventListener("click", runAutoPaper);

if ($("autoToggleBtn")) {
  $("autoToggleBtn").addEventListener("click", () => {
    autoTraderOn = !autoTraderOn;
    updateAutoTraderUi();
    toast(autoTraderOn ? "Auto trader turned on" : "Auto trader paused");
  });
}

if ($("autoRunNowBtn")) {
  $("autoRunNowBtn").addEventListener("click", () => autoTraderTick(true));
}

if ($("clearSelect")) {
  $("clearSelect").addEventListener("click", () => {
    selectedSignal = null;
    selectedPaperTradeId = null;
    window.selectedTicker = null;
    renderDetail(null);

    document.querySelectorAll(".paper-trade").forEach((el) => {
      el.classList.remove("selected-paper-trade");
    });
  });
}

if ($("voiceBtn")) {
  $("voiceBtn").addEventListener("click", () => {
    voiceEnabled = true;
    toast("Voice enabled");
    speak("TradingMint ASX voice enabled");
  });
}

setupTimeframeButtons();
setupNav();

updateMarketClock();
setInterval(updateMarketClock, 1000);

requestWakeLock();
startKeepAlive();
startHardRefreshLoop();

loadHealth();
loadPaper();
runScan("scan");
startAutoTrader();
