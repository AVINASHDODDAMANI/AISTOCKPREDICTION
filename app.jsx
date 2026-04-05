const { useEffect, useMemo, useRef, useState } = React;

const API = {
  meta: "/api/meta",
  search: "/api/search",
  resolve: (query) => `/api/resolve?q=${encodeURIComponent(query)}`,
  dashboard: (symbol, timeframe) => `/api/dashboard/${encodeURIComponent(symbol)}?timeframe=${encodeURIComponent(timeframe)}`,
  compare: (symbols, timeframe) => `/api/compare?symbols=${encodeURIComponent(symbols.join(","))}&timeframe=${encodeURIComponent(timeframe)}`,
  watchlist: (timeframe) => `/api/watchlist?timeframe=${encodeURIComponent(timeframe)}`,
  addWatchlist: "/api/watchlist",
  deleteWatchlist: (symbol) => `/api/watchlist/${encodeURIComponent(symbol)}`,
  register: "/api/auth/register",
  login: "/api/auth/login",
  me: "/api/auth/me",
  logout: "/api/auth/logout",
};

const TIMEFRAME_OPTIONS = [
  { value: "5m", label: "5m" },
  { value: "15m", label: "15m" },
  { value: "1h", label: "1h" },
  { value: "1d", label: "1D" },
];

// Utility functions
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

// Chart component for candlestick and indicators
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

// Indicator Chart Component
function IndicatorChart({ indicators, label, type = "bar" }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !indicators || !window.Chart) return;

    if (chartRef.current) {
      chartRef.current.destroy();
    }

    const ctx = canvasRef.current.getContext("2d");
    const data = indicators.map(item => item.value);
    const labels = indicators.map((_, i) => `${i}`);

    chartRef.current = new window.Chart(ctx, {
      type: type,
      data: {
        labels: labels,
        datasets: [{
          label: label,
          data: data,
          backgroundColor: data.map(v => v > 0 ? "rgba(33, 193, 122, 0.6)" : "rgba(255, 117, 117, 0.6)"),
          borderColor: data.map(v => v > 0 ? "#21c17a" : "#ff7575"),
          borderWidth: 1,
          tension: 0.4,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            labels: { color: "#c7d6ea", font: { size: 12 } },
            display: true,
          }
        },
        scales: {
          y: {
            ticks: { color: "#9db2cf", font: { size: 12 } },
            grid: { color: "rgba(255, 255, 255, 0.05)" },
          },
          x: {
            ticks: { color: "#9db2cf", font: { size: 10 } },
            grid: { color: "rgba(255, 255, 255, 0.05)" },
          },
        }
      }
    });

    return () => {
      if (chartRef.current) chartRef.current.destroy();
    };
  }, [indicators, label, type]);

  return <canvas ref={canvasRef} height="150" />;
}

// Metric Card component
function MetricCard({ label, value, tone, icon }) {
  return (
    <article className={`metric-card ${tone ? `metric-${tone}` : ""}`}>
      {icon && <i className={icon}></i>}
      <div>
        <span className="metric-label">{label}</span>
        <strong className="metric-value">{value}</strong>
      </div>
    </article>
  );
}

// News Item Component
function NewsItem({ item }) {
  const tone = signalTone(item.sentiment || "");
  return (
    <div className={`news-item news-${tone}`}>
      <strong>{item.headline}</strong>
      <small>{item.date}</small>
      <p>{item.summary}</p>
    </div>
  );
}

// Main Dashboard Component
function Dashboard({ dashboard, loading, selectedTimeframe }) {
  const [activeTab, setActiveTab] = useState("overview");

  if (loading) {
    return <div className="loading-state"><span className="spinner"></span> Loading analysis...</div>;
  }

  if (!dashboard) {
    return <div className="loading-state">Select a stock to begin</div>;
  }

  const indicators = dashboard.indicators || {};
  const multiTimeframe = dashboard.multiTimeframe || [];
  const news = dashboard.news || {};

  return (
    <div className="dashboard-content">
      <div className="dashboard-header">
        <div className="header-top">
          <div className="header-left">
            <h2>{dashboard.name} ({dashboard.symbol})</h2>
            <span className={`signal-badge ${signalTone(dashboard.signal)}`}>{dashboard.signal}</span>
            <span className="confidence-badge">Confidence: {dashboard.confidence}%</span>
          </div>
          <div className="header-price">
            <div className="price-large">{formatCurrency(dashboard.price)}</div>
            <div className="price-info">Generated: {dashboard.generatedAtIST}</div>
          </div>
        </div>

        <div className="tab-controls">
          {["overview", "indicators", "news", "timing"].map(tab => (
            <button
              key={tab}
              className={`tab-button ${activeTab === tab ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "overview" && (
        <div className="tab-content">
          <section className="chart-section">
            <h3>Price Action & Bollinger Bands</h3>
            <CandlestickChart chart={dashboard.chart} />
          </section>

          <section className="metrics-section">
            <div className="metrics-row">
              <MetricCard label="Trend" value={dashboard.trend} tone={signalTone(dashboard.signal)} icon="fas fa-arrow-trend-up" />
              <MetricCard label="Entry Price" value={formatCurrency(dashboard.entry)} tone="neutral" icon="fas fa-sign-in-alt" />
              <MetricCard label="Target Price" value={formatCurrency(dashboard.target)} tone="bull" icon="fas fa-bullseye" />
              <MetricCard label="Stop Loss" value={formatCurrency(dashboard.stopLoss)} tone="bear" icon="fas fa-flag-checkered" />
            </div>
          </section>

          <section className="reasons-section">
            <h3>Trading Reasons</h3>
            <ul className="reasons-list">
              {dashboard.reasons && dashboard.reasons.map((reason, i) => (
                <li key={i}><i className="fas fa-check-circle"></i>{reason}</li>
              ))}
            </ul>
          </section>

          {dashboard.dynamicExplanation && (
            <section className="explanation-section">
              <h3>Analysis Summary</h3>
              <p>{dashboard.dynamicExplanation}</p>
            </section>
          )}
        </div>
      )}

      {activeTab === "indicators" && (
        <div className="tab-content">
          <div className="indicators-grid">
            <section className="indicator-card">
              <h4>RSI (14)</h4>
              <div className="indicator-value">{indicators.rsi}</div>
              <p className="indicator-desc">
                {indicators.rsi > 70 ? "Overbought - potential pullback" : 
                 indicators.rsi < 30 ? "Oversold - potential bounce" : 
                 "Healthy momentum range"}
              </p>
            </section>

            <section className="indicator-card">
              <h4>MACD</h4>
              <div className="indicator-value">{indicators.macd?.toFixed(4)}</div>
              <div className="indicator-signal">Signal: {indicators.macdSignal?.toFixed(4)}</div>
              <p className="indicator-desc">
                {indicators.macd > indicators.macdSignal ? "Bullish crossover" : "Bearish crossover"}
              </p>
            </section>

            <section className="indicator-card">
              <h4>Volatility (14)</h4>
              <div className="indicator-value">{indicators.volatility?.toFixed(2)}%</div>
              <p className="indicator-desc">
                {indicators.volatility > 3 ? "High volatility" : indicators.volatility > 1 ? "Moderate volatility" : "Low volatility"}
              </p>
            </section>

            <section className="indicator-card">
              <h4>Momentum</h4>
              <div className="indicator-value">{indicators.momentum?.toFixed(2)}%</div>
              <p className="indicator-desc">
                {indicators.momentum > 0.02 ? "Positive momentum" : indicators.momentum < -0.02 ? "Negative momentum" : "Neutral momentum"}
              </p>
            </section>
          </div>

          <section className="bollinger-section">
            <h3>Bollinger Bands</h3>
            <div className="bollinger-info">
              <div className="bb-item">
                <span>Upper Band</span>
                <strong>{formatCurrency(indicators.bollingerUpper)}</strong>
              </div>
              <div className="bb-item">
                <span>Middle Band</span>
                <strong>{formatCurrency(indicators.bollingerMiddle)}</strong>
              </div>
              <div className="bb-item">
                <span>Lower Band</span>
                <strong>{formatCurrency(indicators.bollingerLower)}</strong>
              </div>
              <div className="bb-item">
                <span>Current Price</span>
                <strong>{formatCurrency(dashboard.price)}</strong>
              </div>
            </div>
          </section>
        </div>
      )}

      {activeTab === "news" && (
        <div className="tab-content">
          <section className="news-section">
            <h3>Market Sentiment</h3>
            <div className="sentiment-summary">
              <div className={`sentiment-item sentiment-bull`}>
                <strong>Overall</strong>
                <span>{news.overall || "Neutral"}</span>
              </div>
              <div className={`sentiment-item sentiment-bull`}>
                <strong>Bullish Articles</strong>
                <span>{news.bullishCount || 0}</span>
              </div>
              <div className={`sentiment-item sentiment-bear`}>
                <strong>Bearish Articles</strong>
                <span>{news.bearishCount || 0}</span>
              </div>
            </div>

            {news.headlines && news.headlines.length > 0 && (
              <div className="news-list">
                {news.headlines.slice(0, 5).map((item, i) => (
                  <NewsItem key={i} item={item} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === "timing" && (
        <div className="tab-content">
          <section className="timing-section">
            <h3>Multi-Timeframe Analysis</h3>
            <div className="timing-views">
              {multiTimeframe.map((view, i) => (
                <div key={i} className={`timing-card timing-${signalTone(view.signal)}`}>
                  <h4>{view.timeframe}</h4>
                  <div className="timing-signal">{view.signal}</div>
                  <div className="timing-confidence">Confidence: {view.confidence}%</div>
                  <p>{view.summary}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

// Main App Component
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
  const [resolvedSearch, setResolvedSearch] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [authMethod, setAuthMethod] = useState("phone");
  const [authForm, setAuthForm] = useState({ fullName: "", phone: "", email: "", password: "" });
  const [authToken, setAuthToken] = useState(localStorage.getItem("authToken") || "");
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [activeView, setActiveView] = useState("dashboard");

  useEffect(() => {
    async function boot() {
      try {
        const metaPayload = await fetchJson(API.meta);
        setMeta(metaPayload);
        if (authToken) {
          try {
            const me = await fetchJson(API.me, {
              headers: { Authorization: `Bearer ${authToken}` },
            });
            setCurrentUser(me.user);
          } catch (_) {
            localStorage.removeItem("authToken");
            setAuthToken("");
          }
        }
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
    function handleDocumentClick(event) {
      const stack = document.querySelector(".search-stack");
      if (stack && !stack.contains(event.target)) {
        setSearchOpen(false);
      }
    }

    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const payload = await fetchJson(`${API.search}?q=${encodeURIComponent(query)}`);
        setSearchResults(payload.results || []);
        setSearchOpen(Boolean(payload.results && payload.results.length));
      } catch (_) {}
    }, 300);
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
      const headers = authToken ? { Authorization: `Bearer ${authToken}` } : undefined;
      const payload = await fetchJson(API.watchlist(timeframe), headers ? { headers } : undefined);
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

  async function resolveSelection(rawQuery) {
    const trimmed = rawQuery.trim();
    if (!trimmed) return null;
    const resolved = await fetchJson(API.resolve(trimmed));
    setResolvedSearch(resolved);
    return resolved;
  }

  async function submitDashboard(rawQuery) {
    const resolved = await resolveSelection(rawQuery);
    if (!resolved || !resolved.symbol) return;
    setQuery(resolved.name || resolved.symbol);
    setSearchResults([]);
    setSearchOpen(false);
    await loadDashboard(resolved.symbol, selectedTimeframe);
  }

  async function handleTimeframeChange(next) {
    setSelectedTimeframe(next);
    await Promise.all([
      loadDashboard((dashboard && dashboard.symbol) || (resolvedSearch && resolvedSearch.symbol) || query, next),
      loadWatchlist(next),
      loadCompare(compareInputs, next),
    ]);
  }

  async function addToWatchlist() {
    if (!authToken) {
      setError("Please login first to save your watchlist.");
      return;
    }
    if (!watchlistInput.trim()) return;
    const resolved = await resolveSelection(watchlistInput);
    if (!resolved || !resolved.symbol) return;
    await fetchJson(API.addWatchlist, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ symbol: resolved.symbol }),
    });
    setWatchlistInput("");
    await loadWatchlist(selectedTimeframe);
  }

  async function removeFromWatchlist(symbol) {
    if (!authToken) {
      setError("Please login first to manage your watchlist.");
      return;
    }
    await fetchJson(API.deleteWatchlist(symbol), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${authToken}` },
    });
    await loadWatchlist(selectedTimeframe);
  }

  async function compareNow() {
    const cleaned = compareInputs.map((item) => item.trim()).filter(Boolean).slice(0, 3);
    if (cleaned.length < 2) return;
    setCompareInputs(cleaned);
    await loadCompare(cleaned, selectedTimeframe);
  }

  const heroSuggestions = useMemo(() => searchResults.slice(0, 8), [searchResults]);

  async function submitAuth(mode) {
    setAuthLoading(true);
    setError("");
    try {
      const url = mode === "register" ? API.register : API.login;
      const payload = mode === "register"
        ? authForm
        : {
            identifier: authMethod === "phone" ? authForm.phone : authForm.email,
            password: authForm.password,
          };
      const result = await fetchJson(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      localStorage.setItem("authToken", result.token);
      setAuthToken(result.token);
      setCurrentUser(result.user);
      setAuthForm({ fullName: "", phone: "", email: "", password: "" });
      await loadWatchlist(selectedTimeframe);
    } catch (err) {
      setError(err.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function logout() {
    if (!authToken) return;
    try {
      await fetchJson(API.logout, {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
      });
    } catch (_) {}
    localStorage.removeItem("authToken");
    setAuthToken("");
    setCurrentUser(null);
    await loadWatchlist(selectedTimeframe);
  }

  return (
    <div className="app-shell">
      {/* Navigation */}
      <nav className="navbar">
        <div className="navbar-brand">
          <h1><i className="fas fa-chart-line"></i> AI Stock Dashboard</h1>
        </div>
        <div className="navbar-menu">
          <button className={`nav-item ${activeView === "dashboard" ? "active" : ""}`} onClick={() => setActiveView("dashboard")}>
            <i className="fas fa-chart-pie"></i> Dashboard
          </button>
          <button className={`nav-item ${activeView === "watchlist" ? "active" : ""}`} onClick={() => setActiveView("watchlist")}>
            <i className="fas fa-star"></i> Watchlist
          </button>
          <button className={`nav-item ${activeView === "compare" ? "active" : ""}`} onClick={() => setActiveView("compare")}>
            <i className="fas fa-exchange-alt"></i> Compare
          </button>
        </div>
        <div className="navbar-auth">
          {currentUser ? (
            <div className="user-menu">
              <span className="user-name">{currentUser.fullName}</span>
              <button className="logout-btn" onClick={logout}>Logout</button>
            </div>
          ) : (
            <button className="login-btn" onClick={() => setActiveView("auth")}>Login / Register</button>
          )}
        </div>
      </nav>

      {/* Error Banner */}
      {error && <div className="error-banner"><i className="fas fa-exclamation-circle"></i> {error}</div>}

      {/* Main Content */}
      <div className="app-content">
        {activeView === "dashboard" && (
          <div className="view-container">
            <div className="search-hero">
              <div className="search-stack">
                <div className="search-input-group">
                  <i className="fas fa-search"></i>
                  <input
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setSearchOpen(true);
                    }}
                    onFocus={() => {
                      if (heroSuggestions.length) setSearchOpen(true);
                    }}
                    placeholder="Search stock, index, or ticker..."
                  />
                  <button onClick={() => submitDashboard(query)}>Analyze</button>
                </div>
                
                {searchOpen && heroSuggestions.length > 0 && (
                  <div className="search-dropdown" onMouseDown={(event) => event.preventDefault()}>
                    {heroSuggestions.map((item) => (
                      <button
                        key={`${item.symbol}-${item.name}`}
                        className="search-result"
                        onClick={() => {
                          setQuery(item.name || item.symbol);
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

              <div className="timeframe-selector">
                {TIMEFRAME_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    className={`timeframe-btn ${selectedTimeframe === option.value ? "active" : ""}`}
                    onClick={() => handleTimeframeChange(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <Dashboard dashboard={dashboard} loading={loading} selectedTimeframe={selectedTimeframe} />
          </div>
        )}

        {activeView === "watchlist" && (
          <div className="view-container">
            <div className="watchlist-header">
              <h2><i className="fas fa-star"></i> My Watchlist</h2>
              {authToken && (
                <div className="watchlist-add">
                  <input
                    value={watchlistInput}
                    onChange={(event) => setWatchlistInput(event.target.value)}
                    onKeyPress={(event) => {
                      if (event.key === "Enter") addToWatchlist();
                    }}
                    placeholder="Add stock to watchlist..."
                  />
                  <button onClick={addToWatchlist}>Add</button>
                </div>
              )}
            </div>

            {watchlistLoading ? (
              <div className="loading-state"><span className="spinner"></span> Loading watchlist...</div>
            ) : watchlist.length === 0 ? (
              <div className="empty-state">
                <i className="fas fa-inbox"></i>
                <p>{authToken ? "Your watchlist is empty. Add stocks to get started!" : "Login to save your watchlist"}</p>
              </div>
            ) : (
              <div className="watchlist-grid">
                {watchlist.map((item) => (
                  <div key={item.symbol} className={`watchlist-card watchlist-${signalTone(item.signal)}`}>
                    <div className="card-header">
                      <div>
                        <h4>{item.name}</h4>
                        <span className="symbol">{item.symbol}</span>
                      </div>
                      <button className="remove-btn" onClick={() => removeFromWatchlist(item.symbol)}>
                        <i className="fas fa-times"></i>
                      </button>
                    </div>
                    <div className="card-price">{formatCurrency(item.price)}</div>
                    <div className="card-signal">{item.signal}</div>
                    <div className="card-confidence">Confidence: {item.confidence}%</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeView === "compare" && (
          <div className="view-container">
            <div className="compare-header">
              <h2><i className="fas fa-exchange-alt"></i> Compare Stocks</h2>
              <div className="compare-inputs">
                {compareInputs.map((symbol, i) => (
                  <input
                    key={i}
                    value={symbol}
                    onChange={(event) => {
                      const updated = [...compareInputs];
                      updated[i] = event.target.value;
                      setCompareInputs(updated);
                    }}
                    placeholder={`Stock ${i + 1}`}
                  />
                ))}
                <button onClick={compareNow} disabled={compareLoading}>
                  {compareLoading ? "Comparing..." : "Compare"}
                </button>
              </div>
            </div>

            {compareResults.length > 0 && (
              <div className="compare-grid">
                {compareResults.map((result) => (
                  <div key={result.symbol} className={`compare-card compare-${signalTone(result.signal)}`}>
                    <h3>{result.name} ({result.symbol})</h3>
                    <div className="compare-price">{formatCurrency(result.price)}</div>
                    <div className="compare-signal">{result.signal}</div>
                    <div className="compare-metrics">
                      <div><span>Confidence:</span> <strong>{result.confidence}%</strong></div>
                      <div><span>Trend:</span> <strong>{result.trend}</strong></div>
                      <div><span>Entry:</span> <strong>{formatCurrency(result.entry)}</strong></div>
                      <div><span>Target:</span> <strong>{formatCurrency(result.target)}</strong></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeView === "auth" && (
          <div className="view-container">
            <div className="auth-panel-full">
              <h2>Account</h2>
              {currentUser ? (
                <div className="auth-logged">
                  <p>Logged in as <strong>{currentUser.fullName}</strong></p>
                  <p>{currentUser.email || currentUser.phone}</p>
                  <button onClick={logout} className="logout-btn-full">Logout</button>
                </div>
              ) : (
                <div className="auth-form-full">
                  <div className="auth-mode-tabs">
                    <button className={authMode === "login" ? "active" : ""} onClick={() => setAuthMode("login")}>Login</button>
                    <button className={authMode === "register" ? "active" : ""} onClick={() => setAuthMode("register")}>Register</button>
                  </div>

                  {authMode === "register" && (
                    <input
                      value={authForm.fullName}
                      onChange={(event) => setAuthForm({ ...authForm, fullName: event.target.value })}
                      placeholder="Full Name"
                    />
                  )}

                  <div className="auth-method-tabs">
                    <button className={authMethod === "phone" ? "active" : ""} onClick={() => setAuthMethod("phone")}>Phone</button>
                    <button className={authMethod === "email" ? "active" : ""} onClick={() => setAuthMethod("email")}>Email</button>
                  </div>

                  {authMethod === "phone" ? (
                    <input
                      value={authForm.phone}
                      onChange={(event) => setAuthForm({ ...authForm, phone: event.target.value })}
                      placeholder="Phone Number"
                    />
                  ) : (
                    <input
                      value={authForm.email}
                      onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })}
                      placeholder="Email Address"
                    />
                  )}

                  <input
                    type="password"
                    value={authForm.password}
                    onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })}
                    placeholder="Password"
                  />

                  <button
                    onClick={() => submitAuth(authMode)}
                    disabled={authLoading}
                    className="auth-submit"
                  >
                    {authLoading ? "Processing..." : authMode === "register" ? "Create Account" : "Login"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

ReactDOM.render(<App />, document.getElementById("root"));
