const express = require("express");
const path = require("path");
const fs = require("fs");
const { createArrayStore } = require("./lib/array-store.cjs");

const app = express();
const PORT = process.env.PORT || 10000;
const VERSION = "stock-learner-v14-reliability-learning";

const publicPath = path.join(__dirname, "public");
const dataPath = path.resolve(process.env.STOCK_DATA_DIR || path.join(__dirname, "data"));
const tradesPath = path.join(dataPath, "paper-trades.json");
const tradeStore = createArrayStore(tradesPath, rows => rows.every(t =>
  t && typeof t.id === "string" && typeof t.symbol === "string" &&
  ["open", "closed"].includes(t.status) && Number.isFinite(t.entry) && t.entry > 0 &&
  Number.isInteger(t.shares) && t.shares > 0 &&
  (t.status !== "closed" || (Number.isFinite(t.exit) && t.exit > 0))
) && new Set(rows.map(t => t.id)).size === rows.length);
const learning = require("./lib/learning.cjs");
const observationStore = createArrayStore(path.join(dataPath, "signal-observations.json"), rows =>
  rows.every(row => row && typeof row.id === "string" && typeof row.symbol === "string" &&
    typeof row.strategyVersion === "string" && Number.isFinite(row.score) && row.costModel &&
    row.outcomes && typeof row.outcomes === "object") && new Set(rows.map(row => row.id)).size === rows.length);

app.use(express.json({ limit: "1mb" }));
app.use("/api", (req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

const ASX_CONFIG = {
  market: "ASX",
  timezone: "Australia/Sydney",
  currency: "AUD",
  open: "10:00",
  close: "16:00",
  dataMode: "near_live_public_chart_data",
  dataDelay:
    "Yahoo public ASX chart data may be delayed and is not licensed exchange real-time data. 1-minute bars are used where available, but this app does not claim official live ASX data.",
  yahooSuffix: ".AX"
};

const PAPER_ACCOUNT = {
  startingBalance: 5000,
  currency: "AUD",
  brokerFeePerTrade: 9.5
};

const PAPER_RULES = {
  enabled: true,
  minScore: 80,
  minRiskReward: 1.8,
  maxOpenTrades: 5,
  maxAutoEntriesPerRun: 2,
  minTradeValue: 500,
  maxTradeValue: 1000,
  riskDollars: 50,
  allowShorts: false,
  requireBullishTrend: true,
  requireNearBuyZone: true,
  maxDistanceAboveBuyZonePct: 1.75
};

const DEFAULT_ASX_SYMBOLS = [
  "CBA.AX", "BHP.AX", "CSL.AX", "NAB.AX", "WBC.AX", "ANZ.AX", "MQG.AX", "WES.AX", "WOW.AX", "TLS.AX",
  "RIO.AX", "FMG.AX", "WDS.AX", "GMG.AX", "ALL.AX", "QBE.AX", "SUN.AX", "XRO.AX", "REA.AX", "CAR.AX",
  "RMD.AX", "CPU.AX", "ASX.AX", "COL.AX", "TCL.AX", "BXB.AX", "S32.AX", "NST.AX", "NEM.AX", "ORG.AX",
  "STO.AX", "MIN.AX", "WTC.AX", "PME.AX", "SHL.AX", "COH.AX", "FPH.AX", "SEK.AX", "TWE.AX", "JHX.AX",
  "A2M.AX", "ALD.AX", "ALQ.AX", "ALU.AX", "AMC.AX", "APA.AX", "ARB.AX", "BEN.AX", "BOQ.AX", "BPT.AX",
  "BRG.AX", "BSL.AX", "CHC.AX", "DMP.AX", "EDV.AX", "EVN.AX", "FLT.AX", "GQG.AX", "IEL.AX", "IGO.AX",
  "ILU.AX", "JBH.AX", "LYC.AX", "MPL.AX", "NXT.AX", "ORI.AX", "PLS.AX", "RHC.AX", "SOL.AX", "TPG.AX",
  "VCX.AX", "VEA.AX", "WHC.AX", "WOR.AX", "YAL.AX", "ZIP.AX", "QAN.AX", "MGR.AX", "LLC.AX", "SGR.AX"
];

const ASX_DISCOVERY_UNIVERSE = uniqueArray([
  ...DEFAULT_ASX_SYMBOLS,
  "ABC.AX", "AMP.AX", "ARG.AX", "AWC.AX", "AZJ.AX", "BWP.AX", "CGF.AX", "CNU.AX", "DOW.AX", "HVN.AX",
  "IPL.AX", "MFG.AX", "NEC.AX", "ORA.AX", "PRU.AX", "SDF.AX", "SGM.AX", "SGP.AX", "TAH.AX", "VOC.AX",
  "VUK.AX"
]);

const ASX_SECTORS = {
  banks: ["CBA.AX", "NAB.AX", "WBC.AX", "ANZ.AX", "MQG.AX", "BEN.AX", "BOQ.AX"],
  miners: ["BHP.AX", "RIO.AX", "FMG.AX", "S32.AX", "NST.AX", "NEM.AX", "MIN.AX", "IGO.AX", "LYC.AX", "PLS.AX"],
  energy: ["WDS.AX", "STO.AX", "ORG.AX", "BPT.AX", "VEA.AX", "WHC.AX", "YAL.AX"],
  healthcare: ["CSL.AX", "RMD.AX", "SHL.AX", "COH.AX", "FPH.AX", "PME.AX", "RHC.AX"],
  tech: ["XRO.AX", "WTC.AX", "ALU.AX", "NXT.AX", "SEK.AX", "CPU.AX", "ZIP.AX"],
  staples: ["WOW.AX", "COL.AX", "WES.AX", "A2M.AX", "TWE.AX", "EDV.AX"],
  industrials: ["TCL.AX", "BXB.AX", "QAN.AX", "AZJ.AX", "DOW.AX", "WOR.AX", "JHX.AX"]
};

const chartCache = new Map();

function normalizeAsxSymbol(value) {
  let s = String(value || "").trim().toUpperCase();
  if (!s) return "";
  s = s.replace(/\s+/g, "");
  if (!s.includes(".") && /^[A-Z0-9]{2,6}$/.test(s)) s += ".AX";
  return s;
}

function uniqueArray(values) {
  const seen = new Set();
  const out = [];

  for (const value of values) {
    const clean = normalizeAsxSymbol(value);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }

  return out;
}

function uniqueSymbols(input) {
  if (Array.isArray(input)) return uniqueArray(input);
  return uniqueArray(String(input || "").split(","));
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const p = Math.pow(10, decimals);
  return Math.round(n * p) / p;
}

function average(values) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return null;
  return clean.reduce((a, b) => a + b, 0) / clean.length;
}

function sma(values, length) {
  if (!Array.isArray(values) || values.length < length) return null;
  return average(values.slice(values.length - length));
}

function ema(values, length) {
  if (!Array.isArray(values) || values.length < length) return null;

  const k = 2 / (length + 1);
  let result = average(values.slice(0, length));

  for (let i = length; i < values.length; i++) {
    result = values[i] * k + result * (1 - k);
  }

  return result;
}

function rsi(values, length = 14) {
  if (!Array.isArray(values) || values.length < length + 1) return null;

  let gains = 0;
  let losses = 0;

  for (let i = values.length - length; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }

  if (losses === 0) return 100;

  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function calcAtr(bars, length = 14) {
  if (!Array.isArray(bars) || bars.length < length + 1) return null;

  const values = [];

  for (let i = bars.length - length; i < bars.length; i++) {
    const current = bars[i];
    const previous = bars[i - 1];

    const tr = Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close)
    );

    if (Number.isFinite(tr)) values.push(tr);
  }

  return average(values);
}

function percentChange(values, lookback) {
  if (!Array.isArray(values) || values.length <= lookback) return null;

  const current = values[values.length - 1];
  const past = values[values.length - 1 - lookback];

  if (!Number.isFinite(current) || !Number.isFinite(past) || past === 0) return null;

  return ((current - past) / past) * 100;
}

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function scoreRange(value, low, high, maxPoints) {
  if (!Number.isFinite(value)) return 0;
  if (value <= low) return 0;
  if (value >= high) return maxPoints;
  return ((value - low) / (high - low)) * maxPoints;
}

function calcRiskReward(entry, stop, target) {
  entry = Number(entry);
  stop = Number(stop);
  target = Number(target);

  if (!Number.isFinite(entry) || !Number.isFinite(stop) || !Number.isFinite(target)) return 0;
  if (entry <= 0 || stop <= 0 || target <= 0) return 0;

  const risk = entry - stop;
  const reward = target - entry;

  if (risk <= 0 || reward <= 0) return 0;

  const rr = reward / risk;
  if (!Number.isFinite(rr) || rr <= 0 || rr > 20) return 0;

  return rr;
}

function safeDate(timestamp, interval) {
  if (!timestamp) return null;

  const d = new Date(timestamp * 1000);
  if (Number.isNaN(d.getTime())) return null;

  return String(interval).includes("m") || String(interval).includes("h")
    ? d.toISOString()
    : learning.sydneyDate(d);
}

function cacheTtl(interval, range) {
  if (range === "10y") return 30 * 60 * 1000;
  if (String(interval).includes("m") || String(interval).includes("h")) return 45 * 1000;
  return 4 * 60 * 1000;
}

function getCache(key, ttlMs) {
  const hit = chartCache.get(key);
  if (!hit) return null;

  if (Date.now() - hit.time > ttlMs) {
    chartCache.delete(key);
    return null;
  }

  return hit.value;
}

function setCache(key, value) {
  chartCache.set(key, { time: Date.now(), value });

  if (chartCache.size > 1500) {
    chartCache.delete(chartCache.keys().next().value);
  }
}

async function fetchText(url, timeoutMs = 16000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 TradingMintASX/1.0",
        Accept: "application/json,text/plain,*/*"
      }
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error("HTTP " + response.status + " from " + url);
    }

    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function yahooChart(symbol, range = "1y", interval = "1d") {
  const cleanSymbol = normalizeAsxSymbol(symbol);

  const url =
    "https://query1.finance.yahoo.com/v8/finance/chart/" +
    encodeURIComponent(cleanSymbol) +
    "?range=" +
    encodeURIComponent(range) +
    "&interval=" +
    encodeURIComponent(interval) +
    "&includePrePost=false";

  const text = await fetchText(url);

  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error("Yahoo returned non JSON for " + cleanSymbol);
  }

  const result = data && data.chart && Array.isArray(data.chart.result) && data.chart.result[0];

  if (!result) {
    const err = data && data.chart && data.chart.error && data.chart.error.description;
    throw new Error(err || "No Yahoo chart result for " + cleanSymbol);
  }

  const timestamps = Array.isArray(result.timestamp) ? result.timestamp : [];
  const quote = result.indicators && result.indicators.quote && result.indicators.quote[0];

  if (!quote || !timestamps.length) {
    throw new Error("No Yahoo quote data for " + cleanSymbol);
  }

  const adjclose =
    result.indicators &&
    result.indicators.adjclose &&
    result.indicators.adjclose[0] &&
    result.indicators.adjclose[0].adjclose;

  const bars = [];

  for (let i = 0; i < timestamps.length; i++) {
    const open = toNumber(quote.open && quote.open[i]);
    const high = toNumber(quote.high && quote.high[i]);
    const low = toNumber(quote.low && quote.low[i]);
    const closeRaw = toNumber(quote.close && quote.close[i]);
    const closeAdj = toNumber(adjclose && adjclose[i]);
    const close = closeRaw !== null ? closeRaw : closeAdj;
    const volume = toNumber(quote.volume && quote.volume[i]);

    if (
      Number.isFinite(open) &&
      Number.isFinite(high) &&
      Number.isFinite(low) &&
      Number.isFinite(close) &&
      open > 0 &&
      high > 0 &&
      low > 0 &&
      close > 0 &&
      high >= low &&
      high >= open &&
      high >= close &&
      low <= open &&
      low <= close
    ) {
      bars.push({
        date: safeDate(timestamps[i], interval),
        open: round(open, 4),
        high: round(high, 4),
        low: round(low, 4),
        close: round(close, 4),
        volume: volume || 0
      });
    }
  }

  const minBars = String(interval).includes("m") || String(interval).includes("h") ? 2 : 35;

  if (bars.length < minBars) {
    throw new Error("Yahoo returned too few valid bars for " + cleanSymbol);
  }

  return bars;
}

function validateBarsForAnalysis(symbol, bars) {
  if (!Array.isArray(bars) || bars.length < 35) {
    throw new Error(symbol + " has too few valid bars for analysis.");
  }

  const last = bars[bars.length - 1];

  if (!last || !Number.isFinite(Number(last.close)) || Number(last.close) <= 0) {
    throw new Error(symbol + " has invalid latest price.");
  }

  const bad = bars.filter((b) => {
    return (
      !b ||
      !Number.isFinite(Number(b.open)) ||
      !Number.isFinite(Number(b.high)) ||
      !Number.isFinite(Number(b.low)) ||
      !Number.isFinite(Number(b.close)) ||
      Number(b.open) <= 0 ||
      Number(b.high) <= 0 ||
      Number(b.low) <= 0 ||
      Number(b.close) <= 0 ||
      Number(b.high) < Number(b.low) ||
      Number(b.high) < Number(b.open) ||
      Number(b.high) < Number(b.close) ||
      Number(b.low) > Number(b.open) ||
      Number(b.low) > Number(b.close)
    );
  });

  if (bad.length > 0) {
    throw new Error(symbol + " contains invalid zero/blank OHLC bars.");
  }

  return true;
}

async function getBars(symbol, range = "1y", interval = "1d") {
  const cleanSymbol = normalizeAsxSymbol(symbol);

  if (!cleanSymbol.endsWith(".AX")) {
    throw new Error("Only ASX Yahoo symbols are allowed, for example CBA.AX or CBA");
  }

  const key = cleanSymbol + "|" + range + "|" + interval;
  const cached = getCache(key, cacheTtl(interval, range));

  if (cached) return cached;

  const bars = await yahooChart(cleanSymbol, range, interval);
  validateBarsForAnalysis(cleanSymbol, bars);

  const result = {
    source: "Yahoo Finance public chart endpoint",
    symbol: cleanSymbol,
    range,
    interval,
    bars,
    dataReality: ASX_CONFIG.dataDelay
  };

  setCache(key, result);

  return result;
}

function evaluateSignalForPaperTrade(signal) {
  const score = Number(signal.score || 0);
  const rr = Number(signal.riskReward || 0);
  const price = Number(signal.price || 0);
  const buyZoneHigh = Number(signal.buyZoneHigh || 0);
  const distance = Number(signal.distanceToBuyZonePct || 0);
  const change5 = Number(signal.change5dPct || 0);
  const change20 = Number(signal.change20dPct || 0);

  const checks = [
    {
      name: "Score",
      pass: score >= PAPER_RULES.minScore,
      actual: score,
      required: PAPER_RULES.minScore
    },
    {
      name: "Risk reward",
      pass: rr >= PAPER_RULES.minRiskReward,
      actual: round(rr, 2),
      required: PAPER_RULES.minRiskReward
    },
    {
      name: "Trend",
      pass: !PAPER_RULES.requireBullishTrend || (change5 >= 0 && change20 >= 0),
      actual: `${round(change5, 2)}% / ${round(change20, 2)}%`,
      required: "5D and 20D not negative"
    },
    {
      name: "Buy zone distance",
      pass:
        !PAPER_RULES.requireNearBuyZone ||
        !Number.isFinite(distance) ||
        distance <= PAPER_RULES.maxDistanceAboveBuyZonePct,
      actual: round(distance, 2),
      required: "<= " + PAPER_RULES.maxDistanceAboveBuyZonePct + "%"
    },
    {
      name: "Valid prices",
      pass: price > 0 && buyZoneHigh > 0,
      actual: price,
      required: "> 0"
    }
  ];

  return {
    allowed: checks.every((c) => c.pass),
    checks
  };
}

function analyzeSymbol(symbol, bars, marketContext = { market: "Unknown" }, source = "unknown") {
  validateBarsForAnalysis(symbol, bars);

  const closes = bars.map((b) => b.close).filter(Number.isFinite);
  const volumes = bars.map((b) => b.volume || 0).filter(Number.isFinite);

  const last = bars[bars.length - 1];
  const previous = bars[bars.length - 2];

  const price = Number(last.close);

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(symbol + " invalid latest price.");
  }

  const previousClose = previous ? previous.close : null;

  const ema5 = ema(closes, 5);
  const ema10 = ema(closes, 10);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const ema200 = ema(closes, 200);

  const rsi14 = rsi(closes, 14);
  const atr14 = calcAtr(bars, 14);

  const avgVol20 = sma(volumes, 20);
  const avgDollarVolume20 = avgVol20 && price ? avgVol20 * price : null;
  const volumeRatio = avgVol20 && last.volume ? last.volume / avgVol20 : null;

  const recent20 = bars.slice(-20);
  const recent10 = bars.slice(-10);

  const high20 = Math.max(...recent20.map((b) => b.high));
  const low20 = Math.min(...recent20.map((b) => b.low));
  const low10 = Math.min(...recent10.map((b) => b.low));

  const range20 = high20 - low20;
  const rangePosition20 = range20 > 0 ? ((price - low20) / range20) * 100 : null;

  const changePercent =
    Number.isFinite(previousClose) && previousClose > 0
      ? ((price - previousClose) / previousClose) * 100
      : null;

  const change5dPct = percentChange(closes, 5);
  const change10dPct = percentChange(closes, 10);
  const change20dPct = percentChange(closes, 20);

  const atrPct = atr14 && price ? (atr14 / price) * 100 : null;
  const distanceFromEma20Pct = ema20 && price ? ((price - ema20) / ema20) * 100 : null;
  const ema5Vs20Pct = ema5 && ema20 ? ((ema5 - ema20) / ema20) * 100 : null;

  const scoreParts = [];
  const reasons = [];
  const warnings = [];

  function add(name, points, reason, warning) {
    const clean = clamp(points, 0, 100);

    scoreParts.push({
      name,
      points: round(clean, 1)
    });

    if (clean > 0 && reason) reasons.push(reason);
    if (clean <= 0 && warning) warnings.push(warning);
  }

  add("trendPrice", price > ema20 ? 8 : 0, "Price is above EMA20.", "Price is below EMA20.");

  add(
    "trendStack",
    ema20 && ema50 && ema200 && ema20 > ema50 && ema50 > ema200
      ? 10
      : ema20 && ema50 && ema20 > ema50
      ? 6
      : 0,
    "Moving averages are aligned bullishly.",
    "Moving averages are not fully aligned."
  );

  add("longTrend", ema200 && price > ema200 ? 6 : 0, "Price is above EMA200.", "Price is below EMA200 or EMA200 is unavailable.");
  add("recent5dMomentum", scoreRange(change5dPct, -1.5, 3.0, 14), "Recent 5 day price momentum is improving.", "Recent 5 day momentum is weak.");
  add("recent20dMomentum", scoreRange(change20dPct, -4.0, 8.0, 12), "Recent 20 day price momentum supports the setup.", "Recent 20 day momentum is weak.");
  add("rangePosition", scoreRange(rangePosition20, 35, 90, 10), "Price is in the stronger part of its 20 day range.", "Price is in the lower part of its 20 day range.");

  add(
    "rsi",
    rsi14 && rsi14 >= 48 && rsi14 <= 68
      ? 10
      : rsi14 && rsi14 > 68 && rsi14 <= 76
      ? 5
      : rsi14 && rsi14 >= 42 && rsi14 < 48
      ? 4
      : 0,
    "RSI supports momentum without being too stretched.",
    "RSI is not in the ideal swing zone."
  );

  add(
    "volume",
    volumeRatio && volumeRatio >= 1.5
      ? 9
      : volumeRatio && volumeRatio >= 1.1
      ? 6
      : volumeRatio && volumeRatio >= 0.8
      ? 3
      : 0,
    "Volume is confirming the move.",
    "Volume is not confirming the move."
  );

  add(
    "liquidity",
    avgDollarVolume20 && avgDollarVolume20 >= 20000000
      ? 8
      : avgDollarVolume20 && avgDollarVolume20 >= 5000000
      ? 4
      : 0,
    "ASX liquidity is acceptable to strong based on 20 day dollar volume.",
    "Liquidity may be thin for active trading."
  );

  add("nearBreakout", price >= high20 * 0.99 ? 7 : price >= high20 * 0.965 ? 4 : 0, "Price is near a recent breakout area.", "Price is not near a breakout area.");
  add("oneDayMove", changePercent && changePercent > 1 ? 4 : changePercent && changePercent > 0 ? 2 : 0, "Latest candle is positive.", "Latest candle is not positive.");
  add("acceleration", ema5Vs20Pct && ema5Vs20Pct > 0.6 ? 5 : ema5Vs20Pct && ema5Vs20Pct > 0 ? 3 : 0, "Short trend is accelerating above EMA20.", "Short trend is not accelerating.");
  add("marketRegime", marketContext.market === "Bullish" ? 5 : marketContext.market === "Neutral" ? 2 : 0, "ASX market regime is supportive.", "ASX market regime is not supportive.");

  if (rsi14 && rsi14 > 76) warnings.push("RSI is hot. Do not chase.");
  if (distanceFromEma20Pct && distanceFromEma20Pct > 7) warnings.push("Price is extended above EMA20. Wait for a pullback or confirmation.");
  if (atrPct && atrPct > 5) warnings.push("ATR is high for ASX swing trading. Reduce size or wait for cleaner structure.");

  let score = scoreParts.reduce((sum, part) => sum + Number(part.points || 0), 0);
  score = Math.max(0, Math.min(100, Math.round(score)));

  const atr = atr14 || price * 0.025;

  let buyZoneHigh = Math.min(
    price * 1.002,
    Math.max(price - atr * 0.12, ema10 || price - atr * 0.12)
  );

  let buyZoneLow = Math.min(
    buyZoneHigh,
    Math.max(price - atr * 0.95, ema20 || price - atr * 0.95)
  );

  if (!Number.isFinite(buyZoneHigh) || buyZoneHigh <= 0) buyZoneHigh = price;
  if (!Number.isFinite(buyZoneLow) || buyZoneLow <= 0) buyZoneLow = price - atr;
  if (buyZoneLow > buyZoneHigh) [buyZoneLow, buyZoneHigh] = [buyZoneHigh, buyZoneLow];

  let stop = Math.min(buyZoneLow - atr * 0.35, low10 - atr * 0.12);

  if (!Number.isFinite(stop) || stop <= 0 || stop >= price) {
    stop = price - atr * 1.55;
  }

  let target1 = Math.max(
    high20 + atr * 0.75,
    price + atr * 2.75,
    price + (price - stop) * 1.9
  );

  let target2 = Math.max(
    target1 + atr,
    price + atr * 4.0,
    price + (price - stop) * 2.8
  );

  if (!Number.isFinite(target1) || target1 <= price) target1 = price + atr * 2.75;
  if (!Number.isFinite(target2) || target2 <= target1) target2 = price + atr * 4.0;

  const riskReward = calcRiskReward(price, stop, target1);

  const inBuyZone = price >= buyZoneLow && price <= buyZoneHigh * 1.008;

  const distanceToZone =
    price > buyZoneHigh
      ? ((price - buyZoneHigh) / buyZoneHigh) * 100
      : price < buyZoneLow
      ? -((buyZoneLow - price) / buyZoneLow) * 100
      : 0;

  let decision = "WATCH";
  let setup = "Watch";

  if (score >= PAPER_RULES.minScore && riskReward >= PAPER_RULES.minRiskReward && inBuyZone && price > (ema20 || 0)) {
    decision = "AUTO_PAPER_READY";
    setup = "ASX Swing Entry";
  } else if (score >= 68 && price > (ema20 || 0) && distanceToZone > 1.5) {
    decision = "WAIT_FOR_PULLBACK";
    setup = "ASX Pullback";
  } else if (score >= 58 && price >= high20 * 0.965) {
    decision = "BREAKOUT_WATCH";
    setup = "ASX Breakout Watch";
  }

  const trigger = Math.max(price, buyZoneHigh, high20);
  const tightStop = Math.min(low10, price - atr * 0.75);
  const dayTarget = Math.max(price * 1.006, price + atr * 0.85);
  const dayRiskReward = calcRiskReward(price, tightStop, dayTarget);

  return {
    symbol,
    market: "ASX",
    currency: "AUD",
    decision,
    setup,
    score,
    rankScore: score,
    price: round(price),
    priceAsOf: last.date,
    changePercent: round(changePercent, 2),
    change5dPct: round(change5dPct, 2),
    change10dPct: round(change10dPct, 2),
    change20dPct: round(change20dPct, 2),
    rangePosition20: round(rangePosition20, 1),
    distanceFromEma20Pct: round(distanceFromEma20Pct, 2),
    buyZoneLow: round(buyZoneLow),
    buyZoneHigh: round(buyZoneHigh),
    stopLoss: round(stop),
    target1: round(target1),
    target2: round(target2),
    riskReward: round(riskReward, 2),
    support: round(low20),
    resistance: round(high20),
    trigger: round(trigger),
    tightStop: round(tightStop),
    dayTarget: round(dayTarget),
    dayRiskReward: round(dayRiskReward, 2),
    distanceToBuyZonePct: round(distanceToZone, 2),
    avgDollarVolume20: round(avgDollarVolume20, 0),
    summary:
      decision === "AUTO_PAPER_READY"
        ? symbol + " passes the automatic ASX paper-trading rules."
        : decision === "WAIT_FOR_PULLBACK"
        ? symbol + " is strong but should not be chased. Wait for the buy zone."
        : decision === "BREAKOUT_WATCH"
        ? symbol + " is near a breakout area. Wait for confirmation."
        : symbol + " is a watchlist candidate only.",
    actionPlan:
      "ASX share scanner only. Use paper trading first. Options are not fabricated by this app.",
    reasons,
    warnings,
    scoreParts,
    source,
    dataReality: ASX_CONFIG.dataDelay,
    paperRules: evaluateSignalForPaperTrade({
      score,
      riskReward,
      price,
      buyZoneLow,
      buyZoneHigh,
      distanceToBuyZonePct: distanceToZone,
      change5dPct,
      change20dPct,
      decision
    }),
    indicators: {
      ema5: round(ema5),
      ema10: round(ema10),
      ema20: round(ema20),
      ema50: round(ema50),
      ema200: round(ema200),
      rsi14: round(rsi14),
      atr14: round(atr14),
      atrPct: round(atrPct, 2),
      volumeRatio: round(volumeRatio, 2)
    },
    bars
  };
}

function analyzeIntradaySymbol(symbol, bars, source) {
  validateBarsForAnalysis(symbol, bars);

  const closes = bars.map((b) => b.close).filter(Number.isFinite);
  const last = bars[bars.length - 1];
  const previous = bars[bars.length - 2];

  const price = Number(last.close);

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(symbol + " invalid latest intraday price.");
  }

  const previousClose = previous ? previous.close : null;

  const ema8 = ema(closes, 8);
  const ema21 = ema(closes, 21);
  const rsi14 = rsi(closes, 14);
  const atr14 = calcAtr(bars, 14) || price * 0.006;

  const recent = bars.slice(-12);
  const recentHigh = Math.max(...recent.map((b) => b.high));
  const recentLow = Math.min(...recent.map((b) => b.low));

  const changePercent =
    Number.isFinite(previousClose) && previousClose > 0
      ? ((price - previousClose) / previousClose) * 100
      : null;

  let score = 0;
  const reasons = [];
  const warnings = [];

  if (ema8 && price > ema8) {
    score += 25;
    reasons.push("Price is above short EMA.");
  }

  if (ema8 && ema21 && ema8 > ema21) {
    score += 20;
    reasons.push("Short EMA is above medium EMA.");
  }

  if (rsi14 && rsi14 >= 50 && rsi14 <= 74) {
    score += 18;
    reasons.push("RSI supports intraday momentum.");
  } else if (rsi14 && rsi14 > 78) {
    score += 5;
    warnings.push("Intraday RSI is hot.");
  }

  if (price >= recentHigh * 0.995) {
    score += 20;
    reasons.push("Price is near intraday breakout area.");
  }

  if (changePercent && changePercent > 0) {
    score += 10;
    reasons.push("Price is moving up this interval.");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const trigger = Math.max(price, recentHigh);
  const tightStop = Math.min(recentLow, price - atr14 * 0.85);
  const dayTarget = Math.max(price + atr14 * 1.5, trigger + atr14 * 1.1);
  const dayRiskReward = calcRiskReward(price, tightStop, dayTarget);

  const decision = score >= 70 && dayRiskReward >= 1.3 ? "DAY_PAPER_WATCH" : "DAY_WATCH";

  return {
    symbol,
    market: "ASX",
    currency: "AUD",
    decision,
    setup: "ASX Intraday Momentum",
    score,
    rankScore: score,
    price: round(price),
    changePercent: round(changePercent, 2),
    trigger: round(trigger),
    tightStop: round(tightStop),
    stopLoss: round(tightStop),
    dayTarget: round(dayTarget),
    target1: round(dayTarget),
    riskReward: round(dayRiskReward, 2),
    dayRiskReward: round(dayRiskReward, 2),
    summary:
      decision === "DAY_PAPER_WATCH"
        ? symbol + " has intraday momentum characteristics for paper testing."
        : symbol + " is an intraday watch only.",
    actionPlan: "ASX day paper test only. No averaging down.",
    reasons,
    warnings,
    source,
    dataReality: ASX_CONFIG.dataDelay,
    bars
  };
}

async function buildMarketContext() {
  try {
    const result = await getBars("VAS.AX", "1y", "1d");
    const bars = result.bars;
    const closes = bars.map((b) => b.close);

    const price = closes[closes.length - 1];
    const ema20Value = ema(closes, 20);
    const ema50Value = ema(closes, 50);
    const ema200Value = ema(closes, 200);

    const bullish =
      price > ema20Value &&
      price > ema50Value &&
      price > ema200Value &&
      ema20Value > ema50Value;

    return {
      market: bullish ? "Bullish" : "Neutral",
      benchmark: "VAS.AX",
      source: result.source,
      benchmarkData: {
        price: round(price),
        ema20: round(ema20Value),
        ema50: round(ema50Value),
        ema200: round(ema200Value)
      }
    };
  } catch (error) {
    return {
      market: "Unknown",
      benchmark: "VAS.AX",
      source: "None",
      error: error.message
    };
  }
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let index = 0;

  async function run() {
    while (index < items.length) {
      const current = index++;
      results[current] = await worker(items[current], current);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));

  return results;
}

async function scanSymbols(symbolList, risk) {
  const startedAt = Date.now();
  const marketContext = await buildMarketContext();

  const results = await mapLimit(symbolList, 6, async (symbol) => {
    try {
      const result = await getBars(symbol, "1y", "1d");
      const signal = analyzeSymbol(symbol, result.bars, marketContext, result.source);
      signal.marketRegime = marketContext.market;

      if (!Number.isFinite(Number(signal.price)) || Number(signal.price) <= 0) {
        throw new Error(symbol + " produced invalid zero price after analysis.");
      }

      return {
        ok: true,
        signal
      };
    } catch (error) {
      return {
        ok: false,
        symbol,
        error: error.message
      };
    }
  });

  const signals = [];
  const errors = [];

  for (const item of results) {
    if (item && item.ok) signals.push(item.signal);
    else errors.push({ symbol: item && item.symbol, error: item && item.error });
  }

  signals.sort((a, b) => Number(b.rankScore || 0) - Number(a.rankScore || 0));
  const recorded = recordObservations(signals);

  return {
    ok: true,
    version: VERSION,
    market: "ASX",
    marketRegime: marketContext.market,
    config: ASX_CONFIG,
    paperAccount: PAPER_ACCOUNT,
    paperRules: PAPER_RULES,
    risk: Number(risk || 100),
    requested: symbolList.length,
    count: signals.length,
    elapsedMs: Date.now() - startedAt,
    updatedAt: new Date().toISOString(),
    learning: {recorded, strategyVersion: VERSION},
    signals,
    errors
  };
}

async function dayScanSymbols(symbolList) {
  const startedAt = Date.now();

  const results = await mapLimit(symbolList, 6, async (symbol) => {
    try {
      const result = await getBars(symbol, "1d", "15m");
      const signal = analyzeIntradaySymbol(symbol, result.bars, result.source);

      if (!Number.isFinite(Number(signal.price)) || Number(signal.price) <= 0) {
        throw new Error(symbol + " produced invalid zero intraday price after analysis.");
      }

      return {
        ok: true,
        signal
      };
    } catch (error) {
      return {
        ok: false,
        symbol,
        error: error.message
      };
    }
  });

  const signals = [];
  const errors = [];

  for (const item of results) {
    if (item && item.ok) signals.push(item.signal);
    else errors.push({ symbol: item && item.symbol, error: item && item.error });
  }

  signals.sort(
    (a, b) =>
      Number(b.dayRiskReward || 0) * Number(b.score || 0) -
      Number(a.dayRiskReward || 0) * Number(a.score || 0)
  );

  return {
    ok: true,
    version: VERSION,
    market: "ASX",
    mode: "asx-day-paper-test",
    config: ASX_CONFIG,
    paperAccount: PAPER_ACCOUNT,
    requested: symbolList.length,
    count: signals.length,
    elapsedMs: Date.now() - startedAt,
    updatedAt: new Date().toISOString(),
    signals,
    errors
  };
}

function readTrades() {
  return tradeStore.read();
}

function openTradeCount(trades) {
  return trades.filter((t) => t.status === "open").length;
}

function hasOpenTradeForSymbol(trades, symbol) {
  const clean = normalizeAsxSymbol(symbol);
  return trades.some((t) => t.status === "open" && normalizeAsxSymbol(t.symbol) === clean);
}

function expectedEntryFee() {
  return round(PAPER_ACCOUNT.brokerFeePerTrade, 2);
}

function expectedExitFee() {
  return round(PAPER_ACCOUNT.brokerFeePerTrade, 2);
}

function enrichTradeFinancials(trade) {
  const entry = Number(trade.entry);
  const shares = Number(trade.shares);
  const stop = Number(trade.stop);
  const target = Number(trade.target);
  const exit = Number(trade.exit);
  const side = String(trade.side || "long").toLowerCase();
  const multiplier = side === "short" ? -1 : 1;

  const tradeValue = entry > 0 && shares > 0 ? entry * shares : 0;
  const entryBrokerFee = Number(trade.entryBrokerFee || trade.brokerFeeEntry || expectedEntryFee());
  const estimatedExitBrokerFee = Number(trade.estimatedExitBrokerFee || expectedExitFee());
  const exitBrokerFee = trade.status === "closed" ? Number(trade.exitBrokerFee || trade.brokerFeeExit || expectedExitFee()) : 0;

  const grossRisk = entry > 0 && stop > 0 && shares > 0 ? Math.max(0, (entry - stop) * shares * multiplier) : 0;
  const openRiskAfterFees = grossRisk + entryBrokerFee + estimatedExitBrokerFee;

  const grossTargetProfit = entry > 0 && target > 0 && shares > 0 ? (target - entry) * shares * multiplier : 0;
  const targetProfitAfterFees = grossTargetProfit - entryBrokerFee - estimatedExitBrokerFee;

  trade.tradeValue = round(tradeValue, 2);
  trade.capitalUsed = round(tradeValue, 2);
  trade.entryBrokerFee = round(entryBrokerFee, 2);
  trade.estimatedExitBrokerFee = round(estimatedExitBrokerFee, 2);
  trade.exitBrokerFee = round(exitBrokerFee, 2);
  trade.cashCommitted = round(tradeValue + entryBrokerFee, 2);
  trade.grossRisk = round(grossRisk, 2);
  trade.riskAmount = round(openRiskAfterFees, 2);
  trade.grossTargetProfit = round(grossTargetProfit, 2);
  trade.targetProfit = round(targetProfitAfterFees, 2);
  trade.accountRiskPct = PAPER_ACCOUNT.startingBalance > 0 ? round((openRiskAfterFees / PAPER_ACCOUNT.startingBalance) * 100, 2) : 0;
  trade.accountUsedPct = PAPER_ACCOUNT.startingBalance > 0 ? round(((tradeValue + entryBrokerFee) / PAPER_ACCOUNT.startingBalance) * 100, 2) : 0;

  if (trade.status === "closed" && Number.isFinite(exit) && exit > 0) {
    const grossPnl = (exit - entry) * shares * multiplier;
    const totalBrokerFees = entryBrokerFee + exitBrokerFee;
    const netPnl = grossPnl - totalBrokerFees;

    trade.grossPnl = round(grossPnl, 2);
    trade.totalBrokerFees = round(totalBrokerFees, 2);
    trade.pnl = round(netPnl, 2);
    trade.netPnl = round(netPnl, 2);
    trade.pnlPct = tradeValue > 0 ? round((netPnl / tradeValue) * 100, 2) : 0;
  } else {
    trade.totalBrokerFees = round(entryBrokerFee + estimatedExitBrokerFee, 2);
  }

  return trade;
}

function calculateSharesForSignal(price, stop) {
  const entry = Number(price);
  const stopLoss = Number(stop);

  if (!Number.isFinite(entry) || entry <= 0) return 0;
  if (!Number.isFinite(stopLoss) || stopLoss <= 0 || stopLoss >= entry) return 0;

  const riskPerShare = entry - stopLoss;
  const sharesByRisk = Math.floor(Math.max(0, PAPER_RULES.riskDollars - expectedEntryFee() - expectedExitFee()) / riskPerShare);
  const sharesByMaxValue = Math.floor(PAPER_RULES.maxTradeValue / entry);
  const shares = Math.max(0, Math.min(sharesByRisk, sharesByMaxValue));

  return shares;
}

function validateTradeValueOrThrow(tradeValue) {
  if (!Number.isFinite(tradeValue) || tradeValue <= 0) {
    throw new Error("Trade value is invalid.");
  }

  if (tradeValue < PAPER_RULES.minTradeValue) {
    throw new Error("Trade value must be at least $" + PAPER_RULES.minTradeValue + " before brokerage.");
  }

  if (tradeValue > PAPER_RULES.maxTradeValue) {
    throw new Error("Trade value is above the $" + PAPER_RULES.maxTradeValue + " paper trade cap.");
  }
}

function buildPaperTradeFromSignal(signal, source) {
  const symbol = normalizeAsxSymbol(signal.symbol);
  const price = Number(signal.price);
  const stop = Number(signal.stopLoss);
  const target = Number(signal.target1);

  if (!symbol) throw new Error("symbol is required");
  if (!Number.isFinite(price) || price <= 0) throw new Error("valid signal price is required");
  if (!Number.isFinite(stop) || stop <= 0 || stop >= price) throw new Error("valid stop below entry is required");
  if (!Number.isFinite(target) || target <= price) throw new Error("valid target above entry is required");

  const rr = calcRiskReward(price, stop, target);
  if (rr < PAPER_RULES.minRiskReward) throw new Error("risk reward is below auto paper rule.");

  const shares = calculateSharesForSignal(price, stop);
  if (shares < 1) throw new Error("position size too small under current risk and value rules");

  const tradeValue = price * shares;
  validateTradeValueOrThrow(tradeValue);

  const trade = {
    id: "ASX-" + Date.now() + "-" + Math.floor(Math.random() * 100000),
    status: "open",
    market: "ASX",
    symbol,
    side: "long",
    entry: round(price, 4),
    shares,
    stop: round(stop, 4),
    target: round(target, 4),
    setup: String(signal.setup || "ASX auto paper"),
    score: Number(signal.score || 0),
    riskReward: round(rr, 2),
    decision: String(signal.decision || ""),
    notes: "Opened only after paper-trading rule gate passed. Brokerage and minimum trade value applied.",
    openedAt: new Date().toISOString(),
    source,
    entryBrokerFee: expectedEntryFee(),
    estimatedExitBrokerFee: expectedExitFee()
  };

  return enrichTradeFinancials(trade);
}

function validatePaperTradeRequest(body) {
  const score = Number(body.score || 0);
  const rr = calcRiskReward(Number(body.entry), Number(body.stop), Number(body.target));

  const signalLike = {
    score,
    riskReward: rr,
    price: Number(body.entry),
    buyZoneHigh: Number(body.buyZoneHigh || body.entry),
    distanceToBuyZonePct: Number(body.distanceToBuyZonePct || 0),
    change5dPct: Number(body.change5dPct || 0),
    change20dPct: Number(body.change20dPct || 0)
  };

  const result = evaluateSignalForPaperTrade(signalLike);

  return {
    allowed: result.allowed,
    checks: result.checks,
    riskReward: round(rr, 2)
  };
}

function paperAccountStats(trades, marks = {}) {
  const enriched = trades.map((t) => enrichTradeFinancials({ ...t }));

  const open = enriched.filter((t) => t.status === "open");
  const closed = enriched.filter((t) => t.status === "closed");

  const realisedPnl = closed.reduce((sum, t) => sum + Number(t.pnl || 0), 0);
  const capitalInOpenTrades = open.reduce((sum, t) => sum + Number(t.capitalUsed || 0), 0);
  const cashCommittedToOpenTrades = open.reduce((sum, t) => sum + Number(t.cashCommitted || 0), 0);
  const openRisk = open.reduce((sum, t) => sum + Number(t.riskAmount || 0), 0);
  const openTargetReward = open.reduce((sum, t) => sum + Number(t.targetProfit || 0), 0);
  const openEntryBrokerFees = open.reduce((sum, t) => sum + Number(t.entryBrokerFee || 0), 0);
  const estimatedOpenExitFees = open.reduce((sum, t) => sum + Number(t.estimatedExitBrokerFee || 0), 0);
  const closedBrokerFees = closed.reduce((sum, t) => sum + Number(t.totalBrokerFees || 0), 0);

  const cashAvailable = PAPER_ACCOUNT.startingBalance + realisedPnl - cashCommittedToOpenTrades;
  let unpricedOpenTrades = 0;
  let unrealisedPnl = 0;
  const marketValueOfOpenTrades = open.reduce((total, trade) => {
    const mark = marks[trade.symbol];
    const priced = mark && Number.isFinite(mark.price) && mark.price > 0;
    if (!priced) unpricedOpenTrades++;
    const price = priced ? mark.price : trade.entry;
    unrealisedPnl += (price - trade.entry) * trade.shares;
    return total + price * trade.shares;
  }, 0);
  const accountEquity = cashAvailable + marketValueOfOpenTrades;

  const wins = closed.filter((t) => Number(t.pnl) > 0);
  const losses = closed.filter((t) => Number(t.pnl) < 0);

  const bySetup = {};

  for (const t of closed) {
    const key = t.setup || "unknown";
    bySetup[key] = bySetup[key] || {
      trades: 0,
      wins: 0,
      pnl: 0,
      fees: 0
    };

    bySetup[key].trades += 1;
    if (Number(t.pnl) > 0) bySetup[key].wins += 1;
    bySetup[key].pnl += Number(t.pnl || 0);
    bySetup[key].fees += Number(t.totalBrokerFees || 0);
  }

  for (const key of Object.keys(bySetup)) {
    bySetup[key].winRate = round((bySetup[key].wins / bySetup[key].trades) * 100, 2);
    bySetup[key].pnl = round(bySetup[key].pnl, 2);
    bySetup[key].fees = round(bySetup[key].fees, 2);
  }

  return {
    startingBalance: PAPER_ACCOUNT.startingBalance,
    currency: PAPER_ACCOUNT.currency,
    brokerFeePerTrade: PAPER_ACCOUNT.brokerFeePerTrade,
    cashAvailable: round(cashAvailable, 2),
    capitalInOpenTrades: round(capitalInOpenTrades, 2),
    cashCommittedToOpenTrades: round(cashCommittedToOpenTrades, 2),
    accountEquity: round(accountEquity, 2),
    marketValueOfOpenTrades: round(marketValueOfOpenTrades, 2),
    unrealisedPnl: round(unrealisedPnl, 2),
    unrealisedPnlAfterFees: round(unrealisedPnl - openEntryBrokerFees - estimatedOpenExitFees, 2),
    estimatedLiquidationEquity: round(accountEquity - estimatedOpenExitFees, 2),
    valuationComplete: unpricedOpenTrades === 0,
    unpricedOpenTrades,
    marks,
    realisedPnl: round(realisedPnl, 2),
    openRisk: round(openRisk, 2),
    openTargetReward: round(openTargetReward, 2),
    openEntryBrokerFees: round(openEntryBrokerFees, 2),
    estimatedOpenExitFees: round(estimatedOpenExitFees, 2),
    closedBrokerFees: round(closedBrokerFees, 2),
    totalEstimatedAndRealisedFees: round(openEntryBrokerFees + estimatedOpenExitFees + closedBrokerFees, 2),
    openTrades: open.length,
    closedTrades: closed.length,
    totalTrades: enriched.length,
    wins: wins.length,
    losses: losses.length,
    winRate: closed.length ? round((wins.length / closed.length) * 100, 2) : 0,
    netPnl: round(realisedPnl, 2),
    maxOpenTrades: PAPER_RULES.maxOpenTrades,
    minTradeValue: PAPER_RULES.minTradeValue,
    maxTradeValue: PAPER_RULES.maxTradeValue,
    riskDollars: PAPER_RULES.riskDollars,
    bySetup
  };
}

async function paperSnapshot() {
  const initial = readTrades();
  const symbols = uniqueArray(initial.filter(t => t.status === "open").map(t => t.symbol));
  const marks = {};
  const warnings = [];
  await mapLimit(symbols, 4, async symbol => {
    try {
      let result;
      try { result = await getBars(symbol, "5d", "15m"); }
      catch { result = await getBars(symbol, "1y", "1d"); }
      const bar = result.bars[result.bars.length - 1];
      const age = Date.now() - Date.parse(bar.date);
      if (!Number.isFinite(age) || age > 5 * 86400000 || age < -86400000) throw new Error("Latest market price is stale or invalid");
      marks[symbol] = {price: Number(bar.close), asOf: bar.date, source: result.source, interval: result.interval};
    } catch (error) { warnings.push(symbol + ": " + error.message); }
  });
  // Re-read after asynchronous pricing so simultaneous closes/openings are kept.
  const trades = readTrades().map(t => enrichTradeFinancials({...t}));
  const account = paperAccountStats(trades, marks);
  const pricedTrades = trades.map(t => ({...t,
    markPrice: t.status === "open" ? marks[t.symbol]?.price ?? null : null,
    markAsOf: t.status === "open" ? marks[t.symbol]?.asOf ?? null : null
  }));
  return {trades: pricedTrades, account, warnings};
}

function recordObservations(signals, observedAt = new Date().toISOString()) {
  if (!signals.length) return 0;
  return observationStore.update(rows => {
    const existing = new Set(rows.map(row => row.id));
    let recorded = 0;
    for (const signal of signals) {
      const item = learning.makeObservation(signal, VERSION, observedAt, {
        budget: 1000, entryFee: expectedEntryFee(), exitFee: expectedExitFee(), slippageBps: 10
      });
      if (!item || existing.has(item.id)) continue;
      item.ruleSnapshot = {...PAPER_RULES};
      rows.push(item);
      existing.add(item.id);
      recorded++;
    }
    return recorded;
  });
}

function learningReport() {
  return learning.buildReport(observationStore.read(), VERSION);
}

let evaluationPromise = null;
async function evaluateObservations(asOf = new Date().toISOString()) {
  if (evaluationPromise) return evaluationPromise;
  evaluationPromise = (async () => {
    const today = learning.sydneyDate(asOf);
    const observations = observationStore.read().filter(row => row.strategyVersion === VERSION && !row.outcomes[20] && row.cutoffDate < today);
    const symbols = uniqueArray(observations.map(row => row.symbol));
    const settlements = new Map();
    const errors = [];
    await mapLimit(symbols, 4, async symbol => {
      try {
        const result = await getBars(symbol, "10y", "1d");
        for (const row of observations.filter(row => row.symbol === symbol)) {
          settlements.set(row.id, learning.settleObservation(row, result.bars, asOf));
        }
      } catch (error) { errors.push({symbol, error: error.message}); }
    });
    if (settlements.size) observationStore.update(rows => {
      for (const row of rows) {
        const updates = settlements.get(row.id);
        if (!updates) continue;
        for (const [horizon, outcome] of Object.entries(updates)) if (!row.outcomes[horizon]) row.outcomes[horizon] = outcome;
      }
    });
    return {...learningReport(), errors, evaluatedAt: asOf};
  })();
  try { return await evaluationPromise; }
  finally { evaluationPromise = null; }
}

async function autoPaperFromSignals({ sector, symbols, scanLimit, maxEntries }) {
  const base =
    sector && ASX_SECTORS[sector]
      ? ASX_SECTORS[sector]
      : symbols && symbols.length
      ? uniqueSymbols(symbols)
      : ASX_DISCOVERY_UNIVERSE;

  const result = await scanSymbols(base.slice(0, scanLimit || 160), PAPER_RULES.riskDollars);
  return tradeStore.update(trades => {
  const opened = [];
  const blocked = [];

  const account = paperAccountStats(trades);

  const candidates = result.signals
    .filter((s) => s.paperRules && s.paperRules.allowed)
    .filter((s) => Number(s.price) > 0 && Number(s.stopLoss) > 0 && Number(s.target1) > 0)
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));

  for (const signal of candidates) {
    if (opened.length >= (maxEntries || PAPER_RULES.maxAutoEntriesPerRun)) break;

    if (openTradeCount(trades) >= PAPER_RULES.maxOpenTrades) {
      blocked.push({
        symbol: signal.symbol,
        reason: "Maximum open paper trades reached."
      });
      break;
    }

    if (hasOpenTradeForSymbol(trades, signal.symbol)) {
      blocked.push({
        symbol: signal.symbol,
        reason: "Already has an open paper trade."
      });
      continue;
    }

    try {
      const trade = buildPaperTradeFromSignal(signal, "auto-paper-rules");
      const currentAccount = paperAccountStats(trades);

      if (Number(trade.cashCommitted || 0) > Number(currentAccount.cashAvailable || 0)) {
        blocked.push({
          symbol: signal.symbol,
          reason: "Not enough paper cash available for trade value plus entry brokerage."
        });
        continue;
      }

      trades.push(trade);
      opened.push(trade);
    } catch (error) {
      blocked.push({
        symbol: signal.symbol,
        reason: error.message
      });
    }
  }

  return {
    ok: true,
    version: VERSION,
    mode: "auto-paper-rules",
    rules: PAPER_RULES,
    paperAccount: PAPER_ACCOUNT,
    accountBefore: account,
    accountAfter: paperAccountStats(trades),
    scanned: result.count,
    openedCount: opened.length,
    blockedCount: blocked.length,
    opened,
    blocked,
    topCandidates: candidates.slice(0, 10),
    errors: result.errors,
    updatedAt: new Date().toISOString()
  };
  });
}

function equityStats(equityCurve, trades) {
  const starting = equityCurve.length ? equityCurve[0].equity : 0;
  const ending = equityCurve.length ? equityCurve[equityCurve.length - 1].equity : starting;

  let peak = starting;
  let maxDrawdownPct = 0;

  for (const p of equityCurve) {
    if (p.equity > peak) peak = p.equity;
    const dd = peak > 0 ? ((p.equity - peak) / peak) * 100 : 0;
    if (dd < maxDrawdownPct) maxDrawdownPct = dd;
  }

  const wins = trades.filter((t) => Number(t.netPnl) > 0);
  const losses = trades.filter((t) => Number(t.netPnl) < 0);

  const grossWin = wins.reduce((s, t) => s + Number(t.netPnl || 0), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + Number(t.netPnl || 0), 0));
  const totalFees = trades.reduce((s, t) => s + Number(t.totalBrokerFees || 0), 0);
  const grossPnl = trades.reduce((s, t) => s + Number(t.grossPnl || 0), 0);
  const netPnl = trades.reduce((s, t) => s + Number(t.netPnl || 0), 0);

  return {
    startingEquity: round(starting),
    endingEquity: round(ending),
    grossPnl: round(grossPnl),
    totalBrokerFees: round(totalFees),
    netProfitAfterFees: round(netPnl),
    netProfit: round(ending - starting),
    netReturnPct: starting ? round(((ending - starting) / starting) * 100, 2) : 0,
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? round((wins.length / trades.length) * 100, 2) : 0,
    profitFactor: grossLoss > 0 ? round(grossWin / grossLoss, 2) : null,
    maxDrawdownPct: round(maxDrawdownPct, 2),
    brokerFeePerTrade: PAPER_ACCOUNT.brokerFeePerTrade,
    minTradeValue: PAPER_RULES.minTradeValue,
    maxTradeValue: PAPER_RULES.maxTradeValue,
    riskDollars: PAPER_RULES.riskDollars,
    rulesUsed: {
      minimumTradeValue: PAPER_RULES.minTradeValue,
      maximumTradeValue: PAPER_RULES.maxTradeValue,
      entryBrokerage: PAPER_ACCOUNT.brokerFeePerTrade,
      exitBrokerage: PAPER_ACCOUNT.brokerFeePerTrade,
      maxOpenTrades: PAPER_RULES.maxOpenTrades,
      minScore: PAPER_RULES.minScore,
      minRiskReward: PAPER_RULES.minRiskReward
    }
  };
}

function getBacktestParams(req) {
  const number = (name, fallback, min, max) => {
    const value = Number(req.query[name] ?? fallback);
    if (!Number.isFinite(value) || value < min || value > max) throw new Error("Invalid backtest parameter: " + name);
    return value;
  };
  const params = {
    accountSize: number("account", PAPER_ACCOUNT.startingBalance, 100, 100000000),
    riskDollars: number("risk", PAPER_RULES.riskDollars, 1, 1000000),
    maxTradePct: number("maxTradePct", 25, 1, 100),
    maxOpenTrades: number("maxOpenTrades", PAPER_RULES.maxOpenTrades, 1, 20),
    maxEntriesPerDay: number("maxEntriesPerDay", 3, 1, 20),
    minHoldDays: number("minHoldDays", 1, 0, 2520),
    maxHoldDays: number("maxHoldDays", 12, 1, 2520),
    years: number("years", 10, 1, 10),
    minTradeValue: number("minTradeValue", PAPER_RULES.minTradeValue, 1, 100000000),
    maxTradeValue: number("maxTradeValue", PAPER_RULES.maxTradeValue, 1, 100000000),
    entryBrokerFee: number("entryBrokerFee", PAPER_ACCOUNT.brokerFeePerTrade, 0, 10000),
    exitBrokerFee: number("exitBrokerFee", PAPER_ACCOUNT.brokerFeePerTrade, 0, 10000),
    slippageBps: number("slippageBps", 10, 0, 500)
  };
  if (params.minHoldDays > params.maxHoldDays || params.minTradeValue > params.maxTradeValue) throw new Error("Backtest minimum exceeds maximum");
  for (const key of ["maxOpenTrades", "maxEntriesPerDay", "minHoldDays", "maxHoldDays"]) {
    if (!Number.isInteger(params[key])) throw new Error("Backtest parameter must be an integer: " + key);
  }
  return params;
}

function swingEntryTier(signal) {
  const score = Number(signal.score || 0);
  const rr = Number(signal.riskReward || 0);
  const distance = Number(signal.distanceToBuyZonePct || 0);
  const near = Number.isFinite(distance) && distance <= 1.5 && distance >= -3;

  if (score >= 85 && rr >= PAPER_RULES.minRiskReward && near) return "Tier 1";
  if (score >= PAPER_RULES.minScore && rr >= PAPER_RULES.minRiskReward && near) return "Tier 2";
  if (score >= 75 && rr >= 2.2 && near) return "Tier 3";

  return "";
}

function calculateBacktestPositionSize({ entry, stop, cash, currentEquity, params }) {
  const riskPerShare = Number(entry) - Number(stop) * (1 - (params.slippageBps || 0) / 10000);

  if (!Number.isFinite(entry) || entry <= 0) return null;
  if (!Number.isFinite(stop) || stop <= 0 || stop >= entry) return null;
  if (!Number.isFinite(riskPerShare) || riskPerShare <= 0) return null;

  const cashAfterEntryBrokerage = cash - params.entryBrokerFee;
  if (cashAfterEntryBrokerage <= 0) return null;

  const maxByRule = params.maxTradeValue;
  const maxByEquityPct = currentEquity * (params.maxTradePct / 100);
  const maxByCash = cashAfterEntryBrokerage;

  const maxAllowedTradeValue = Math.min(maxByRule, maxByEquityPct, maxByCash);
  const minRequiredTradeValue = params.minTradeValue;

  if (maxAllowedTradeValue < minRequiredTradeValue) return null;

  const minSharesByValue = Math.ceil(minRequiredTradeValue / entry);
  const maxSharesByValue = Math.floor(maxAllowedTradeValue / entry);
  const maxSharesByRisk = Math.floor(Math.max(0, params.riskDollars - params.entryBrokerFee - params.exitBrokerFee) / riskPerShare);

  const shares = Math.max(0, Math.min(maxSharesByValue, maxSharesByRisk));

  if (shares < minSharesByValue) return null;

  const tradeValue = shares * entry;

  if (tradeValue < params.minTradeValue) return null;
  if (tradeValue > params.maxTradeValue) return null;
  if (tradeValue + params.entryBrokerFee > cash) return null;

  return {
    shares,
    tradeValue,
    entryBrokerFee: params.entryBrokerFee,
    estimatedExitBrokerFee: params.exitBrokerFee,
    cashCommitted: tradeValue + params.entryBrokerFee,
    grossRisk: riskPerShare * shares,
    riskAfterFees: riskPerShare * shares + params.entryBrokerFee + params.exitBrokerFee
  };
}

async function backtestSymbols(symbolList, params) {
  const startedAt = Date.now();
  const results = await mapLimit(symbolList, 4, async symbol => {
    try {
      const result = await getBars(symbol, "10y", "1d");
      return {symbol: normalizeAsxSymbol(symbol), source: result.source,
        bars: result.bars.slice(-(Math.floor(params.years * 252) + 230))};
    } catch (error) { return {symbol, error: error.message}; }
  });
  const loaded = results.filter(item => !item.error);
  const errors = results.filter(item => item.error);
  const simulation = require("./lib/backtest.cjs").simulatePortfolio(loaded, params, {
    analyze: analyzeSymbol, qualifies: swingEntryTier,
    sizePosition: calculateBacktestPositionSize, minRiskReward: PAPER_RULES.minRiskReward
  });
  return {
    ok: loaded.length > 0, version: VERSION, market: "ASX",
    mode: "asx-share-backtest-with-brokerage-and-minimum-trade-value",
    params, requested: symbolList.length, loaded: loaded.length, errors,
    skippedCount: simulation.skipped.length, skipped: simulation.skipped.slice(-80),
    stats: equityStats(simulation.equityCurve, simulation.trades),
    trades: simulation.trades.slice(-250).reverse(), equityCurve: simulation.equityCurve,
    updatedAt: new Date().toISOString(), elapsedMs: Date.now() - startedAt,
    notes: [
      "Historical ASX public-data simulation. Not a forecast or verified trading edge.",
      "Next-session open entries; stops gap at the open; same-day ambiguous paths assume stop first.",
      "Brokerage and adverse slippage are included; the risk budget includes both fees.",
      "Warm-up bars precede entries. Failed symbols are reported; delisted shares and corporate actions are not fully controlled.",
      "A neutral market regime is assumed. Live market context and fills can differ.",
      "Minimum target holding period: " + params.minHoldDays + " trading sessions. Stops remain active on entry day."
    ]
  };
}

function storageStatus() {
  const status = {
    configuredDirectory: !!process.env.STOCK_DATA_DIR,
    persistenceVerified: false,
    message: process.env.STOCK_DATA_DIR ?
      "Storage directory configured. Confirm with your host that it is a persistent disk and keep an external backup." :
      "Local storage only. Hosting restarts or deployments may erase history unless STOCK_DATA_DIR points to a persistent disk. Export a backup."
  };
  try {
    readTrades(); observationStore.read();
    if (fs.existsSync(tradesPath + ".lock") || fs.existsSync(observationStore.filename + ".lock")) throw new Error("History writer lock is present; review storage before writing");
    status.readable = true;
  } catch (error) { status.readable = false; status.error = error.message; }
  return status;
}

app.get(["/api/health", "/health"], (req, res) =>
  res.json({
    ok: true,
    version: VERSION,
    service: "TradingMint ASX Real",
    status: "online",
    storage: storageStatus(),
    config: ASX_CONFIG,
    paperAccount: PAPER_ACCOUNT,
    paperRules: PAPER_RULES,
    routes: [
      "/api/scan",
      "/api/discover",
      "/api/day-scan",
      "/api/bars",
      "/api/backtest",
      "/api/learning",
      "/api/learning/evaluate",
      "/api/backup",
      "/api/options",
      "/api/paper/open",
      "/api/paper/close",
      "/api/paper/trades",
      "/api/paper/stats",
      "/api/paper/rules",
      "/api/paper/auto",
      "/api/ping",
      "/api/keepalive"
    ],
    universeCount: ASX_DISCOVERY_UNIVERSE.length,
    cacheSize: chartCache.size,
    uptimeSeconds: Math.round(process.uptime()),
    time: new Date().toISOString()
  })
);

app.get("/api/learning", (req, res) => {
  try { res.json({ok: true, ...learningReport()}); }
  catch (error) { res.status(503).json({ok: false, error: error.message}); }
});

app.post("/api/learning/evaluate", async (req, res) => {
  try { res.json({ok: true, ...await evaluateObservations()}); }
  catch (error) { res.status(503).json({ok: false, error: error.message}); }
});

app.get("/api/backup", (req, res) => {
  try {
    res.set("Content-Disposition", 'attachment; filename="stock-learner-backup.json"');
    res.json({schemaVersion: 1, exportedAt: new Date().toISOString(), strategyVersion: VERSION,
      trades: readTrades(), observations: observationStore.read(), paperRules: PAPER_RULES, paperAccount: PAPER_ACCOUNT});
  } catch (error) { res.status(503).json({ok: false, error: error.message}); }
});

app.get("/api/bars", async (req, res) => {
  try {
    const symbol = normalizeAsxSymbol(req.query.symbol || "CBA");
    const range = String(req.query.range || "1y");
    const interval = String(req.query.interval || "1d");
    const result = await getBars(symbol, range, interval);

    res.json({
      ok: true,
      version: VERSION,
      market: "ASX",
      symbol,
      range,
      interval,
      source: result.source,
      count: result.bars.length,
      bars: result.bars,
      dataReality: result.dataReality,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      version: VERSION,
      error: error.message
    });
  }
});

app.get("/api/scan", async (req, res) => {
  try {
    const sector = String(req.query.sector || "").toLowerCase();

    const base =
      sector && ASX_SECTORS[sector]
        ? ASX_SECTORS[sector]
        : uniqueSymbols(req.query.symbols || DEFAULT_ASX_SYMBOLS.join(","));

    const result = await scanSymbols(base.slice(0, 160), req.query.risk || 100);
    result.sector = sector || "all/default";

    res.json(result);
  } catch (error) {
    res.status(500).json({
      ok: false,
      version: VERSION,
      error: error.message,
      stack: process.env.NODE_ENV === "production" ? undefined : error.stack
    });
  }
});

app.get("/api/discover", async (req, res) => {
  try {
    const exclude = new Set(uniqueSymbols(req.query.exclude || ""));
    const scanLimit = Math.max(1, Math.min(ASX_DISCOVERY_UNIVERSE.length, Number(req.query.scanLimit || 160)));
    const limit = Math.max(1, Math.min(120, Number(req.query.limit || 80)));

    const symbols = ASX_DISCOVERY_UNIVERSE.filter((symbol) => !exclude.has(symbol)).slice(0, scanLimit);
    const result = await scanSymbols(symbols, req.query.risk || 100);

    result.discoveryUniverse = ASX_DISCOVERY_UNIVERSE.length;
    result.discoveryScanned = symbols.length;
    result.signals = result.signals.slice(0, limit);
    result.count = result.signals.length;

    res.json(result);
  } catch (error) {
    res.status(500).json({
      ok: false,
      version: VERSION,
      error: error.message
    });
  }
});

app.get("/api/day-scan", async (req, res) => {
  try {
    const sector = String(req.query.sector || "").toLowerCase();

    const base =
      sector && ASX_SECTORS[sector]
        ? ASX_SECTORS[sector]
        : uniqueSymbols(req.query.symbols || DEFAULT_ASX_SYMBOLS.join(","));

    res.json(await dayScanSymbols(base.slice(0, 120)));
  } catch (error) {
    res.status(500).json({
      ok: false,
      version: VERSION,
      error: error.message
    });
  }
});

app.get("/api/backtest", async (req, res) => {
  try {
    const symbols = uniqueSymbols(req.query.symbols || DEFAULT_ASX_SYMBOLS.join(",")).slice(0, 35);
    res.json(await backtestSymbols(symbols, getBacktestParams(req)));
  } catch (error) {
    res.status(500).json({
      ok: false,
      version: VERSION,
      error: error.message
    });
  }
});

app.get("/api/options", (req, res) => {
  const symbol = normalizeAsxSymbol(req.query.symbol || "CBA");

  res.json({
    ok: false,
    version: VERSION,
    market: "ASX",
    symbol,
    status: "not_available_from_current_public_data_source",
    message:
      "This app does not fabricate ASX option chains. Yahoo public chart data provides share bars here, not a reliable live ASX exchange-traded options chain.",
    whatWouldBeNeeded: [
      "licensed ASX derivatives data",
      "broker API with ASX options chain",
      "or a verified options data vendor"
    ],
    scannerBehaviour:
      "Use share signals now. Only enable options when a real options-chain source is connected."
  });
});

app.get("/api/paper/rules", (req, res) => {
  res.json({
    ok: true,
    version: VERSION,
    paperAccount: PAPER_ACCOUNT,
    rules: PAPER_RULES
  });
});

app.post("/api/paper/open", async (req, res) => {
  try {
    const symbol = normalizeAsxSymbol(req.body.symbol);
    const side = String(req.body.side || "long").toLowerCase();

    if (!symbol) throw new Error("symbol is required");
    if (side !== "long" && side !== "short") throw new Error("side must be long or short");
    if (side === "short" && !PAPER_RULES.allowShorts) throw new Error("short paper trades are disabled by the rule set");

    const entry = Number(req.body.entry);
    const shares = Math.floor(Number(req.body.shares));
    const stop = Number(req.body.stop);
    const target = Number(req.body.target);

    if (!Number.isFinite(entry) || entry <= 0) throw new Error("valid entry price is required");
    if (!Number.isFinite(shares) || shares < 1) throw new Error("shares must be at least 1");
    if (!Number.isFinite(stop) || stop <= 0) throw new Error("valid stop is required");
    if (!Number.isFinite(target) || target <= 0) throw new Error("valid target is required");
    if (stop >= entry || target <= entry) throw new Error("stop must be below entry and target above entry");
    if ((entry - stop) * shares + expectedEntryFee() + expectedExitFee() > PAPER_RULES.riskDollars) {
      throw new Error("risk including entry and exit fees exceeds the paper risk budget");
    }

    const validation = validatePaperTradeRequest(req.body);

    if (!validation.allowed) {
      return res.status(400).json({
        ok: false,
        version: VERSION,
        error: "Trade blocked by paper-trading rules.",
        paperAccount: PAPER_ACCOUNT,
        rules: PAPER_RULES,
        checks: validation.checks
      });
    }

    const tradeValue = entry * shares;
    validateTradeValueOrThrow(tradeValue);

    const result = tradeStore.update(trades => {

    if (openTradeCount(trades) >= PAPER_RULES.maxOpenTrades) {
      throw new Error("maximum open paper trades reached");
    }

    if (hasOpenTradeForSymbol(trades, symbol)) {
      throw new Error("there is already an open paper trade for this symbol");
    }

    const trade = enrichTradeFinancials({
      id: "ASX-" + require("node:crypto").randomUUID(),
      status: "open",
      market: "ASX",
      symbol,
      side,
      entry: round(entry, 4),
      shares,
      stop: round(stop, 4),
      target: round(target, 4),
      setup: String(req.body.setup || "manual"),
      score: Number(req.body.score || 0),
      riskReward: validation.riskReward,
      decision: String(req.body.decision || ""),
      notes: String(req.body.notes || "Opened after paper-trading rule gate passed. Brokerage and minimum trade value applied."),
      openedAt: new Date().toISOString(),
      source: "rule-gated paper trade",
      entryBrokerFee: expectedEntryFee(),
      estimatedExitBrokerFee: expectedExitFee()
    });

    const account = paperAccountStats(trades);

    if (Number(trade.cashCommitted || 0) > Number(account.cashAvailable || 0)) {
      throw new Error("not enough paper cash available for trade value plus entry brokerage");
    }

    trades.push(trade);
    return {
      ok: true,
      version: VERSION,
      trade,
      account: paperAccountStats(trades)
    };
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({
      ok: false,
      version: VERSION,
      error: error.message
    });
  }
});

app.post("/api/paper/auto", async (req, res) => {
  try {
    const sector = String(req.body.sector || req.query.sector || "").toLowerCase();
    const symbols = req.body.symbols || req.query.symbols || "";
    const scanLimit = Math.max(1, Math.min(ASX_DISCOVERY_UNIVERSE.length, Number(req.body.scanLimit || req.query.scanLimit || 160)));
    const maxEntries = Math.max(1, Math.min(PAPER_RULES.maxAutoEntriesPerRun, Number(req.body.maxEntries || req.query.maxEntries || PAPER_RULES.maxAutoEntriesPerRun)));

    const result = await autoPaperFromSignals({
      sector,
      symbols,
      scanLimit,
      maxEntries
    });

    res.json(result);
  } catch (error) {
    res.status(400).json({
      ok: false,
      version: VERSION,
      error: error.message
    });
  }
});

app.post("/api/paper/close", (req, res) => {
  try {
    const id = String(req.body.id || "");
    const exit = Number(req.body.exit);

    if (!id) throw new Error("id is required");
    if (!Number.isFinite(exit) || exit <= 0) throw new Error("valid exit price is required");

    const result = tradeStore.update(trades => {
    const trade = trades.find((t) => t.id === id);

    if (!trade) throw new Error("trade not found");
    if (trade.status !== "open") throw new Error("trade is already closed");

    trade.status = "closed";
    trade.exit = round(exit, 4);
    trade.closedAt = new Date().toISOString();
    trade.exitBrokerFee = expectedExitFee();
    trade.exitReason = String(req.body.exitReason || "manual close");

    enrichTradeFinancials(trade);
    return {
      ok: true,
      version: VERSION,
      trade,
      account: paperAccountStats(trades)
    };
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({
      ok: false,
      version: VERSION,
      error: error.message
    });
  }
});

app.get("/api/paper/trades", async (req, res) => {
  try {
  const snapshot = await paperSnapshot();
  res.json({
    ok: true,
    version: VERSION,
    account: snapshot.account,
    trades: snapshot.trades.slice().reverse(),
    valuationWarnings: snapshot.warnings
  });
  } catch (error) { res.status(503).json({ ok: false, error: error.message }); }
});

app.get("/api/paper/stats", async (req, res) => {
  try {
  const snapshot = await paperSnapshot();
  res.json({
    ok: true,
    version: VERSION,
    paperAccount: PAPER_ACCOUNT,
    stats: snapshot.account,
    valuationWarnings: snapshot.warnings
  });
  } catch (error) { res.status(503).json({ ok: false, error: error.message }); }
});

app.get("/api/sectors", (req, res) =>
  res.json({
    ok: true,
    market: "ASX",
    sectors: ASX_SECTORS
  })
);

app.get("/api/universe", (req, res) =>
  res.json({
    ok: true,
    market: "ASX",
    count: ASX_DISCOVERY_UNIVERSE.length,
    symbols: ASX_DISCOVERY_UNIVERSE
  })
);

app.get("/api/ping", (req, res) => {
  res.json({
    ok: true,
    version: VERSION,
    status: "awake",
    time: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    message: "TradingMint ASX server is awake."
  });
});

app.get("/api/keepalive", (req, res) => {
  res.json({
    ok: true,
    version: VERSION,
    status: "keepalive",
    time: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime())
  });
});

app.use(express.static(publicPath));

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({
      ok: false,
      version: VERSION,
      error: "API route not found",
      path: req.path
    });
  }

  res.sendFile(path.join(publicPath, "index.html"));
});

app.listen(PORT, process.env.STOCK_BIND_HOST || "0.0.0.0", () => {
  console.log("TradingMint ASX Real running on port " + PORT);
  console.log("Version: " + VERSION);
});
