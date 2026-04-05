const API_BASE = "";

const elements = {
  symbol: document.getElementById("symbol"),
  sectorFilter: document.getElementById("sectorFilter"),
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
  searchSuggestions: document.getElementById("searchSuggestions"),
};

let activeSuggestions = [];

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
  const clean = String(signal || "").toUpperCase();
  if (clean.includes("BUY") || clean.includes("POSITIVE")) return "bullish";
  if (clean.includes("SELL") || clean.includes("NEGATIVE")) return "bearish";
  return "neutral";
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function selectedSector() {
  return elements.sectorFilter ? elements.sectorFilter.value : "";
}

function hideSuggestions() {
  activeSuggestions = [];
  elements.searchSuggestions.innerHTML = "";
  elements.searchSuggestions.classList.remove("visible");
}

function renderSectorOptions(sectors) {
  if (!elements.sectorFilter) return;

  const options = [`<option value="">All Sectors</option>`];
  (Array.isArray(sectors) ? sectors : []).forEach((sector) => {
    options.push(`<option value="${escapeHtml(sector)}">${escapeHtml(sector)}</option>`);
  });
  elements.sectorFilter.innerHTML = options.join("");
}

function renderSuggestions(results) {
  activeSuggestions = Array.isArray(results) ? results : [];

  if (!activeSuggestions.length) {
    hideSuggestions();
    return;
  }

  elements.searchSuggestions.innerHTML = activeSuggestions
    .map(
      (stock, index) => `
        <button class="suggestion-item" type="button" data-index="${index}">
          <span>
            <span class="suggestion-name">${escapeHtml(stock.name)}</span>
            <span class="suggestion-sector">${escapeHtml(stock.sector || "")}</span>
          </span>
          <span class="suggestion-symbol">${escapeHtml(stock.symbol)}</span>
        </button>
      `
    )
    .join("");

  elements.searchSuggestions.classList.add("visible");

  elements.searchSuggestions.querySelectorAll(".suggestion-item").forEach((item) => {
    item.addEventListener("click", () => {
      const stock = activeSuggestions[Number(item.dataset.index)];
      if (!stock) return;
      elements.symbol.value = stock.name;
      hideSuggestions();
      analyzeStock(stock.symbol);
    });
  });
}

async function loadSuggestions(query) {
  const trimmed = query.trim();
  if (!trimmed) {
    hideSuggestions();
    return;
  }

  const sector = selectedSector();
  const url = `${API_BASE}/search-stocks?q=${encodeURIComponent(trimmed)}&sector=${encodeURIComponent(sector)}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const data = await response.json();
    renderSectorOptions(data.sectors || []);
    if (elements.sectorFilter && sector) {
      elements.sectorFilter.value = sector;
    }
    renderSuggestions(data.results || []);
  } catch (error) {
    console.error(error);
    hideSuggestions();
  }
}

async function loadSectors() {
  try {
    const response = await fetch(`${API_BASE}/sectors`);
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const data = await response.json();
    renderSectorOptions(data.sectors || []);
  } catch (error) {
    console.error(error);
  }
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
  const heading = data.company_name
    ? `${data.company_name} (${data.company_symbol})`
    : `${data.company_symbol} Analysis`;

  elements.reportTitle.textContent = heading;
  elements.summaryText.textContent = data.summary || "No summary available.";
  elements.signalBadge.textContent = data.signal || "NO SIGNAL";
  elements.signalBadge.className = `signal-badge ${signalClass(data.signal)}`;

  elements.currentPrice.textContent = formatCurrency(data.current_price);
  elements.trendValue.textContent = data.trend || "--";
  elements.confidenceValue.textContent =
    data.confidence !== null && data.confidence !== undefined ? `${data.confidence}%` : "--";
  elements.rsiValue.textContent =
    data.rsi !== null && data.rsi !== undefined ? data.rsi : "--";
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

  elements.reasonsList.innerHTML = reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("");
}

function renderError(message) {
  elements.reportTitle.textContent = "Analysis unavailable";
  elements.summaryText.textContent = message;
  elements.signalBadge.textContent = "ERROR";
  elements.signalBadge.className = "signal-badge bearish";
  elements.chartContainer.innerHTML = `<div class="chart-empty">${escapeHtml(message)}</div>`;
  elements.newsSentimentBadge.textContent = "ERROR";
  elements.newsSentimentBadge.className = "signal-badge bearish";
  elements.newsSummary.textContent = message;
  elements.newsList.innerHTML = `<div class="news-empty">${escapeHtml(message)}</div>`;
}

function renderNews(newsData) {
  const articles = newsData && Array.isArray(newsData.articles) ? newsData.articles : [];
  const overall = newsData && newsData.overall_sentiment ? newsData.overall_sentiment : "Unavailable";
  elements.newsSentimentBadge.textContent = overall.toUpperCase();
  elements.newsSentimentBadge.className = `signal-badge ${signalClass(overall)}`;

  if (newsData && newsData.error) {
    elements.newsSummary.textContent = "News feed could not be loaded for this stock.";
    elements.newsList.innerHTML = `<div class="news-empty">${escapeHtml(newsData.error)}</div>`;
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
            <span class="news-pill ${signalClass(article.sentiment)}">${escapeHtml(article.sentiment)}</span>
            <span class="news-date">${escapeHtml(article.published_at || "Unknown date")}</span>
          </div>
          <a href="${article.link}" target="_blank" rel="noreferrer" class="news-link">${escapeHtml(article.title)}</a>
        </article>
      `
    )
    .join("");
}

function renderChart(historyData) {
  const points = historyData && Array.isArray(historyData.points) ? historyData.points : [];
  elements.chartMeta.textContent = `Last ${points.length || 0} trading sessions`;

  if (!points.length) {
    elements.chartContainer.innerHTML = `<div class="chart-empty">No chart data available for this stock.</div>`;
    return;
  }

  const lows = points.map((point) => Number(point.low));
  const highs = points.map((point) => Number(point.high));
  const min = Math.min.apply(null, lows);
  const max = Math.max.apply(null, highs);
  const width = 760;
  const height = 260;
  const paddingX = 18;
  const paddingY = 18;
  const range = max - min || 1;
  const plotWidth = width - paddingX * 2;
  const plotHeight = height - paddingY * 2;
  const candleSlot = plotWidth / Math.max(points.length, 1);
  const candleWidth = Math.max(4, Math.min(10, candleSlot * 0.55));

  function scaleY(value) {
    return height - paddingY - ((value - min) / range) * plotHeight;
  }

  const candleMarkup = points
    .map((point, index) => {
      const open = Number(point.open);
      const high = Number(point.high);
      const low = Number(point.low);
      const close = Number(point.close);
      const xCenter = paddingX + index * candleSlot + candleSlot / 2;
      const openY = scaleY(open);
      const closeY = scaleY(close);
      const highY = scaleY(high);
      const lowY = scaleY(low);
      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.max(2, Math.abs(closeY - openY));
      const candleClass = close >= open ? "bull" : "bear";

      return `
        <g class="candle ${candleClass}">
          <line x1="${xCenter}" y1="${highY}" x2="${xCenter}" y2="${lowY}" class="candle-wick"></line>
          <rect x="${xCenter - candleWidth / 2}" y="${bodyTop}" width="${candleWidth}" height="${bodyHeight}" rx="1.5" class="candle-body"></rect>
        </g>
      `;
    })
    .join("");

  const latestPrice = Number(points[points.length - 1].close);
  const firstPrice = Number(points[0].close);
  const latestDate = points[points.length - 1].date;

  elements.chartContainer.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" class="price-chart candlestick-chart" preserveAspectRatio="none" aria-label="Stock candlestick chart">
      <g class="chart-grid">
        <line x1="${paddingX}" y1="${paddingY}" x2="${paddingX}" y2="${height - paddingY}" class="grid-line"></line>
        <line x1="${paddingX}" y1="${height - paddingY}" x2="${width - paddingX}" y2="${height - paddingY}" class="grid-line"></line>
      </g>
      ${candleMarkup}
    </svg>
    <div class="chart-footer">
      <span>Start: ${formatCurrency(firstPrice)}</span>
      <span>Latest: ${formatCurrency(latestPrice)}</span>
      <span>${escapeHtml(latestDate)}</span>
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
    elements.chartContainer.innerHTML = `<div class="chart-empty">Price history could not be loaded from the API.</div>`;
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

async function analyzeStock(queryOverride) {
  const rawValue = queryOverride || elements.symbol.value;
  const query = rawValue.trim();

  if (!query) {
    renderError("Enter a valid NSE symbol or company name like RELIANCE or Infosys.");
    return;
  }

  hideSuggestions();
  elements.symbol.value = query;
  setLoadingState();

  try {
    const response = await fetch(`${API_BASE}/analyze?symbol=${encodeURIComponent(query)}`);
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const data = await response.json();
    elements.symbol.value = data.company_name || data.company_symbol || query;
    renderAnalysis(data);
    loadChart(data.company_symbol || query);
    loadNews(data.company_symbol || query);
  } catch (error) {
    console.error(error);
    renderError("Could not connect to the API. Please try again in a moment.");
  }
}

function renderWatchlistCard(stock) {
  return `
    <article class="watch-card ${signalClass(stock.signal)}" data-symbol="${stock.company_symbol}">
      <div class="watch-card-top">
        <strong>${escapeHtml(stock.company_symbol)}</strong>
        <span>${escapeHtml(stock.signal || "NO SIGNAL")}</span>
      </div>
      <p>${escapeHtml(stock.company_name || stock.company_symbol || "Unknown stock")}</p>
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
        Watchlist could not load right now. Please refresh in a moment.
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

elements.symbol.addEventListener("input", (event) => {
  loadSuggestions(event.target.value);
});

if (elements.sectorFilter) {
  elements.sectorFilter.addEventListener("change", () => {
    if (elements.symbol.value.trim()) {
      loadSuggestions(elements.symbol.value);
    }
  });
}

document.addEventListener("click", (event) => {
  const searchBox = document.querySelector(".search-box");
  if (searchBox && !searchBox.contains(event.target)) {
    hideSuggestions();
  }
});

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    analyzeStock(chip.dataset.symbol);
  });
});

loadSectors();
loadWatchlist();
