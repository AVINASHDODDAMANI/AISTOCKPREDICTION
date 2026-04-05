const API_BASE = "";

const elements = {
  symbol: document.getElementById("symbol"),
  sectorFilter: document.getElementById("sectorFilter"),
  chartInterval: document.getElementById("chartInterval"),
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
  timingGrid: document.getElementById("timingGrid"),
  outlookSummary: document.getElementById("outlookSummary"),
  outlookList: document.getElementById("outlookList"),
  searchSuggestions: document.getElementById("searchSuggestions"),
};

let activeSuggestions = [];
const viewState = {
  symbol: "",
  analysis: null,
  news: null,
  timing: null,
};

function chartParams(interval) {
  if (interval === "5m") return { period: "5d", interval: "5m", label: "5 minute candles" };
  if (interval === "10m") return { period: "5d", interval: "5m", label: "10 minute timing view" };
  if (interval === "30m") return { period: "1mo", interval: "30m", label: "30 minute candles" };
  return { period: "3mo", interval: "1d", label: "daily candles" };
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
  elements.timingGrid.innerHTML = `<div class="news-empty">Loading 5m, 10m, and 30m timing signals...</div>`;
  elements.outlookSummary.textContent = "Combining indicators, timing, and news to estimate what may happen next.";
  elements.outlookList.innerHTML = `<li>Building market-condition explanation...</li>`;
}

function renderAnalysis(data) {
  viewState.analysis = data;
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
  elements.timingGrid.innerHTML = `<div class="news-empty">${escapeHtml(message)}</div>`;
  elements.outlookSummary.textContent = message;
  elements.outlookList.innerHTML = `<li>${escapeHtml(message)}</li>`;
}

function renderNews(newsData) {
  viewState.news = newsData;
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

  renderOutlook();
}

function renderTiming(timingData) {
  viewState.timing = timingData;

  const timeframes = timingData && Array.isArray(timingData.timeframes) ? timingData.timeframes : [];
  if (timingData && timingData.error) {
    elements.timingGrid.innerHTML = `<div class="news-empty">${escapeHtml(timingData.error)}</div>`;
    renderOutlook();
    return;
  }

  if (!timeframes.length) {
    elements.timingGrid.innerHTML = `<div class="news-empty">No timing data available.</div>`;
    renderOutlook();
    return;
  }

  elements.timingGrid.innerHTML = timeframes
    .map(
      (item) => `
        <article class="metric-card timing-card">
          <span>${escapeHtml(item.window)}</span>
          <strong class="${signalClass(item.signal)}-text">${escapeHtml(item.signal)}</strong>
          <p class="summary">${escapeHtml(item.summary)}</p>
          <span>${escapeHtml(String(item.confidence))}% confidence</span>
        </article>
      `
    )
    .join("");

  renderOutlook();
}

function renderOutlook() {
  const analysis = viewState.analysis;
  const news = viewState.news;
  const timing = viewState.timing;

  if (!analysis) return;

  const outlookPoints = [];
  let nextMove = "The market looks mixed right now.";

  if (analysis.signal && analysis.signal.includes("BUY")) {
    nextMove = "The current structure suggests upward continuation if buyers hold above nearby support.";
  } else if (analysis.signal && analysis.signal.includes("SELL")) {
    nextMove = "The current structure suggests downside pressure unless price quickly regains resistance.";
  } else {
    nextMove = "The market is likely to stay range-bound until a stronger breakout or breakdown appears.";
  }

  if (analysis.rsi !== null && analysis.rsi !== undefined) {
    if (analysis.rsi > 70) {
      outlookPoints.push("RSI is high, so even in an uptrend the next move may include profit-booking or a pullback.");
    } else if (analysis.rsi < 35) {
      outlookPoints.push("RSI is near oversold territory, so the market may attempt a bounce if selling weakens.");
    } else {
      outlookPoints.push("RSI is in a moderate zone, which supports trend continuation more than extreme reversal.");
    }
  }

  if (analysis.momentum_5d !== null && analysis.momentum_5d !== undefined) {
    if (analysis.momentum_5d > 2) {
      outlookPoints.push("Short-term momentum is positive, which supports bullish continuation while higher lows remain intact.");
    } else if (analysis.momentum_5d < -2) {
      outlookPoints.push("Short-term momentum is negative, which keeps downside risk active unless price stabilizes.");
    } else {
      outlookPoints.push("Momentum is soft, which suggests consolidation rather than a decisive move.");
    }
  }

  if (timing && Array.isArray(timing.timeframes) && timing.timeframes.length) {
    const bullishCount = timing.timeframes.filter((item) => item.signal === "BULLISH").length;
    const bearishCount = timing.timeframes.filter((item) => item.signal === "BEARISH").length;

    if (bullishCount >= 2) {
      outlookPoints.push("Most intraday timeframes are bullish, so the near-term bias favors upward candles over the next few sessions or intervals.");
    } else if (bearishCount >= 2) {
      outlookPoints.push("Most intraday timeframes are bearish, so the near-term bias favors selling pressure and weak pullbacks.");
    } else {
      outlookPoints.push("Intraday timeframes are mixed, which means market conditions are choppy and confirmation is still needed.");
    }
  }

  if (news && news.overall_sentiment) {
    if (String(news.overall_sentiment).toUpperCase() === "POSITIVE") {
      outlookPoints.push("News sentiment is positive, which can strengthen bullish follow-through if price action confirms it.");
    } else if (String(news.overall_sentiment).toUpperCase() === "NEGATIVE") {
      outlookPoints.push("News sentiment is negative, which can increase the chance of weakness or failed rallies.");
    } else {
      outlookPoints.push("News sentiment is neutral, so price structure matters more than headlines right now.");
    }
  }

  if (analysis.volatility !== null && analysis.volatility !== undefined && analysis.volatility > 5) {
    outlookPoints.push("Volatility is elevated, so the next move may be sharp and risk management matters more than prediction confidence.");
  }

  elements.outlookSummary.textContent = nextMove;
  elements.outlookList.innerHTML = outlookPoints.map((point) => `<li>${escapeHtml(point)}</li>`).join("");
}

function renderChart(historyData) {
  const points = historyData && Array.isArray(historyData.points) ? historyData.points : [];
  const selected = chartParams(elements.chartInterval ? elements.chartInterval.value : "1d");
  elements.chartMeta.textContent = `Last ${points.length || 0} ${selected.label}`;

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
  const labelIndexes = [
    0,
    Math.max(0, Math.floor(points.length / 2)),
    Math.max(0, points.length - 1),
  ];

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

  const timeLabels = labelIndexes
    .map((index) => {
      const x = paddingX + index * candleSlot + candleSlot / 2;
      const label = points[index] ? points[index].date : "";
      return `
        <text x="${x}" y="${height - 2}" text-anchor="middle" class="time-label">${label}</text>
      `;
    })
    .join("");

  const hoverPayload = escapeHtml(
    JSON.stringify(
      points.map((point, index) => ({
        index,
        x: paddingX + index * candleSlot + candleSlot / 2,
        open: Number(point.open),
        high: Number(point.high),
        low: Number(point.low),
        close: Number(point.close),
        date: point.date,
      }))
    )
  );

  const latestPrice = Number(points[points.length - 1].close);
  const firstPrice = Number(points[0].close);
  const latestDate = points[points.length - 1].date;

  elements.chartContainer.innerHTML = `
    <div class="chart-interactive">
    <svg viewBox="0 0 ${width} ${height}" class="price-chart candlestick-chart" preserveAspectRatio="none" aria-label="Stock candlestick chart" data-points="${hoverPayload}">
      <g class="chart-grid">
        <line x1="${paddingX}" y1="${paddingY}" x2="${paddingX}" y2="${height - paddingY}" class="grid-line"></line>
        <line x1="${paddingX}" y1="${height - paddingY}" x2="${width - paddingX}" y2="${height - paddingY}" class="grid-line"></line>
      </g>
      ${candleMarkup}
      ${timeLabels}
      <line x1="${paddingX}" y1="${paddingY}" x2="${paddingX}" y2="${height - paddingY}" class="hover-line" id="chartHoverLine"></line>
      <rect x="${paddingX}" y="${paddingY}" width="${plotWidth}" height="${plotHeight}" class="chart-hitbox" id="chartHitbox"></rect>
    </svg>
    <div class="chart-tooltip" id="chartTooltip">Move over a candle</div>
    </div>
    <div class="chart-footer">
      <span>Start: ${formatCurrency(firstPrice)}</span>
      <span>Latest: ${formatCurrency(latestPrice)}</span>
      <span>${escapeHtml(latestDate)}</span>
    </div>
  `;

  const svg = elements.chartContainer.querySelector(".candlestick-chart");
  const hitbox = elements.chartContainer.querySelector("#chartHitbox");
  const hoverLine = elements.chartContainer.querySelector("#chartHoverLine");
  const tooltip = elements.chartContainer.querySelector("#chartTooltip");
  const chartPoints = JSON.parse(svg.getAttribute("data-points") || "[]");

  function updateHover(clientX) {
    const bounds = svg.getBoundingClientRect();
    const relativeX = ((clientX - bounds.left) / bounds.width) * width;
    let nearest = chartPoints[0];

    chartPoints.forEach((point) => {
      if (Math.abs(point.x - relativeX) < Math.abs(nearest.x - relativeX)) {
        nearest = point;
      }
    });

    if (!nearest) return;

    hoverLine.setAttribute("x1", nearest.x);
    hoverLine.setAttribute("x2", nearest.x);
    hoverLine.classList.add("visible");
    tooltip.classList.add("visible");
    tooltip.innerHTML = `
      <strong>${escapeHtml(nearest.date)}</strong><br>
      O: ${formatCurrency(nearest.open)}<br>
      H: ${formatCurrency(nearest.high)}<br>
      L: ${formatCurrency(nearest.low)}<br>
      C: ${formatCurrency(nearest.close)}
    `;
  }

  hitbox.addEventListener("mousemove", (event) => {
    updateHover(event.clientX);
  });

  hitbox.addEventListener("mouseenter", (event) => {
    updateHover(event.clientX);
  });

  hitbox.addEventListener("mouseleave", () => {
    hoverLine.classList.remove("visible");
    tooltip.classList.remove("visible");
  });
}

async function loadChart(symbol) {
  const selected = chartParams(elements.chartInterval ? elements.chartInterval.value : "1d");
  let requestInterval = selected.interval;
  let requestPeriod = selected.period;

  if (elements.chartInterval && elements.chartInterval.value === "10m") {
    requestInterval = "5m";
    requestPeriod = "5d";
  }

  try {
    const response = await fetch(
      `${API_BASE}/history?symbol=${encodeURIComponent(symbol)}&period=${encodeURIComponent(requestPeriod)}&interval=${encodeURIComponent(requestInterval)}`
    );
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }
    const data = await response.json();
    if (elements.chartInterval && elements.chartInterval.value === "10m" && Array.isArray(data.points)) {
      const grouped = [];
      for (let index = 0; index < data.points.length; index += 2) {
        const chunk = data.points.slice(index, index + 2);
        if (!chunk.length) continue;
        grouped.push({
          date: chunk[chunk.length - 1].date,
          open: chunk[0].open,
          high: Math.max.apply(null, chunk.map((item) => Number(item.high))),
          low: Math.min.apply(null, chunk.map((item) => Number(item.low))),
          close: chunk[chunk.length - 1].close,
          volume: chunk.reduce((sum, item) => sum + Number(item.volume || 0), 0),
        });
      }
      data.points = grouped;
    }
    renderChart(data);
  } catch (error) {
    console.error(error);
    elements.chartContainer.innerHTML = `<div class="chart-empty">Price history could not be loaded from the API.</div>`;
  }
}

async function loadTiming(symbol) {
  try {
    const response = await fetch(`${API_BASE}/timing?symbol=${encodeURIComponent(symbol)}`);
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }
    const data = await response.json();
    renderTiming(data);
  } catch (error) {
    console.error(error);
    elements.timingGrid.innerHTML = `<div class="news-empty">Timing data could not be loaded.</div>`;
    renderOutlook();
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
    viewState.symbol = data.company_symbol || query;
    elements.symbol.value = data.company_name || data.company_symbol || query;
    renderAnalysis(data);
    loadChart(data.company_symbol || query);
    loadNews(data.company_symbol || query);
    loadTiming(data.company_symbol || query);
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

if (elements.chartInterval) {
  elements.chartInterval.addEventListener("change", () => {
    if (viewState.symbol) {
      loadChart(viewState.symbol);
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
