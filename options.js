const API_BASE = "";

const elements = {
  symbol: document.getElementById("optionsSymbol"),
  loadBtn: document.getElementById("loadOptionsBtn"),
  suggestions: document.getElementById("optionsSuggestions"),
  expiry: document.getElementById("optionsExpiry"),
  title: document.getElementById("optionsTitle"),
  instrumentType: document.getElementById("optionsInstrumentType"),
  summary: document.getElementById("optionsSummary"),
  underlyingPrice: document.getElementById("underlyingPrice"),
  selectedExpiry: document.getElementById("selectedExpiry"),
  generatedAt: document.getElementById("optionsGeneratedAt"),
  timingGrid: document.getElementById("timingGrid"),
  callsTable: document.getElementById("callsTable"),
  putsTable: document.getElementById("putsTable"),
};

let activeSuggestions = [];
let currentSymbol = "";

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatCurrency(value) {
  if (value === null || value === undefined) return "--";
  return `Rs ${Number(value).toFixed(2)}`;
}

function signalClass(signal) {
  const clean = String(signal || "").toUpperCase();
  if (clean.includes("BULLISH") || clean.includes("BUY") || clean.includes("POSITIVE")) return "bullish";
  if (clean.includes("BEARISH") || clean.includes("SELL") || clean.includes("NEGATIVE")) return "bearish";
  return "neutral";
}

function hideSuggestions() {
  activeSuggestions = [];
  elements.suggestions.innerHTML = "";
  elements.suggestions.classList.remove("visible");
}

function renderSuggestions(results) {
  activeSuggestions = Array.isArray(results) ? results : [];

  if (!activeSuggestions.length) {
    hideSuggestions();
    return;
  }

  elements.suggestions.innerHTML = activeSuggestions
    .map(
      (item, index) => `
        <button type="button" class="suggestion-item" data-index="${index}">
          <span>
            <span class="suggestion-name">${escapeHtml(item.name)}</span>
            <span class="suggestion-sector">${escapeHtml(item.sector || item.instrument_type || "")}</span>
          </span>
          <span class="suggestion-symbol">${escapeHtml(item.symbol)}</span>
        </button>
      `
    )
    .join("");

  elements.suggestions.classList.add("visible");

  elements.suggestions.querySelectorAll(".suggestion-item").forEach((button) => {
    button.addEventListener("click", () => {
      const stock = activeSuggestions[Number(button.dataset.index)];
      if (!stock) return;
      elements.symbol.value = stock.symbol;
      hideSuggestions();
      loadOptions(stock.symbol);
    });
  });
}

async function loadSuggestions(query) {
  const trimmed = query.trim();
  if (!trimmed) {
    hideSuggestions();
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/search-stocks?q=${encodeURIComponent(trimmed)}`);
    if (!response.ok) throw new Error("Suggestion load failed");
    const data = await response.json();
    renderSuggestions(data.results || []);
  } catch (error) {
    console.error(error);
    hideSuggestions();
  }
}

function renderTiming(data) {
  const timeframes = data && Array.isArray(data.timeframes) ? data.timeframes : [];

  if (data && data.error) {
    elements.timingGrid.innerHTML = `<div class="news-empty">${escapeHtml(data.error)}</div>`;
    return;
  }

  if (!timeframes.length) {
    elements.timingGrid.innerHTML = `<div class="news-empty">No timing data available.</div>`;
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
}

function renderRows(rows, target) {
  if (!Array.isArray(rows) || !rows.length) {
    target.innerHTML = `<tr><td colspan="7">No contracts available.</td></tr>`;
    return;
  }

  target.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.strike)}</td>
          <td>${escapeHtml(row.lastPrice)}</td>
          <td>${escapeHtml(row.bid)}</td>
          <td>${escapeHtml(row.ask)}</td>
          <td>${escapeHtml(row.volume)}</td>
          <td>${escapeHtml(row.openInterest)}</td>
          <td>${escapeHtml(row.impliedVolatility)}</td>
        </tr>
      `
    )
    .join("");
}

function populateExpiry(expiries, selected) {
  const list = Array.isArray(expiries) ? expiries : [];
  const options = list.length
    ? list.map((expiry) => `<option value="${escapeHtml(expiry)}">${escapeHtml(expiry)}</option>`)
    : [`<option value="">No expiry available</option>`];

  elements.expiry.innerHTML = options.join("");
  if (selected) {
    elements.expiry.value = selected;
  }
}

async function loadOptions(symbolOverride, expiryOverride) {
  const symbol = (symbolOverride || elements.symbol.value).trim();
  if (!symbol) return;

  currentSymbol = symbol;
  elements.title.textContent = "Loading options...";
  elements.summary.textContent = "Fetching options chain and timing analysis.";

  const expiry = typeof expiryOverride === "string" ? expiryOverride : elements.expiry.value;
  const url = `${API_BASE}/options-chain?symbol=${encodeURIComponent(symbol)}&expiry=${encodeURIComponent(expiry || "")}`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Server returned ${response.status}`);
    const data = await response.json();

    elements.title.textContent = `${data.company_name || symbol} (${data.stock || symbol})`;
    elements.instrumentType.textContent = data.stock && String(data.stock).includes("FUT") ? "FUTURES" : "OPTIONS";
    elements.instrumentType.className = "signal-badge neutral";
    elements.summary.textContent = data.error
      ? data.error
      : "Calls and puts shown near the current underlying price.";
    elements.underlyingPrice.textContent = formatCurrency(data.underlying_price);
    elements.selectedExpiry.textContent = data.selected_expiry || "--";
    elements.generatedAt.textContent = data.generated_at_ist || "--";

    populateExpiry(data.expiries, data.selected_expiry);
    renderRows(data.calls, elements.callsTable);
    renderRows(data.puts, elements.putsTable);
    renderTiming(data.timing || {});
  } catch (error) {
    console.error(error);
    elements.title.textContent = "Options unavailable";
    elements.summary.textContent = "Could not load options data right now.";
    renderRows([], elements.callsTable);
    renderRows([], elements.putsTable);
    elements.timingGrid.innerHTML = `<div class="news-empty">Timing data could not be loaded.</div>`;
  }
}

elements.loadBtn.addEventListener("click", () => loadOptions());
elements.symbol.addEventListener("input", (event) => loadSuggestions(event.target.value));
elements.symbol.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    loadOptions();
  }
});

elements.expiry.addEventListener("change", () => {
  if (currentSymbol) {
    loadOptions(currentSymbol, elements.expiry.value);
  }
});

document.addEventListener("click", (event) => {
  const searchBox = document.querySelector(".search-box");
  if (searchBox && !searchBox.contains(event.target)) {
    hideSuggestions();
  }
});
