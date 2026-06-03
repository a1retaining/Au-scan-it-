let selectedSignal = null;
let lastSignals = [];
let voiceEnabled = false;
let currentRange = "1y";
let currentInterval = "1d";
let paperTradesCache = [];

let autoTraderOn = true;
let autoTraderInterval = null;
let autoTraderCountdown = 60;
let lastWarningText = "";

const AUTO_SCAN_SECONDS = 60;

const $ = (id) => document.getElementById(id);

function isGoodNumber(v) {
  if (v === null || v === undefined || v === "") return false;
  const n = Number(v);
  return Number.isFinite(n);
}

const money = (v) => {
  if (!isGoodNumber(v)) return "-";
  const n = Number(v);
  if (n <= 0) return "-";
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
  window.selectedTicker = selectedSignal ? selectedSignal.symbol : null;

  document.querySelectorAll("#signals tr").forEach((r) =>
    r.classList.toggle("selected", selectedSignal && r.dataset.symbol === selectedSignal.symbol)
  );

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
      <p class="muted">Select a signal to inspect entry, stop, target, score breakdown and rule gate. This is not the paper account.</p>`;
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
      <button class="secondary" onclick="openPaperTrade('${s.symbol}')">Send to Paper Account</button>
      <button class="secondary" onclick="runAutoPaper()">Run Auto Paper</button>
      <button class="secondary" onclick="document.getElementById('chartPanel').scrollIntoView({behavior:'smooth'})">View Chart</button>
      <button class="secondary" onclick="checkOptions('${s.symbol}')">Check Options Reality</button>
    </div>

    <h4>Paper Trade Rule Gate</h4>
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
  return paperTradesCache.filter((t) => t.symbol === symbol || shortSymbol(t.symbol) === shortSymbol(symbol));
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

  function line(val, color, label) {
    if (!isGoodNumber(val) || Number(val) <= 0) return;

    const yy = y(Number(val));

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.25;
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

  line(s.buyZoneHigh, "#42e8ff", "Entry high");
  line(s.buyZoneLow, "#4ea1ff", "Entry low");
  line(s.stopLoss, "#ff5d5d", "Stop");
  line(s.target1, "#34f59b", "Target");

  const trades = getTradesForSymbol(s.symbol);

  trades.forEach((t) => {
    line(t.entry, "#42e8ff", "Paper entry");
    line(t.stop, "#ff5d5d", "Paper stop");
    line(t.target, "#34f59b", "Paper target");

    if (isGoodNumber(t.exit) && Number(t.exit) > 0) {
      line(t.exit, "#ffc857", "Paper exit");
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
      `${shortSymbol(s.symbol)} | ${bars.length} bars | ${currentRange} / ${currentInterval} | Entries, stops, targets and paper trades`;
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
        (t) => `<div class="paper-trade">
          <div class="paper-trade-head">
            <strong>${shortSymbol(t.symbol)} AUTO OPENED</strong>
            <small>${t.setup}</small>
          </div>
          <small>
            Entry ${money(t.entry)} | Shares ${t.shares} | Capital ${money(t.capitalUsed)} | Risk ${money(t.riskAmount)} | Target reward ${money(t.targetProfit)}
          </small>
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
      </div>

      <h4>Opened</h4>
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

    if (Number(json.openedCount || 0) > 0) {
      const first = json.opened[0];
      const msg = `${shortSymbol(first.symbol)} auto paper trade opened. Capital used ${money(first.capitalUsed)}, cash left ${money(account.cashAvailable)}.`;
      toast(msg);
      speak(msg);
    } else {
      toast("Auto paper complete. No trades opened. Check blocked reasons.");
    }

    await loadPaper();

    if (selectedSignal) {
      await loadChart(selectedSignal.symbol);
    }
  } catch (e) {
    toast(e.message);

    if ($("autoPaperOutput")) {
      $("autoPaperOutput").innerHTML = `<p class="muted">${e.message}</p>`;
    }
  }
}

async function openPaperTrade(symbol) {
  const s = lastSignals.find((x) => x.symbol === symbol);
  if (!s) return;

  try {
    const response = await fetch("/api/paper/open", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        symbol,
        side: "long",
        entry: s.price,
        shares: Math.max(1, Math.floor(500 / Math.max(Number(s.price || 1), 1))),
        stop: s.stopLoss,
        target: s.target1,
        setup: s.setup,
        score: s.score,
        riskReward: s.riskReward,
        decision: s.decision,
        buyZoneHigh: s.buyZoneHigh,
        distanceToBuyZonePct: s.distanceToBuyZonePct,
        change5dPct: s.change5dPct,
        change20dPct: s.change20dPct
      })
    });

    const json = await response.json();

    if (!response.ok || json.ok === false) {
      const reason = json.checks
        ? json.checks.map((c) => `${c.name}: ${c.pass ? "PASS" : "BLOCK"}`).join(", ")
        : json.error || "Paper entry failed";

      throw new Error(reason);
    }

    const account = json.account || {};
    toast(`Paper trade opened for ${shortSymbol(symbol)}. Cash left ${money(account.cashAvailable)}.`);

    await loadPaper();

    if (selectedSignal) await loadChart(selectedSignal.symbol);
  } catch (e) {
    toast(e.message);
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
      <h3>$5,000 Paper Account</h3>
      <small>Shows cash, capital used, risk, reward and trade history.</small>
    </div>

    <div class="paper-summary account-summary">
      <div class="small-metric"><span>Starting balance</span><strong>${money(st.startingBalance || 5000)}</strong></div>
      <div class="small-metric"><span>Cash available</span><strong>${money(st.cashAvailable)}</strong></div>
      <div class="small-metric"><span>Capital in trades</span><strong>${money(st.capitalInOpenTrades)}</strong></div>
      <div class="small-metric"><span>Account equity</span><strong>${money(st.accountEquity)}</strong></div>
      <div class="small-metric"><span>Open risk</span><strong>${money(st.openRisk)}</strong></div>
      <div class="small-metric"><span>Target reward</span><strong>${money(st.openTargetReward)}</strong></div>
      <div class="small-metric"><span>Realised P/L</span><strong>${signedMoney(st.realisedPnl || st.netPnl || 0)}</strong></div>
      <div class="small-metric"><span>Open trades</span><strong>${st.openTrades || 0} / ${st.maxOpenTrades || 5}</strong></div>
    </div>

    <h4>Open paper trades</h4>
    <div class="paper-trades">
      ${
        openRows
          .map(
            (t) => `<div class="paper-trade">
              <div class="paper-trade-head">
                <strong>${shortSymbol(t.symbol)} OPEN</strong>
                <small>${t.setup || "paper trade"}</small>
              </div>

              <small>
                Entry ${money(t.entry)} | Shares ${t.shares} | Capital used ${money(t.capitalUsed || t.cost)}
              </small>
              <small>
                Stop ${money(t.stop)} | Target ${money(t.target)} | Risk ${money(t.riskAmount)} | Target reward ${money(t.targetProfit)}
              </small>
              <small>
                R:R ${num(t.riskReward)} | Account used ${num(t.accountUsedPct)}% | Account risk ${num(t.accountRiskPct)}%
              </small>

              <div class="paper-close-row">
                <input id="close-${t.id}" type="number" step="0.01" value="${t.entry}">
                <button class="mini" onclick="closePaperTrade('${t.id}')">Close</button>
              </div>
            </div>`
          )
          .join("") ||
        `<div class="paper-trade">
          <strong>No open paper trades</strong>
          <small>Auto Paper will open trades only after the rule gate passes.</small>
        </div>`
      }
    </div>

    <h4>Closed trades</h4>
    <div class="paper-trades">
      ${
        closedRows
          .slice(0, 12)
          .map(
            (t) => `<div class="paper-trade">
              <div class="paper-trade-head">
                <strong>${shortSymbol(t.symbol)} CLOSED</strong>
                <small>${t.exitReason || "closed"}</small>
              </div>
              <small>Entry ${money(t.entry)} | Exit ${money(t.exit)} | Shares ${t.shares}</small>
              <small>P/L ${signedMoney(t.pnl)} (${num(t.pnlPct)}%) | Capital ${money(t.capitalUsed || t.cost)}</small>
            </div>`
          )
          .join("") ||
        `<div class="paper-trade">
          <strong>No closed trades yet</strong>
          <small>Closed trades will show here.</small>
        </div>`
      }
    </div>
  `;
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
    toast(`Paper trade closed. Cash available ${money(account.cashAvailable)}.`);

    await loadPaper();

    if (selectedSignal) {
      await loadChart(selectedSignal.symbol);
    }
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
    text: `${shortSymbol(s.symbol)} is near the auto-entry zone, but has not entered yet. Score ${s.score}, R:R ${num(s.riskReward)}, distance ${num(s.distanceToBuyZonePct)}%.`
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
          text: `${shortSymbol(trade.symbol)} is close to target. Price ${money(price)}, target ${money(target)}.`
        });
      }
    }

    if (Number.isFinite(stop) && stop > 0) {
      const distanceToStopPct = ((price - stop) / price) * 100;

      if (distanceToStopPct >= 0 && distanceToStopPct <= 1.0) {
        warnings.push({
          type: "STOP WARNING",
          symbol: trade.symbol,
          text: `${shortSymbol(trade.symbol)} is close to stop. Price ${money(price)}, stop ${money(stop)}.`
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
        <small>Auto trader is monitoring.</small>
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

async function autoTraderTick(forceRun = false) {
  if (!autoTraderOn && !forceRun) return;

  try {
    await runScan("scan");
    await loadPaper();
    renderAutoWarnings();

    const ready = lastSignals.filter((s) => s.paperRules && s.paperRules.allowed);

    if (ready.length > 0 || forceRun) {
      await runAutoPaper();
      await loadPaper();
      renderAutoWarnings();
    }
  } catch (e) {
    toast("Auto trader error: " + e.message);
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
        auto: "autoTraderPanel",
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

window.openPaperTrade = openPaperTrade;
window.checkOptions = checkOptions;
window.closePaperTrade = closePaperTrade;
window.runAutoPaper = runAutoPaper;

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
    window.selectedTicker = null;
    renderDetail(null);
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

loadHealth();
loadPaper();
runScan("scan");
startAutoTrader();
