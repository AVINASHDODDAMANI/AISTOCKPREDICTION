const { useEffect, useState } = React;

const API = {
  meta: "/api/meta",
  search: "/api/search",
  resolve: (query) => `/api/resolve?q=${encodeURIComponent(query)}`,
  dashboard: (symbol, timeframe) => `/api/dashboard/${encodeURIComponent(symbol)}?timeframe=${encodeURIComponent(timeframe)}`,
};

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
  if (clean.includes("BUY") || clean.includes("BULLISH")) return "bull";
  if (clean.includes("SELL") || clean.includes("BEARISH")) return "bear";
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

function App() {
  const [activeTab, setActiveTab] = useState("explore");
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [selectedStock, setSelectedStock] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    async function boot() {
      try {
        setLoading(true);
        const meta = await fetchJson(API.meta);
        if (meta.watchlist && meta.watchlist.length > 0) {
          const stockList = meta.watchlist.slice(0, 15).map((stock) => ({
            ...stock,
            signal: ["BUY", "SELL", "HOLD"][Math.floor(Math.random() * 3)],
            confidence: Math.floor(Math.random() * 40 + 60),
            change: (Math.random() - 0.5) * 10,
          }));
          setStocks(stockList);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    boot();
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const payload = await fetchJson(`${API.search}?q=${encodeURIComponent(searchQuery)}`);
        setSearchResults(payload.results || []);
        setSearchOpen(Boolean(payload.results && payload.results.length));
      } catch (_) {}
    }, 300);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  async function selectStock(symbol) {
    const resolved = await fetchJson(API.resolve(symbol));
    if (resolved && resolved.symbol) {
      const newStock = {
        symbol: resolved.symbol,
        name: resolved.name || symbol,
        sector: resolved.sector || "Tech",
        price: Math.random() * 5000,
        signal: "BUY",
        confidence: Math.floor(Math.random() * 40 + 60),
        change: (Math.random() - 0.5) * 10,
      };
      setStocks([newStock, ...stocks.filter(s => s.symbol !== newStock.symbol)]);
    }
    setSearchQuery("");
    setSearchOpen(false);
  }

  async function openStockDetail(stock) {
    setSelectedStock(stock);
    setDetailLoading(true);
    try {
      const dashboard = await fetchJson(API.dashboard(stock.symbol, "1d"));
      setDetailData(dashboard);
    } catch (err) {
      console.error("Failed to load chart data:", err);
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setSelectedStock(null);
    setDetailData(null);
  }

  return (
    <div className="app-shell kite">
      {/* Top Bar */}
      <div className="top-bar">
        <div className="top-left">
          <h1 className="app-name">AI Stocks</h1>
        </div>
        <div className="top-right">
          <div className="search-box">
            <div className="search-input-wrapper">
              <input
                type="text"
                placeholder="Search stocks"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
              />
              {searchOpen && searchResults.length > 0 && (
                <div className="search-results">
                  {searchResults.slice(0, 5).map((item) => (
                    <div
                      key={item.symbol}
                      className="search-result-item"
                      onClick={() => selectStock(item.symbol)}
                    >
                      <strong>{item.name}</strong>
                      <small>{item.symbol}</small>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <button className="icon-btn">👤</button>
        </div>
      </div>

      {/* Market Overview */}
      <div className="market-overview">
        <div className="market-card">
          <div className="market-name">NIFTY 50</div>
          <div className="market-price">₹22,450</div>
          <div className="market-change bull">+1.2%</div>
        </div>
        <div className="market-card">
          <div className="market-name">SENSEX</div>
          <div className="market-price">₹73,500</div>
          <div className="market-change bull">+0.8%</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === "explore" ? "active" : ""}`}
          onClick={() => setActiveTab("explore")}
        >
          Explore
        </button>
        <button
          className={`tab ${activeTab === "watchlist" ? "active" : ""}`}
          onClick={() => setActiveTab("watchlist")}
        >
          Watchlist
        </button>
        <button
          className={`tab ${activeTab === "orders" ? "active" : ""}`}
          onClick={() => setActiveTab("orders")}
        >
          Orders
        </button>
      </div>

      {/* Stock List */}
      <div className="stock-list-container">
        {loading && <div className="loading">Loading stocks...</div>}
        {error && <div className="error">{error}</div>}
        
        <div className="stock-list">
          {activeTab === "explore" && stocks.length > 0 && (
            stocks.map((stock) => (
              <div 
                key={stock.symbol} 
                className="stock-row"
                onClick={() => openStockDetail(stock)}
                style={{ cursor: "pointer" }}
              >
                <div className="stock-info">
                  <div className="stock-name">{stock.name}</div>
                  <div className="stock-meta">{stock.symbol} • {stock.sector}</div>
                </div>
                <div className="stock-price">
                  <div className="price">{formatCurrency(stock.price)}</div>
                  <div className={`change ${stock.change > 0 ? "positive" : "negative"}`}>
                    {formatPercent(stock.change)}
                  </div>
                </div>
                <div className={`signal ${signalTone(stock.signal)}`}>
                  {stock.signal}
                </div>
              </div>
            ))
          )}
          
          {activeTab === "watchlist" && (
            <div className="empty-state">
              <p>Watchlist is empty</p>
              <small>Add stocks from Explore tab</small>
            </div>
          )}
          
          {activeTab === "orders" && (
            <div className="empty-state">
              <p>No active orders</p>
              <small>Place your first order</small>
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedStock && (
        <div className="modal-overlay" onClick={closeDetail}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="modal-header">
              <div>
                <h2>{selectedStock.name}</h2>
                <small>{selectedStock.symbol}</small>
              </div>
              <button className="close-btn" onClick={closeDetail}>✕</button>
            </div>

            {/* Search Box */}
            <div className="modal-search">
              <input
                type="text"
                placeholder="Search related stocks..."
                className="modal-search-input"
              />
            </div>

            {/* Chart Area */}
            <div className="chart-area">
              {detailLoading ? (
                <div className="chart-placeholder">Loading chart...</div>
              ) : detailData ? (
                <div className="chart-container" id="tv_chart"></div>
              ) : (
                <div className="chart-placeholder">No chart data available</div>
              )}
            </div>

            {/* Explanation Boxes */}
            <div className="explanation-boxes">
              <div className="explanation-box">
                <h4>📊 Analysis</h4>
                <p>{detailData?.analysis || "Technical analysis indicator: Stock showing strong uptrend with high volume. RSI indicates overbought conditions. Support level at 500."}</p>
              </div>
              <div className="explanation-box">
                <h4>💡 Signal</h4>
                <p>Signal: <strong>{selectedStock.signal}</strong> | Confidence: {selectedStock.confidence}%</p>
              </div>
              <div className="explanation-box">
                <h4>📈 Trend</h4>
                <p>{detailData?.trend || "Current trend is bullish with positive momentum. Moving averages are aligned in uptrend formation. Consider entry on dips."}</p>
              </div>
              <div className="explanation-box">
                <h4>⚠️ Risk</h4>
                <p>{detailData?.risk || "Risk Level: Medium. Key support at 480. Stop loss recommended at 450. Take profit at 600."}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);