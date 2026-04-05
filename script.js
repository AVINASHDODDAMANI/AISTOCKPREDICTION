const API_BASE = "";

const elements = {
  symbol: document.getElementById("symbol"),
  analyzeBtn: document.getElementById("analyzeBtn"),
  refreshOverview: document.getElementById("refreshOverview"),
  reportTitle: document.getElementById("reportTitle"),
  summaryText: document.getElementById("summaryText"),
  signalBadge: document.getElementById("signalBadge"),
  currentPrice: document.getElementById("currentPrice"),
  trendValue: document.getElementById("trendValue"),
  confidenceValue: document.getElementById("confidenceValue"),
  rsiValue: document.getElementById("rsiValue"),
  momentumValue: document.getElementById("momentumValue"),
  volatilityValue: document.getElementById("volatilityValue"),
  entryValue: document.getElementById("entryValue"),
  targetValue: document.getElementById("targetValue"),
  stopValue: document.getElementById("stopValue"),
  reasonsList: document.getElementById("reasonsList"),
  timestampText: document.getElementById("timestampText"),
  disclaimerText: document.getElementById("disclaimerText"),
  watchlistGrid: document.getElementById("watchlistGrid"),
  chartContainer: document.getElementById("chartContainer"),
  chartMeta: document.getElementById("chartMeta"),
  newsSentimentBadge: document.getElementById("newsSentimentBadge"),
  newsSummary: document.getElementById("newsSummary"),
  newsList: document.getElementById("newsList"),
};

function normalizeSymbol(symbol) {
  return symbol.replace(".NS", "").trim().toUpperCase();
}

function formatCurrency(value) {
  if (value === null || value === undefined) return "--";
  return `Rs ${Number(value).toFixed(2)}`;
}

function formatPercent(value) {
  if (value === null || value === undefined) return "--";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${Number(value).toFixed(2)}%`;
}

function signalClass(signal) {
  const clean = (signal || "").toUpperCase();
  if (clean.includes("BUY")) return "bullish";
  if (clean.includes("SELL")) return "bearish";
  return "neutral";
}

function setLoadingState() {
  elements.reportTitle.textContent = "Analyzing...";
  elements.summaryText.textContent = "Pulling price action, momentum, and indicator data from the API.";
  elements.signalBadge.textContent = "LOADING";
  elements.signalBadge.className = "signal-badge neutral";
  elements.chartContainer.innerHTML = `<div class="chart-empty">Loading price history...</div>`;
  elements.newsSentimentBadge.textContent = "LOADING";
  elements.newsSentimentBadge.className = "signal-badge neutral";
  elements.newsSummary.textContent = "Loading recent headlines and sentiment...";
  elements.newsList.innerHTML = `<div class="news-empty">Fetching stock news...</div>`;
}

function renderAnalysis(data) {
  elements.reportTitle.textContent = `${data.company_symbol} Analysis`;
  elements.summaryText.textContent = data.summary || "No summary available.";
  elements.signalBadge.textContent = data.signal || "NO SIGNAL";
  elements.signalBadge.className = `signal-badge ${signalClass(data.signal)}`;

  elements.currentPrice.textContent = formatCurrency(data.current_price);
  elements.trendValue.textContent = data.trend || "--";
  elements.confidenceValue.textContent =
    data.confidence !== null && data.confidence !== undefined ? `${data.confidence}%` : "--";
  elements.rsiValue.textContent = data.rsi ?? "--";
  elements.momentumValue.textContent = formatPercent(data.momentum_5d);
  elements.volatilityValue.textContent = formatPercent(data.volatility);
  elements.entryValue.textContent = formatCurrency(data.entry_zone);
  elements.targetValue.textContent = formatCurrency(data.target_price);
  elements.stopValue.textContent = formatCurrency(data.stop_loss);
  elements.timestampText.textContent = `Last update: ${data.date_time_ist || "--"} IST`;
  elements.disclaimerText.textContent =
    data.disclaimer || "This dashboard is for education and research only.";

  const reasons = Array.isArray(data.reasons) && data.reasons.length > 0
    ? data.reasons
    : ["No indicator explanation was returned."];

  elements.reasonsList.innerHTML = reasons
    .map((reason) => `<li>${reason}</li>`)
    .join("");
}

function renderError(message) {
  elements.reportTitle.textContent = "Analysis unavailable";
  elements.summaryText.textContent = message;
  elements.signalBadge.textContent = "ERROR";
  elements.signalBadge.className = "signal-badge bearish";
  elements.chartContainer.innerHTML = `<div class="chart-empty">${message}</div>`;
  elements.newsSentimentBadge.textContent = "ERROR";
  elements.newsSentimentBadge.className = "signal-badge bearish";
  elements.newsSummary.textContent = message;
  elements.newsList.innerHTML = `<div class="news-empty">${message}</div>`;
}

function renderNews(newsData) {
  const articles = Array.isArray(newsData?.articles) ? newsData.articles : [];
  const overall = newsData?.overall_sentiment || "Unavailable";
  elements.newsSentimentBadge.textContent = overall.toUpperCase();
  elements.newsSentimentBadge.className = `signal-badge ${signalClass(overall)}`;

  if (newsData?.error) {
    elements.newsSummary.textContent = "News feed could not be loaded for this stock.";
    elements.newsList.innerHTML = `<div class="news-empty">${newsData.error}</div>`;
    return;
  }

  elements.newsSummary.textContent =
    `Recent headlines look ${overall.toLowerCase()} with a combined sentiment score of ${newsData.sentiment_score}.`;

  if (!articles.length) {
    elements.newsList.innerHTML = `<div class="news-empty">No recent headlines were found.</div>`;
    return;
  }

  elements.newsList.innerHTML = articles
    .map(
      (article) => `
        <article class="news-card">
          <div class="news-card-top">
            <span class="news-pill ${signalClass(article.sentiment)}">${article.sentiment}</span>
            <span class="news-date">${article.published_at || "Unknown date"}</span>
          </div>
          <a href="${article.link}" target="_blank" rel="noreferrer" class="news-link">${article.title}</a>
        </article>
      `
    )
    .join("");
}

function renderChart(historyData) {
  const points = Array.isArray(historyData?.points) ? historyData.points : [];
  elements.chartMeta.textContent = `Last ${points.length || 0} trading sessions`;

  if (!points.length) {
    elements.chartContainer.innerHTML = `<div class="chart-empty">No chart data available for this stock.</div>`;
    return;
  }

  const closes = points.map((point) => Number(point.close));
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const width = 760;
  const height = 260;
  const padding = 20;
  const range = max - min || 1;

  const polyline = closes
    .map((value, index) => {
      const x = padding + (index * (width - padding * 2)) / Math.max(closes.length - 1, 1);
      const y = height - padding - ((value - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  const gradientId = "priceGradient";
  const latestPrice = closes[closes.length - 1];
  const firstPrice = closes[0];
  const directionClass = latestPrice >= firstPrice ? "up" : "down";
  const latestDate = points[points.length - 1].date;

  elements.chartContainer.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" class="price-chart ${directionClass}" preserveAspectRatio="none" aria-label="Stock price trend chart">
      <defs>
        <linearGradient id="${gradientId}" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="rgba(31, 191, 117, 0.40)"></stop>
          <stop offset="100%" stop-color="rgba(31, 191, 117, 0.02)"></stop>
        </linearGradient>
      </defs>
      <polyline points="${polyline} ${width - padding},${height - padding} ${padding},${height - padding}" fill="url(#${gradientId})" class="price-area"></polyline>
      <polyline points="${polyline}" fill="none" class="price-line"></polyline>
    </svg>
    <div class="chart-footer">
      <span>Start: ${formatCurrency(firstPrice)}</span>
      <span>Latest: ${formatCurrency(latestPrice)}</span>
      <span>${latestDate}</span>
    </div>
  `;
}

async function loadChart(symbol) {
  try {
    const response = await fetch(`${API_BASE}/history?symbol=${encodeURIComponent(symbol)}`);
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }
    const data = await response.json();
    renderChart(data);
  } catch (error) {
    console.error(error);
    elements.chartContainer.innerHTML = `
      <div class="chart-empty">Price history could not be loaded from the API.</div>
    `;
  }
}

async function loadNews(symbol) {
  try {
    const response = await fetch(`${API_BASE}/news?symbol=${encodeURIComponent(symbol)}`);
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }
    const data = await response.json();
    renderNews(data);
  } catch (error) {
    console.error(error);
    elements.newsSentimentBadge.textContent = "ERROR";
    elements.newsSentimentBadge.className = "signal-badge bearish";
    elements.newsSummary.textContent = "Stock news could not be loaded.";
    elements.newsList.innerHTML = `<div class="news-empty">Unable to fetch recent stock headlines.</div>`;
  }
}

async function analyzeStock(symbolOverride) {
  const rawValue = symbolOverride || elements.symbol.value;
  const symbol = normalizeSymbol(rawValue);

  if (!symbol) {
    renderError("Enter a valid NSE symbol like RELIANCE or TCS.");
    return;
  }

  elements.symbol.value = symbol;
  setLoadingState();

  try {
    const response = await fetch(`${API_BASE}/analyze?symbol=${encodeURIComponent(symbol)}`);
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const data = await response.json();
    renderAnalysis(data);
    loadChart(symbol);
    loadNews(symbol);
  } catch (error) {
    console.error(error);
    renderError("Could not connect to the API. Start the FastAPI server and try again.");
  }
}

function renderWatchlistCard(stock) {
  return `
    <article class="watch-card ${signalClass(stock.signal)}" data-symbol="${stock.company_symbol}">
      <div class="watch-card-top">
        <strong>${stock.company_symbol}</strong>
        <span>${stock.signal || "NO SIGNAL"}</span>
      </div>
      <p>${stock.trend || "Unavailable"} trend</p>
      <div class="watch-card-bottom">
        <span>${formatCurrency(stock.current_price)}</span>
        <span>${stock.confidence ? `${stock.confidence}% confidence` : "No confidence"}</span>
      </div>
    </article>
  `;
}

async function loadWatchlist() {
  elements.watchlistGrid.innerHTML = `<p class="watchlist-status">Loading watchlist...</p>`;

  try {
    const response = await fetch(`${API_BASE}/market-overview`);
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const data = await response.json();
    const stocks = Array.isArray(data.stocks) ? data.stocks : [];

    elements.watchlistGrid.innerHTML = stocks.map(renderWatchlistCard).join("");

    document.querySelectorAll(".watch-card").forEach((card) => {
      card.addEventListener("click", () => {
        analyzeStock(card.dataset.symbol);
      });
    });
  } catch (error) {
    console.error(error);
    elements.watchlistGrid.innerHTML = `
      <p class="watchlist-status">
        Watchlist could not load. Make sure the FastAPI backend is running on ${API_BASE}.
      </p>
    `;
  }
}

elements.analyzeBtn.addEventListener("click", () => analyzeStock());
elements.refreshOverview.addEventListener("click", loadWatchlist);

elements.symbol.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    analyzeStock();
  }
});

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    analyzeStock(chip.dataset.symbol);
  });
});

loadWatchlist();
