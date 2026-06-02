let selectedSignal = null;
let lastSignals = [];
let voiceEnabled = false;
let currentRange = "1y";
let currentInterval = "1d";
let paperTradesCache = [];

const $ = (id) => document.getElementById(id);

const money = (v) =>
  Number.isFinite(Number(v))
    ? "$" + Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })
    : "-";

const num = (v) =>
  Number.isFinite(Number(v)) ? Number(v).toFixed(2) : "-";

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

  if (score >= 80) return "good";
  if (score >= 60) return "mid";

  return "bad";
}

function decisionClass(decision) {
  const d = String(decision || "");

  if (d.includes("AUTO") || d.includes("ENTER") || d.includes("READY")) return "enter";
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

function calcRiskReward(entry, stop, target) {
  const risk = Number(entry) - Number(stop);
  const reward = Number(target) - Number(entry);

  if (!Number.isFinite(risk) || !Number.isFinite(reward)) return 0;
  if (risk <= 0 || reward <= 0) return 0;

  return Math.round((reward / risk) * 100) / 100;
}

function qualityRank(s) {
  const score = Number(s.score || 0);
  const rr = Number(s.riskReward || 0);
  const liq = Number(s.avgDollarVolume20 || 0);

  let q = score + Math.min(14, rr * 3.5);

  if (liq >= 20000000) q += 5;
  if (String(s.decision || "").includes("AUTO")) q += 12;
  if (String(s.decision || "").includes("ENTER")) q += 8;
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

function paperRuleStatus(s) {
  const score = Number(s.score || 0);
  const rr = Number(s.riskReward || 0);
  const trend = trendWord(s);
  const distance = Number(s.distanceToBuyZonePct || 0);

  const checks = [
    {
      name: "Score",
      pass: score >= 80,
      label: `${score}/80`
    },
    {
      name: "R:R",
      pass: rr >= 1.8,
      label: `${num(rr)}/1.80`
    },
    {
      name: "Trend",
      pass: trend !== "BEARISH",
      label: trend
    },
    {
      name: "Buy zone",
      pass: distance <= 1.75,
      label: `${num(distance)}%`
    }
  ];

  return {
    allowed: checks.every((c) => c.pass),
    checks
  };
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

  const heatmap = $("heatmapGrid");

  if (heatmap) {
    heatmap.innerHTML =
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
  const top = [...(signals || [])]
    .sort((a, b) => qualityRank(b) - qualityRank(a))
    .slice(0, 6);

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

  const tape = top
    .map((s) => `${shortSymbol(s.symbol)} ${num(s.changePercent)}%`)
    .join("   •   ");

  if ($("tickerbar")) {
    $("tickerbar").textContent =
      `ASX SCANNER • ${tape || "NO SCAN YET"} • AUTO PAPER ENABLED • NO FAKE OPTION CHAINS`;
  }
}

function renderSignals(data) {
  lastSignals = (data.signals || [])
    .slice()
    .sort((a, b) => qualityRank(b) - qualityRank(a));

  const aGrades = lastSignals.filter((s) => Number(s.score || 0) >= 80).length;
  const autoReady = lastSignals.filter((s) => paperRuleStatus(s).allowed).length;

  if ($("marketRegime")) $("marketRegime").textContent = String(data.marketRegime || data.market || "ASX").toUpperCase();
  if ($("regimeCard")) $("regimeCard").textContent = String(data.marketRegime || data.market || "ASX").toUpperCase();
  if ($("regimeSub")) $("regimeSub").textContent = data.marketSource ? `Source: ${data.marketSource}` : "Sydney market";
  if ($("trendStat")) $("trendStat").textContent = lastSignals.length && lastSignals[0] ? trendWord(lastSignals[0]) : "SCANNING";
  if ($("countStat")) $("countStat").textContent = String(data.count ?? lastSignals.length);
  if ($("aGradeStat")) $("aGradeStat").textContent = String(aGrades);
  if ($("confidenceStat")) $("confidenceStat").textContent = autoReady > 0 ? "AUTO READY" : aGrades >= 1 ? "WATCH" : "LOW";
  if ($("updatedStat")) $("updatedStat").textContent = data.updatedAt ? new Date(data.updatedAt).toLocaleTimeString() : "Updated";

  if ($("meta")) {
    $("meta").textContent =
      `${data.mode || "scan"} | ${lastSignals.length} returned | ${autoReady} auto-paper ready | Sorted by quality`;
  }

  const tbody = $("signals");

  if (tbody) {
    tbody.innerHTML =
      lastSignals
        .map((s, idx) => {
          const selected = selectedSignal && selectedSignal.symbol === s.symbol ? "selected" : "";
          const trend = trendWord(s);
          const rules = paperRuleStatus(s);
          const actionLabel = rules.allowed ? "AUTO READY" : s.decision || "WATCH";

          return `<tr class="${selected}" data-symbol="${s.symbol}">
            <td>${idx + 1}</td>
            <td><strong>${shortSymbol(s.symbol)}</strong></td>
            <td>${s.setup || "Watch"}</td>
            <td><span class="score ${scoreClass(s.score)}">${s.score}</span></td>
            <td>${num(s.riskReward)}</td>
            <td>${trend}</td>
            <td>${money(s.price)}</td>
            <td>${money(s.buyZoneLow)} - ${money(s.buyZoneHigh)}</td>
            <td><span class="pill ${rules.allowed ? "enter" : decisionClass(s.decision)}">${actionLabel}</span></td>
          </tr>`;
        })
        .join("") ||
      `<tr>
        <td colspan="9">
          No signals returned. If this is during a Yahoo outage, the backend will show the real error instead of fake data.
        </td>
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

function renderDetail(s) {
  if (!s) {
    $("detail").innerHTML = `
      <h3>TRADE DECISION STREAM</h3>
      <p class="muted">Select a signal to inspect entry, stop, target, score breakdown and risk notes.</p>`;
    return;
  }

  const reasons = (s.reasons || [])
    .slice(0, 5)
    .map((x) => `<li>${x}</li>`)
    .join("");

  const warnings =
    (s.warnings || [])
      .slice(0, 5)
      .map((x) => `<li>${x}</li>`)
      .join("") || `<li>No major warning returned by scanner.</li>`;

  const parts = (s.scoreParts || [])
    .slice()
    .sort((a, b) => Number(b.points || 0) - Number(a.points || 0))
    .slice(0, 7)
    .map((p) => `<div class="snapshot-item"><strong>${p.name}</strong><span>${p.points}</span></div>`)
    .join("");

  const rules = paperRuleStatus(s);
  const gate = rules.allowed ? "AUTO PAPER READY" : "RULES BLOCK";

  $("detail").innerHTML = `<h3>TRADE DECISION STREAM</h3>

    <div class="detail-title">
      ${shortSymbol(s.symbol)}
      <small>${s.setup || "ASX setup"} | ${s.decision || "WATCH"} | ${gate}</small>
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
      <button class="secondary" onclick="openPaperTrade('${s.symbol}')">Manual Paper Entry</button>
      <button class="secondary" onclick="runAutoPaper()">Run Auto Paper</button>
      <button class="secondary" onclick="checkOptions('${s.symbol}')">Check Options Reality</button>
      <button class="secondary" onclick="document.getElementById('chartPanel').scrollIntoView({behavior:'smooth'})">View Chart</button>
    </div>

    <h4>Paper Trade Rule Gate</h4>
    <div class="snapshot-list">
      ${rules.checks
        .map(
          (c) =>
            `<div class="snapshot-item">
              <strong>${c.name}</strong>
              <span>${c.pass ? "PASS" : "BLOCK"} ${c.label}</span>
            </div>`
        )
        .join("")}
    </div>

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

    const bars = data.bars || selected.bars || [];
    drawChart(selected, bars, data.source || selected.source || "public data");
  } catch (e) {
    const fallbackBars = selected.bars || [];
    drawChart(selected, fallbackBars, selected.source || "public data");

    if ($("chartMeta")) {
      $("chartMeta").textContent = `${shortSymbol(selected.symbol)} | fallback chart | ${e.message}`;
    }
  }
}

function getTradesForSymbol(symbol) {
  return paperTradesCache.filter(
    (t) => t.symbol === symbol || shortSymbol(t.symbol) === shortSymbol(symbol)
  );
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

  const bars = (incomingBars || s.bars || []).slice(-160);

  if (!bars.length) {
    ctx.fillStyle = "#8fa4bc";
    ctx.font = "16px sans-serif";
    ctx.fillText("No bars available", 30, 40);
    return;
  }

  const tradeLevels = getTradesForSymbol(s.symbol).flatMap((t) =>
    [Number(t.entry), Number(t.exit), Number(t.stop), Number(t.target)].filter(Number.isFinite)
  );

  const highs = bars.map((b) => Number(b.high)).filter(Number.isFinite);
  const lows = bars.map((b) => Number(b.low)).filter(Number.isFinite);

  const max = Math.max(...highs, Number(s.target1 || 0), ...tradeLevels);
  const min = Math.min(...lows, Number(s.stopLoss || Infinity), ...tradeLevels);

  const leftPad = 62;
  const rightPad = 26;
  const topPad = 28;
  const bottomPad = 46;
  const chartH = H - topPad - bottomPad;
  const chartW = W - leftPad - rightPad;

  const y = (v) => topPad + ((max - v) / Math.max(max - min, 0.01)) * chartH;
  const x = (i) => leftPad + i * (chartW / Math.max(1, bars.length - 1));

  window.chartScale = {
    priceToY(price) {
      return y(price);
    }
  };

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

    ctx.fillRect(
      xx - bw / 2,
      Math.min(open, close),
      bw,
      Math.max(2, Math.abs(close - open))
    );
  });

  function line(val, color, label) {
    if (!Number.isFinite(Number(val))) return;

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

    if (Number.isFinite(Number(t.exit))) {
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
      `${shortSymbol(s.symbol)} | ${bars.length} bars | ${currentRange} / ${currentInterval} | Entry, stop, target and paper trades`;
  }
}

async function runScan(mode = "scan") {
  try {
    toast("Running ASX scan...");

    const sector = $("sector") ? $("sector").value : "";
    const symbols = $("symbols") ? $("symbols").value : "";

    const data = await getJson(
      endpoint(
        mode === "discover" ? "/api/discover" : mode === "day" ? "/api/day-scan" : "/api/scan",
        {
          symbols,
          sector,
          scanLimit: 160,
          limit: 100
        }
      )
    );

    selectedSignal = null;
    renderSignals(data);

    toast("ASX scan complete");
  } catch (e) {
    toast(e.message);
    if ($("meta")) $("meta").textContent = "Scan failed: " + e.message;
  }
}

async function runAutoPaper() {
  try {
    toast("Running auto paper trader...");

    const response = await fetch("/api/paper/auto", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sector: $("sector") ? $("sector").value : "",
        symbols: $("symbols") ? $("symbols").value : "",
        scanLimit: 160,
        maxEntries: 2
      })
    });

    const data = await response.json();

    if (!response.ok || data.ok === false) {
      throw new Error(data.error || "Auto paper failed");
    }

    toast(`Auto paper complete. Opened ${data.openedCount} trades.`);

    await loadPaper();

    if (selectedSignal) {
      await loadChart(selectedSignal.symbol);
    }

    if ($("backtestOutput")) {
      $("backtestOutput").textContent = JSON.stringify(
        {
          mode: data.mode,
          openedCount: data.openedCount,
          blockedCount: data.blockedCount,
          rules: data.rules,
          opened: data.opened,
          blocked: data.blocked,
          topCandidates: data.topCandidates
        },
        null,
        2
      );
    }
  } catch (e) {
    toast(e.message);
  }
}

async function openPaperTrade(symbol) {
  const s = lastSignals.find((x) => x.symbol === symbol);
  if (!s) return;

  const rules = paperRuleStatus(s);

  if (!rules.allowed) {
    const failed = rules.checks
      .filter((c) => !c.pass)
      .map((c) => `${c.name}: ${c.label}`)
      .join(", ");

    toast(`Trade blocked by rules: ${failed}`);
    return;
  }

  const shares = Math.max(1, Math.floor(500 / Math.max(Number(s.price || 1), 1)));

  try {
    const response = await fetch("/api/paper/open", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        symbol,
        side: "long",
        entry: s.price,
        shares,
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
      throw new Error(json.error || "Paper entry failed");
    }

    toast(`Paper trade opened for ${shortSymbol(symbol)}`);

    await loadPaper();

    if (selectedSignal) {
      await loadChart(selectedSignal.symbol);
    }
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

async function loadPaper() {
  try {
    const [stats, trades] = await Promise.all([
      getJson("/api/paper/stats"),
      getJson("/api/paper/trades")
    ]);

    const st = stats.stats || {};
    const rows = (trades.trades || []).slice(0, 40);
    paperTradesCache = rows;

    const openCount = rows.filter((t) => t.status === "open").length;

    if ($("paperStats")) {
      $("paperStats").innerHTML = `<div class="paper-summary">
        <div class="small-metric"><span>Open trades</span><strong>${openCount}</strong></div>
        <div class="small-metric"><span>Closed trades</span><strong>${st.closedTrades || 0}</strong></div>
        <div class="small-metric"><span>Win rate</span><strong>${num(st.winRate)}%</strong></div>
        <div class="small-metric"><span>Net P/L</span><strong>${money(st.netPnl || 0)}</strong></div>
      </div>

      <div class="paper-trades">
        ${
          rows
            .map(
              (t) => `<div class="paper-trade">
                <div class="paper-trade-head">
                  <strong>${shortSymbol(t.symbol)} ${String(t.status).toUpperCase()}</strong>
                  <small>${t.setup || "manual"} | R:R ${num(t.riskReward)}</small>
                </div>

                <small>Entry ${money(t.entry)} | Shares ${t.shares} | Stop ${money(t.stop)} | Target ${money(t.target)}</small>

                ${
                  t.status === "open"
                    ? `<div class="paper-close-row">
                        <input id="close-${t.id}" type="number" step="0.01" value="${t.entry}">
                        <button class="mini" onclick="closePaperTrade('${t.id}')">Close</button>
                      </div>`
                    : `<small>Exit ${money(t.exit)} | P/L ${money(t.pnl)} (${num(t.pnlPct)}%)</small>`
                }
              </div>`
            )
            .join("") ||
          `<div class="paper-trade">
            <strong>No paper trades yet</strong>
            <small>Run Auto Paper or select an ASX signal that passes the rule gate.</small>
          </div>`
        }
      </div>`;
    }

    if (selectedSignal) {
      drawChart(selectedSignal, selectedSignal.bars || [], selectedSignal.source || "public data");
    }
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
      headers: {
        "content-type": "application/json"
      },
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

    toast("Paper trade closed");

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

function setupTimeframeButtons() {
  document.querySelectorAll(".tf").forEach((btn) => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll(".tf").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      currentRange = btn.dataset.range || "1y";
      currentInterval = btn.dataset.interval || "1d";

      if (selectedSignal) {
        await loadChart(selectedSignal.symbol);
      } else if (window.selectedTicker) {
        await loadChart(window.selectedTicker);
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
        scan: "scanPanel",
        chart: "chartPanel",
        paper: "paperPanel",
        journal: "paperPanel",
        performance: "paperPanel",
        settings: "settingsPanel",
        backtest: "healthPanel",
        regime: "sectorsPanel",
        sectors: "sectorsPanel",
        risk: "paperPanel",
        health: "healthPanel"
      };

      const id = map[mode] || "chartPanel";
      const el = $(id);

      if (el) {
        el.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      }

      if (["paper", "journal", "performance", "risk"].includes(mode)) loadPaper();
      if (mode === "health") loadHealth();
    })
  );
}

window.openPaperTrade = openPaperTrade;
window.runAutoPaper = runAutoPaper;
window.checkOptions = checkOptions;
window.closePaperTrade = closePaperTrade;

if ($("scanBtn")) $("scanBtn").addEventListener("click", () => runScan("scan"));
if ($("refreshBtn")) $("refreshBtn").addEventListener("click", () => runScan("scan"));
if ($("topRefreshBtn")) $("topRefreshBtn").addEventListener("click", () => runScan("scan"));

if ($("discoverBtn")) $("discoverBtn").addEventListener("click", () => runScan("discover"));
if ($("dayBtn")) $("dayBtn").addEventListener("click", () => runScan("day"));

if ($("paperBtn")) $("paperBtn").addEventListener("click", loadPaper);
if ($("autoPaperBtn")) $("autoPaperBtn").addEventListener("click", runAutoPaper);
if ($("topAutoPaperBtn")) $("topAutoPaperBtn").addEventListener("click", runAutoPaper);
if ($("paperPanelAutoBtn")) $("paperPanelAutoBtn").addEventListener("click", runAutoPaper);

if ($("runBacktest")) $("runBacktest").addEventListener("click", runBacktest);

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
