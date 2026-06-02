let selectedSignal = null;

const $ = (id) => document.getElementById(id);

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

function renderSignals(data) {
  $("meta").textContent = `${data.market || "ASX"} | ${data.mode || "scan"} | Regime: ${data.marketRegime || "n/a"} | Count: ${data.count} | Updated: ${data.updatedAt}`;
  const tbody = $("signals");
  tbody.innerHTML = "";
  for (const s of data.signals || []) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${s.symbol}</td>
      <td><strong>${s.score}</strong></td>
      <td>${s.decision}</td>
      <td>${s.price ?? ""}</td>
      <td>${s.change5dPct ?? ""}%</td>
      <td>${s.change20dPct ?? ""}%</td>
      <td>${s.rangePosition20 ?? ""}%</td>
      <td>${s.buyZoneLow ?? ""} - ${s.buyZoneHigh ?? ""}</td>
      <td>${s.stopLoss ?? ""}</td>
      <td>${s.target1 ?? s.dayTarget ?? ""}</td>
      <td>${s.riskReward ?? s.dayRiskReward ?? ""}</td>
      <td>${s.avgDollarVolume20 ? "$" + Math.round(s.avgDollarVolume20).toLocaleString() : "n/a"}</td>`;
    tr.onclick = () => {
      selectedSignal = s;
      $("selected").textContent = JSON.stringify(s, null, 2);
      $("optionsOut").textContent = "";
    };
    tbody.appendChild(tr);
  }
  if (data.errors && data.errors.length) $("output").textContent = JSON.stringify(data.errors, null, 2);
  else $("output").textContent = "";
}

async function runScan(kind) {
  try {
    $("output").textContent = "Loading real ASX data...";
    const sector = $("sector").value;
    const symbols = $("symbols").value;
    let url;
    if (kind === "day") url = endpoint("/api/day-scan", { sector, symbols: sector ? "" : symbols });
    else if (kind === "discover") url = endpoint("/api/discover", { scanLimit: 80, limit: 30 });
    else url = endpoint("/api/scan", { sector, symbols: sector ? "" : symbols });
    const data = await getJson(url);
    renderSignals(data);
  } catch (error) {
    $("output").textContent = error.message;
  }
}

async function runBacktest() {
  try {
    $("output").textContent = "Running historical ASX backtest...";
    const data = await getJson(endpoint("/api/backtest", { symbols: $("symbols").value, years: 5, account: 5000, risk: 50 }));
    $("output").textContent = JSON.stringify(data, null, 2);
  } catch (error) {
    $("output").textContent = error.message;
  }
}

async function checkOptions() {
  if (!selectedSignal) return;
  const data = await getJson(endpoint("/api/options", { symbol: selectedSignal.symbol }));
  $("optionsOut").textContent = JSON.stringify(data, null, 2);
}

$("scanBtn").onclick = () => runScan("scan");
$("dayBtn").onclick = () => runScan("day");
$("discoverBtn").onclick = () => runScan("discover");
$("backtestBtn").onclick = runBacktest;
$("optionsBtn").onclick = checkOptions;

runScan("scan");
