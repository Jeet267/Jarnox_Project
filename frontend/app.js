/* ──────────────────────────────────────────────────────────────
   JARNOX STOCK DASHBOARD  ·  Frontend JavaScript
   API base: FastAPI running at http://localhost:8000
────────────────────────────────────────────────────────────── */

const API = ""; // Use relative paths for safety

let activeSymbol  = null;
let activeDays    = 90;
let showPredict   = false;
let priceChart    = null;
let returnChart   = null;
let volChart      = null;
let volumeChart   = null;
let compareChartInst = null;
let allStocks     = [];

// ─── INIT ──────────────────────────────────────────────────────
async function init() {
  try {
    const res  = await fetch(`${API}/stocks`);
    allStocks  = await res.json();
    renderSidebar(allStocks);
    populateCompareSelects(allStocks);
    loadMarketTab();
    loadSentiment();
    updateLastUpdated();
  } catch (e) {
    showToast("⚠️ API connection failed. Make sure the server is running.");
  }
}

// ─── SIDEBAR ───────────────────────────────────────────────────
function renderSidebar(stocks) {
  const list = document.getElementById("stockList");
  list.innerHTML = "";
  stocks.forEach(s => {
    const li = document.createElement("li");
    li.className = "stock-item";
    li.id = `item-${s.symbol}`;
    li.innerHTML = `
      <div class="stock-avatar">${s.symbol.slice(0,3)}</div>
      <div class="stock-info">
        <div class="stock-symbol">${s.symbol}</div>
        <div class="stock-name">${s.company_name}</div>
      </div>`;
    li.onclick = () => selectStock(s.symbol);
    list.appendChild(li);
  });
}

document.getElementById("searchInput").addEventListener("input", function () {
  const q = this.value.toLowerCase();
  const filtered = allStocks.filter(
    s => s.symbol.toLowerCase().includes(q) || s.company_name.toLowerCase().includes(q)
  );
  renderSidebar(filtered);
});

// ─── STOCK SELECTION ───────────────────────────────────────────
async function selectStock(symbol) {
  activeSymbol = symbol;

  // Highlight sidebar item
  document.querySelectorAll(".stock-item").forEach(el => el.classList.remove("active"));
  const item = document.getElementById(`item-${symbol}`);
  if (item) item.classList.add("active");

  // Switch to dashboard tab
  switchTab("dashboard");

  // Show filter bar & charts grid
  document.getElementById("filterBar").style.display = "flex";
  document.getElementById("chartsGrid").style.display = "grid";
  document.getElementById("metricsRow").style.display = "grid";

  await Promise.all([loadCharts(), loadMetrics()]);
}

// ─── CHARTS ────────────────────────────────────────────────────
async function loadCharts() {
  if (!activeSymbol) return;
  try {
    const [histRes, detailRes] = await Promise.all([
      fetch(`${API}/stocks/${activeSymbol}/history?days=${activeDays}`),
      fetch(`${API}/stocks/${activeSymbol}`)
    ]);
    const hist   = await histRes.json();
    const detail = await detailRes.json();

    // Info bar
    renderInfoBar(detail, hist);

    const labels = hist.map(d => d.date);
    const closes = hist.map(d => d.close);
    const ma7    = hist.map(d => d.ma_7);
    const ma30   = hist.map(d => d.ma_30);
    const rets   = hist.map(d => d.daily_return);
    const vols   = hist.map(d => d.volatility);
    const vols_  = vols.map(v => v === null ? null : Math.abs(v));
    const volumes= hist.map(d => d.volume);

    // Prediction overlay
    let predDates = [], predPrices = [];
    if (showPredict) {
      try {
        const pr = await fetch(`${API}/stocks/${activeSymbol}/predict?days_ahead=14`);
        const pd = await pr.json();
        predDates  = pd.predictions.map(p => p.date);
        predPrices = pd.predictions.map(p => p.predicted_close);
      } catch {}
    }

    // ── PRICE CHART ──────────────────────────────────────────
    destroyChart(priceChart);
    priceChart = new Chart(document.getElementById("priceChart"), {
      type: "line",
      data: {
        labels: showPredict ? [...labels, ...predDates] : labels,
        datasets: [
          {
            label: "Close Price",
            data: showPredict ? [...closes, ...Array(predDates.length).fill(null)] : closes,
            borderColor: "#6c63ff",
            backgroundColor: "rgba(108,99,255,0.08)",
            borderWidth: 2,
            fill: true,
            tension: 0.35,
            pointRadius: 0,
          },
          {
            label: "7-Day MA",
            data: showPredict ? [...ma7, ...Array(predDates.length).fill(null)] : ma7,
            borderColor: "#00d4a4",
            borderWidth: 1.5,
            borderDash: [4, 4],
            pointRadius: 0,
            fill: false,
            tension: 0.35,
          },
          {
            label: "30-Day MA",
            data: showPredict ? [...ma30, ...Array(predDates.length).fill(null)] : ma30,
            borderColor: "#ffd166",
            borderWidth: 1.5,
            borderDash: [4, 4],
            pointRadius: 0,
            fill: false,
            tension: 0.35,
          },
          ...(showPredict ? [{
            label: "ML Prediction",
            data: [...Array(closes.length).fill(null), ...predPrices],
            borderColor: "#ff5c6c",
            borderWidth: 2,
            borderDash: [6, 3],
            pointRadius: 3,
            fill: false,
            tension: 0.3,
          }] : []),
        ]
      },
      options: chartOptions("₹"),
    });

    // ── DAILY RETURN ─────────────────────────────────────────
    destroyChart(returnChart);
    returnChart = new Chart(document.getElementById("returnChart"), {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Daily Return %",
          data: rets,
          backgroundColor: rets.map(r => r >= 0 ? "rgba(0,212,164,0.7)" : "rgba(255,92,108,0.7)"),
          borderRadius: 3,
        }]
      },
      options: chartOptions("%"),
    });

    // ── VOLATILITY ───────────────────────────────────────────
    destroyChart(volChart);
    volChart = new Chart(document.getElementById("volChart"), {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Volatility",
          data: vols_,
          borderColor: "#ffd166",
          backgroundColor: "rgba(255,209,102,0.1)",
          fill: true,
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.4,
        }]
      },
      options: chartOptions(""),
    });

    // ── VOLUME ───────────────────────────────────────────────
    destroyChart(volumeChart);
    volumeChart = new Chart(document.getElementById("volumeChart"), {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Volume",
          data: volumes,
          backgroundColor: "rgba(108,99,255,0.55)",
          borderRadius: 3,
        }]
      },
      options: chartOptions(""),
    });

  } catch (e) {
    console.error(e);
    showToast("Failed to load chart data.");
  }
}

// ─── INFO BAR ──────────────────────────────────────────────────
function renderInfoBar(detail, hist) {
  const latest  = detail.latest || {};
  const ret     = latest.daily_return || 0;
  const retSign = ret >= 0 ? "+" : "";
  const retCls  = ret >= 0 ? "green" : "red";

  document.getElementById("stockInfoBar").innerHTML = `
    <div class="sib-header">
      <div class="sib-name">
        <h2>${detail.company_name} <span style="color:var(--text2);font-size:.9rem;">(${detail.symbol})</span></h2>
        <span>NSE Listed</span>
      </div>
      <div class="sib-price">
        <div class="price">₹${latest.close?.toLocaleString("en-IN") || "—"}</div>
        <div class="date">as of ${latest.date || "—"}</div>
      </div>
    </div>
    <div class="sib-chips">
      <span class="chip ${retCls}">${retSign}${ret.toFixed(2)}% today</span>
      <span class="chip">52W High: ₹${detail["52_week_high"]?.toLocaleString("en-IN") || "—"}</span>
      <span class="chip">52W Low: ₹${detail["52_week_low"]?.toLocaleString("en-IN") || "—"}</span>
      <span class="chip">Vol: ${latest.volume ? (latest.volume/1e6).toFixed(2)+"M" : "—"}</span>
      <span class="chip">MA7: ₹${latest.ma_7?.toFixed(2) || "—"}</span>
      <span class="chip">MA30: ₹${latest.ma_30?.toFixed(2) || "—"}</span>
    </div>`;
}

// ─── METRICS CARDS ─────────────────────────────────────────────
async function loadMetrics() {
  if (!activeSymbol) return;
  try {
    const res = await fetch(`${API}/stocks/${activeSymbol}/metrics`);
    const m   = await res.json();
    const container = document.getElementById("metricsRow");
    const cards = [
      { label: "Avg Daily Return", val: `${m.avg_daily_return_pct?.toFixed(3)}%`, cls: m.avg_daily_return_pct >= 0 ? "pos" : "neg" },
      { label: "Avg Volatility",   val: m.avg_volatility?.toFixed(3),  cls: "neutral" },
      { label: "Total Return",     val: `${m.total_return_pct?.toFixed(2)}%`, cls: m.total_return_pct >= 0 ? "pos" : "neg" },
      { label: "Best Day",         val: `${m.best_day?.return_pct?.toFixed(2)}%`, cls: "pos", sub: m.best_day?.date },
      { label: "Worst Day",        val: `${m.worst_day?.return_pct?.toFixed(2)}%`, cls: "neg",  sub: m.worst_day?.date },
    ];
    container.innerHTML = cards.map(c => `
      <div class="metric-card">
        <div class="m-label">${c.label}</div>
        <div class="m-value ${c.cls}">${c.val}</div>
        ${c.sub ? `<div style="font-size:.72rem;color:var(--text2);margin-top:4px">${c.sub}</div>` : ""}
      </div>`).join("");
  } catch {}
}

// ─── FILTER RANGE ──────────────────────────────────────────────
function changeRange(days) {
  activeDays = days;
  document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
  event.target.classList.add("active");
  loadCharts();
}

function togglePrediction() {
  showPredict = document.getElementById("showPredict").checked;
  loadCharts();
}

// ─── TABS ──────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll(".tab-content").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
  document.getElementById(`tab-${name}`).classList.add("active");
  document.querySelector(`[data-tab="${name}"]`).classList.add("active");
  if (name === "market") loadMarketTab();
}

// ─── COMPARE ───────────────────────────────────────────────────
function populateCompareSelects(stocks) {
  ["cmp1", "cmp2"].forEach((id, i) => {
    const sel = document.getElementById(id);
    sel.innerHTML = stocks.map((s, idx) =>
      `<option value="${s.symbol}" ${idx === i ? "selected" : ""}>${s.symbol} — ${s.company_name}</option>`
    ).join("");
  });
}

async function runCompare() {
  const s1   = document.getElementById("cmp1").value;
  const s2   = document.getElementById("cmp2").value;
  const days = document.getElementById("cmpDays").value;
  if (s1 === s2) { showToast("Please select two different stocks."); return; }

  try {
    const res  = await fetch(`${API}/compare?symbol1=${s1}&symbol2=${s2}&days=${days}`);
    const data = await res.json();

    document.getElementById("compareResult").innerHTML = `
      <div class="corr-box">
        <div class="corr-val">${data.correlation}</div>
        <div class="corr-label">Correlation Coefficient</div>
        <div class="corr-interp">${data.correlation_interpretation}</div>
      </div>
      <div class="corr-box" style="min-width:unset;flex:1">
        <div style="font-size:.82rem;color:var(--text2);margin-bottom:8px">
          Correlation measures how closely <strong>${s1}</strong> and <strong>${s2}</strong> move together.<br>
          Values near +1 = strong positive, -1 = inverse, 0 = no relation.
        </div>
      </div>`;

    const card = document.getElementById("compareChartCard");
    card.style.display = "block";
    document.getElementById("compareChartTitle").textContent = `${s1} vs ${s2} — Closing Price (${days} Days)`;

    const labels = data.data.map(d => d.date);
    destroyChart(compareChartInst);
    compareChartInst = new Chart(document.getElementById("compareChart"), {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: s1,
            data: data.data.map(d => d[`${s1}_close`]),
            borderColor: "#6c63ff",
            backgroundColor: "rgba(108,99,255,0.07)",
            fill: true, borderWidth: 2, pointRadius: 0, tension: 0.35,
          },
          {
            label: s2,
            data: data.data.map(d => d[`${s2}_close`]),
            borderColor: "#00d4a4",
            backgroundColor: "rgba(0,212,164,0.07)",
            fill: true, borderWidth: 2, pointRadius: 0, tension: 0.35,
          },
        ]
      },
      options: chartOptions("₹"),
    });

  } catch (e) {
    showToast("Compare failed. Check symbols.");
  }
}

// ─── MARKET TAB ────────────────────────────────────────────────
async function loadMarketTab() {
  await Promise.all([loadGainersLosers(), loadCorrelation()]);
}

async function loadGainersLosers() {
  try {
    const [gRes, lRes] = await Promise.all([
      fetch(`${API}/top-gainers?limit=5`),
      fetch(`${API}/top-losers?limit=5`),
    ]);
    const gainers = await gRes.json();
    const losers  = await lRes.json();
    renderMovers("gainersList", gainers, true);
    renderMovers("losersList",  losers,  false);
  } catch {}
}

function renderMovers(containerId, data, isGainer) {
  const html = data.map(s => `
    <div class="mover-item">
      <div>
        <div class="mover-sym">${s.symbol}</div>
        <div class="mover-name">${s.company_name}</div>
      </div>
      <div class="mover-ret ${isGainer ? "pos" : "neg"}">
        ${isGainer ? "+" : ""}${s.daily_return?.toFixed(2)}%
      </div>
    </div>`).join("");
  document.getElementById(containerId).innerHTML = html;
}

async function loadCorrelation() {
  try {
    const res  = await fetch(`${API}/correlation`);
    const data = await res.json();
    const matrix = data.correlation_matrix;
    const syms   = Object.keys(matrix);

    let table = `<table class="heatmap-table"><thead><tr><th></th>`;
    syms.forEach(s => { table += `<th>${s}</th>`; });
    table += `</tr></thead><tbody>`;

    syms.forEach(row => {
      table += `<tr><th style="text-align:left;color:var(--text2)">${row}</th>`;
      syms.forEach(col => {
        const val = matrix[row]?.[col];
        const v   = typeof val === "number" ? val : null;
        const color = v === null ? "transparent" : corrColor(v);
        const textColor = v !== null && Math.abs(v) > 0.5 ? "#fff" : "var(--text)";
        table += `<td style="background:${color};color:${textColor}">${v !== null ? v.toFixed(2) : "—"}</td>`;
      });
      table += `</tr>`;
    });
    table += `</tbody></table>`;
    document.getElementById("heatmapContainer").innerHTML = table;
  } catch {}
}

function corrColor(v) {
  if (v >= 0.9) return "rgba(0,212,164,0.85)";
  if (v >= 0.7) return "rgba(0,212,164,0.55)";
  if (v >= 0.4) return "rgba(0,212,164,0.25)";
  if (v > 0)    return "rgba(0,212,164,0.08)";
  if (v <= -0.7) return "rgba(255,92,108,0.75)";
  if (v <= -0.4) return "rgba(255,92,108,0.4)";
  return "rgba(255,92,108,0.1)";
}

// ─── CHART OPTIONS ─────────────────────────────────────────────
function chartOptions(prefix) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        labels: {
          color: "#9098b0",
          font: { size: 11, family: "Inter" },
          boxWidth: 12,
        }
      },
      tooltip: {
        backgroundColor: "#1a1e2a",
        borderColor:     "#252a38",
        borderWidth: 1,
        titleColor: "#e8eaf0",
        bodyColor:  "#9098b0",
        callbacks: {
          label: ctx => ` ${ctx.dataset.label}: ${prefix}${ctx.parsed.y?.toLocaleString("en-IN") ?? "null"}`,
        }
      }
    },
    scales: {
      x: {
        ticks: { color: "#9098b0", maxRotation: 0, maxTicksLimit: 8, font: { size: 10 } },
        grid:  { color: "rgba(255,255,255,0.04)" },
      },
      y: {
        ticks: { color: "#9098b0", font: { size: 10 } },
        grid:  { color: "rgba(255,255,255,0.04)" },
      }
    }
  };
}

// ─── UTILS ─────────────────────────────────────────────────────
function destroyChart(chartInst) {
  if (chartInst) chartInst.destroy();
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3200);
}

function updateLastUpdated() {
  const now = new Date();
  document.getElementById("lastUpdated").textContent =
    `Live · ${now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
}

async function loadSentiment() {
  try {
    const res = await fetch(`${API}/market-sentiment`);
    const data = await res.json();
    const el = document.getElementById("sentimentBadge");
    if (el) {
      el.textContent = `Market: ${data.sentiment} (${data.score})`;
      el.style.display = "inline-block";
      if (data.score > 55) el.style.color = "var(--green)";
      else if (data.score < 45) el.style.color = "var(--red)";
      else el.style.color = "var(--yellow)";
    }
  } catch (e) {}
}

// INTERNSHIP SHOWCASE
function showSystemInfo() {
  document.getElementById("archModal").style.display = "block";
}
function closeModal() {
  document.getElementById("archModal").style.display = "none";
}
window.onclick = function(event) {
  const modal = document.getElementById("archModal");
  if (event.target == modal) closeModal();
}

// ─── START ─────────────────────────────────────────────────────
init();
