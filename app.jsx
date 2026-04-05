const { useEffect, useMemo, useRef, useState } = React;

const API = {
  meta: "/api/meta",
  search: "/api/search",
  dashboard: (symbol, timeframe) => `/api/dashboard/${encodeURIComponent(symbol)}?timeframe=${encodeURIComponent(timeframe)}`,
  compare: (symbols, timeframe) => `/api/compare?symbols=${encodeURIComponent(symbols.join(","))}&timeframe=${encodeURIComponent(timeframe)}`,
  watchlist: (timeframe) => `/api/watchlist?timeframe=${encodeURIComponent(timeframe)}`,
  addWatchlist: "/api/watchlist",
  deleteWatchlist: (symbol) => `/api/watchlist/${encodeURIComponent(symbol)}`,
};

const TIMEFRAME_OPTIONS = [
  { value: "5m", label: "5m" },
  { value: "15m", label: "15m" },
  { value: "1h", label: "1h" },
  { value: "1d", label: "1D" },
];

function formatCurrency(value) {
  if (value === null || value === undefined) return "--";
  return `Rs ${Number(value).toFixed(2)}`;
}

function formatPercent(value) {
  if (value === null || value === undefined) return "--";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${Number(value).toFixed(2)}%`;
}

function signalTone(signal) {
  const clean = String(signal || "").toUpperCase();
  if (clean.includes("BUY") || clean.includes("BULLISH") || clean.includes("POSITIVE")) return "bull";
  if (clean.includes("SELL") || clean.includes("BEARISH") || clean.includes("NEGATIVE")) return "bear";
  return "neutral";
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let detail = `Request failed with ${response.status}`;
    try {
      const payload = await response.json();
      if (payload.detail) detail = payload.detail;
    } catch (_) {}
    throw new Error(detail);
  }
  return response.json();
}

function CandlestickChart({ chart }) {
  const hostRef = useRef(null);

  useEffect(() => {
    if (!hostRef.current || !chart || !chart.candles || !chart.candles.length) return;

    if (!window.LightweightCharts || !window.LightweightCharts.createChart) {
      hostRef.current.innerHTML = '<div class="chart-placeholder">Chart library failed to load.</div>';
      return;
    }

    let lc = null;
    let observer = null;

    try {
      hostRef.current.innerHTML = "";
      lc = window.LightweightCharts.createChart(hostRef.current, {
        height: 420,
        layout: { backgroundColor: "transparent", textColor: "#c7d6ea" },
        grid: { vertLines: { color: "rgba(255,255,255,0.06)" }, horzLines: { color: "rgba(255,255,255,0.06)" } },
        crosshair: { mode: 1 },
        rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
        timeScale: { borderColor: "rgba(255,255,255,0.08)" },
      });

      const candleSeries = lc.addCandlestickSeries({
        upColor: "#21c17a",
        downColor: "#ff7575",
        borderVisible: false,
        wickUpColor: "#21c17a",
        wickDownColor: "#ff7575",
      });
      candleSeries.setData(chart.candles);

      const upper = lc.addLineSeries({ color: "#4da4ff", lineWidth: 2 });
      const middle = lc.addLineSeries({ color: "#ffd166", lineWidth: 2 });
      const lower = lc.addLineSeries({ color: "#ff8fab", lineWidth: 2 });
      upper.setData(chart.indicators.bollingerUpper || []);
      middle.setData(chart.indicators.bollingerMiddle || []);
      lower.setData(chart.indicators.bollingerLower || []);

      lc.timeScale().fitContent();
      observer = new ResizeObserver(() => {
        if (hostRef.current) {
          lc.applyOptions({ width: hostRef.current.clientWidth });
        }
      });
      observer.observe(hostRef.current);
    } catch (error) {
      console.error("Chart render failed", error);
      hostRef.current.innerHTML = '<div class="chart-placeholder">Chart could not be rendered for this symbol.</div>';
    }

    return () => {
      if (observer) observer.disconnect();
      if (lc) lc.remove();
    };
  }, [chart]);

  return <div className="tv-chart" ref={hostRef} />;
}

function MetricCard({ label, value, tone }) {
  return (
    <article className={`metric-card ${tone ? `metric-${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function App() {
  const [meta, setMeta] = useState({ sectors: [], watchlist: [] });
  const [query, setQuery] = useState("RELIANCE");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedTimeframe, setSelectedTimeframe] = useState("1d");
  const [dashboard, setDashboard] = useState(null);
  const [watchlist, setWatchlist] = useState([]);
  const [compareInputs, setCompareInputs] = useState(["RELIANCE", "TCS"]);
  const [compareResults, setCompareResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [error, setError] = useState("");
  const [watchlistInput, setWatchlistInput] = useState("");

  useEffect(() => {
    async function boot() {
      try {
        const metaPayload = await fetchJson(API.meta);
        setMeta(metaPayload);
        await Promise.all([
          loadDashboard(query, selectedTimeframe),
          loadWatchlist(selectedTimeframe),
          loadCompare(compareInputs, selectedTimeframe),
        ]);
      } catch (err) {
        setError(err.message);
      }
    }
    boot();
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const payload = await fetchJson(`${API.search}?q=${encodeURIComponent(query)}`);
        setSearchResults(payload.results || []);
      } catch (_) {}
    }, 180);
    return () => clearTimeout(handle);
  }, [query]);

  async function loadDashboard(symbol, timeframe) {
    setLoading(true);
    setError("");
    try {
      const payload = await fetchJson(API.dashboard(symbol, timeframe));
      setDashboard(payload);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadWatchlist(timeframe) {
    setWatchlistLoading(true);
    try {
      const payload = await fetchJson(API.watchlist(timeframe));
      setWatchlist(payload.items || []);
    } finally {
      setWatchlistLoading(false);
    }
  }

  async function loadCompare(symbols, timeframe) {
    setCompareLoading(true);
    try {
      const payload = await fetchJson(API.compare(symbols, timeframe));
      setCompareResults(payload.results || []);
    } catch (_) {
      setCompareResults([]);
    } finally {
      setCompareLoading(false);
    }
  }

  async function submitDashboard(symbol) {
    await loadDashboard(symbol, selectedTimeframe);
  }

  async function handleTimeframeChange(next) {
    setSelectedTimeframe(next);
    await Promise.all([
      loadDashboard((dashboard && dashboard.symbol) || query, next),
      loadWatchlist(next),
      loadCompare(compareInputs, next),
    ]);
  }

  async function addToWatchlist() {
    if (!watchlistInput.trim()) return;
    await fetchJson(API.addWatchlist, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: watchlistInput }),
    });
    setWatchlistInput("");
    await loadWatchlist(selectedTimeframe);
  }

  async function removeFromWatchlist(symbol) {
    await fetchJson(API.deleteWatchlist(symbol), { method: "DELETE" });
    await loadWatchlist(selectedTimeframe);
  }

  async function compareNow() {
    const cleaned = compareInputs.map((item) => item.trim()).filter(Boolean).slice(0, 3);
    if (cleaned.length < 2) return;
    setCompareInputs(cleaned);
    await loadCompare(cleaned, selectedTimeframe);
  }

  const heroSuggestions = useMemo(() => searchResults.slice(0, 8), [searchResults]);

  return (
    <div className="app-shell">
      <header className="hero-shell">
        <div className="hero-copy">
          <p className="eyebrow">AI Stock Trading Dashboard</p>
          <h1>Trade-ready stock analysis with indicators, signals, and multi-timeframe context.</h1>
          <p className="hero-text">
            Analyze Indian stocks with candlestick charts, RSI, MACD, Bollinger Bands, AI signals,
            dynamic explanations, saved watchlists, and side-by-side comparison.
          </p>

          <div className="hero-controls">
            <div className="search-stack">
              <div className="search-row">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search stock, index, or ticker"
                />
                <button onClick={() => submitDashboard(query)}>Analyze</button>
              </div>
              {heroSuggestions.length > 0 && (
                <div className="search-dropdown">
                  {heroSuggestions.map((item) => (
                    <button
                      key={`${item.symbol}-${item.name}`}
                      className="search-result"
                      onClick={() => {
                        setQuery(item.symbol);
                        submitDashboard(item.symbol);
                      }}
                    >
                      <span>
                        <strong>{item.name}</strong>
                        <small>{item.sector || item.instrument_type}</small>
                      </span>
                      <span>{item.symbol}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="timeframe-tabs">
              {TIMEFRAME_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={selectedTimeframe === option.value ? "active-tab" : ""}
                  onClick={() => handleTimeframeChange(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="hero-card">
          <p className="card-label">Stack</p>
          <ul>
            <li>FastAPI backend with async market-data endpoints</li>
            <li>React frontend with live candlestick chart</li>
            <li>RSI, MACD, and Bollinger Bands</li>
            <li>AI-style signal scoring with confidence and dynamic explanation</li>
          </ul>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <main className="dashboard-grid">
        <section className="panel main-panel">
          <div className="panel-head">
            <div>
              <p className="panel-kicker">Main Analysis</p>
              <h2>{dashboard ? `${dashboard.name} (${dashboard.symbol})` : "Waiting for analysis"}</h2>
            </div>
            <span className={`signal-pill ${signalTone(dashboard && dashboard.signal)}`}>
              {dashboard ? dashboard.signal : "NO SIGNAL"}
            </span>
          </div>

          {loading && <div className="loading-strip">Loading market data, indicators, and explanations...</div>}

          <div className="metrics-grid">
            <MetricCard label="Current Price" value={dashboard ? formatCurrency(dashboard.price) : "--"} />
            <MetricCard label="Confidence" value={dashboard ? `${dashboard.confidence}%` : "--"} />
            <MetricCard label="Trend" value={dashboard ? dashboard.trend : "--"} tone={signalTone(dashboard && dashboard.signal)} />
            <MetricCard label="Entry" value={dashboard ? formatCurrency(dashboard.entry) : "--"} />
            <MetricCard label="Target" value={dashboard ? formatCurrency(dashboard.target) : "--"} />
            <MetricCard label="Stop Loss" value={dashboard ? formatCurrency(dashboard.stopLoss) : "--"} />
          </div>

          <div className="chart-card">
            <div className="chart-header">
              <div>
                <h3>Candlestick Chart</h3>
                <p>{dashboard ? `${dashboard.timeframeLabel} candlesticks with Bollinger Bands` : "Load a symbol to render the chart"}</p>
              </div>
            </div>
            {dashboard && dashboard.chart ? <CandlestickChart chart={dashboard.chart} /> : <div className="chart-placeholder">No chart yet.</div>}
          </div>

          <div className="indicator-grid">
            <MetricCard label="RSI" value={dashboard ? dashboard.indicators.rsi : "--"} />
            <MetricCard label="MACD" value={dashboard ? dashboard.indicators.macd : "--"} />
            <MetricCard label="MACD Signal" value={dashboard ? dashboard.indicators.macdSignal : "--"} />
            <MetricCard label="BB Upper" value={dashboard ? formatCurrency(dashboard.indicators.bollingerUpper) : "--"} />
            <MetricCard label="BB Mid" value={dashboard ? formatCurrency(dashboard.indicators.bollingerMiddle) : "--"} />
            <MetricCard label="BB Lower" value={dashboard ? formatCurrency(dashboard.indicators.bollingerLower) : "--"} />
          </div>

          <div className="explanation-card">
            <h3>AI Explanation</h3>
            <p>{dashboard && dashboard.dynamicExplanation ? dashboard.dynamicExplanation.summary : "No explanation available yet."}</p>
            <ul>
              {dashboard && dashboard.dynamicExplanation
                ? dashboard.dynamicExplanation.bullets.map((item) => <li key={item}>{item}</li>)
                : <li>Run an analysis to generate the market explanation.</li>}
            </ul>
          </div>

          <div className="timeframe-grid">
            {dashboard && dashboard.multiTimeframe && dashboard.multiTimeframe.length > 0 ? (
              dashboard.multiTimeframe.map((item) => (
                <article key={item.timeframe} className="mini-panel">
                  <span>{item.timeframe.toUpperCase()}</span>
                  <strong className={`${signalTone(item.signal)}-text`}>{item.signal}</strong>
                  <p>{item.summary}</p>
                  <small>{item.confidence}% confidence</small>
                </article>
              ))
            ) : (
              <div className="mini-panel">Multi-timeframe analysis will appear here.</div>
            )}
          </div>
        </section>

        <section className="panel side-panel">
          <div className="panel-head">
            <div>
              <p className="panel-kicker">Watchlist</p>
              <h2>Saved Signals</h2>
            </div>
          </div>

          <div className="inline-form">
            <input
              value={watchlistInput}
              onChange={(event) => setWatchlistInput(event.target.value)}
              placeholder="Add symbol like INFY"
            />
            <button onClick={addToWatchlist}>Save</button>
          </div>

          {watchlistLoading ? (
            <div className="loading-strip">Refreshing watchlist...</div>
          ) : (
            <div className="watchlist-stack">
              {watchlist.map((item) => (
                <article key={item.symbol} className="watch-item">
                  <button className="watch-main" onClick={() => submitDashboard(item.symbol)}>
                    <strong>{item.symbol}</strong>
                    <span>{item.signal}</span>
                    <small>{formatCurrency(item.price)} · {item.confidence}%</small>
                  </button>
                  <button className="ghost-btn" onClick={() => removeFromWatchlist(item.symbol)}>Remove</button>
                </article>
              ))}
            </div>
          )}

          <div className="news-block">
            <h3>News Sentiment</h3>
            <div className={`signal-pill ${signalTone(dashboard && dashboard.news && dashboard.news.overall)}`}>
              {dashboard && dashboard.news ? dashboard.news.overall : "Neutral"}
            </div>
            <div className="news-list">
              {dashboard && dashboard.news && dashboard.news.articles && dashboard.news.articles.length > 0 ? (
                dashboard.news.articles.map((article) => (
                  <a key={`${article.link}-${article.title}`} href={article.link} target="_blank" rel="noreferrer" className="news-item">
                    <strong>{article.title}</strong>
                    <small>{article.sentiment}</small>
                  </a>
                ))
              ) : (
                <div className="news-item">No recent headlines available.</div>
              )}
            </div>
          </div>
        </section>

        <section className="panel compare-panel">
          <div className="panel-head">
            <div>
              <p className="panel-kicker">Comparison</p>
              <h2>Compare 2-3 Companies</h2>
            </div>
          </div>

          <div className="compare-form">
            {compareInputs.map((value, index) => (
              <input
                key={index}
                value={value}
                onChange={(event) => {
                  const next = [...compareInputs];
                  next[index] = event.target.value;
                  setCompareInputs(next);
                }}
                placeholder={`Symbol ${index + 1}`}
              />
            ))}
            {compareInputs.length < 3 && (
              <button className="ghost-btn" onClick={() => setCompareInputs([...compareInputs, ""])}>
                Add Third
              </button>
            )}
            <button onClick={compareNow}>Compare</button>
          </div>

          {compareLoading ? (
            <div className="loading-strip">Comparing symbols...</div>
          ) : (
            <div className="table-wrap">
              <table className="compare-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Price</th>
                    <th>Signal</th>
                    <th>Confidence</th>
                    <th>Trend</th>
                    <th>Entry</th>
                    <th>Target</th>
                    <th>Stop</th>
                  </tr>
                </thead>
                <tbody>
                  {compareResults.length > 0 ? compareResults.map((item) => (
                    <tr key={item.symbol}>
                      <td>{item.symbol}</td>
                      <td>{formatCurrency(item.price)}</td>
                      <td className={`${signalTone(item.signal)}-text`}>{item.signal}</td>
                      <td>{item.confidence}%</td>
                      <td>{item.trend}</td>
                      <td>{formatCurrency(item.entry)}</td>
                      <td>{formatCurrency(item.target)}</td>
                      <td>{formatCurrency(item.stopLoss)}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan="8">Comparison results will appear here.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
