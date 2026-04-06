const { useState } = React;

const marketData = [
  { ticker: "NIFTY 50", price: "22,713.10", change: "+0.50%", trend: "up" },
  { ticker: "SENSEX", price: "73,319.55", change: "+0.25%", trend: "up" },
];

const stockList = [
  {
    symbol: "RELIANCE",
    name: "Reliance Industries",
    price: "2,450.70",
    change: "+1.27%",
    signal: "BUY",
    confidence: 78,
    entry: "2,410",
    target: "2,530",
    stopLoss: "2,380",
    aiBullets: [
      "Strong delivery volume confirms buyer interest.",
      "Price is above the 20-day EMA with healthy momentum.",
      "Model expects upside continuation into next resistance."],
  },
  {
    symbol: "TCS",
    name: "Tata Consultancy",
    price: "3,951.20",
    change: "+1.08%",
    signal: "BUY",
    confidence: 83,
    entry: "3,880",
    target: "4,050",
    stopLoss: "3,820",
    aiBullets: [
      "IT sector breadth remains positive.",
      "Moving averages are aligned bullishly.",
      "The model sees room for a controlled breakout."],
  },
  {
    symbol: "INFY",
    name: "Infosys",
    price: "1,623.45",
    change: "+0.95%",
    signal: "BUY",
    confidence: 80,
    entry: "1,590",
    target: "1,680",
    stopLoss: "1,560",
    aiBullets: [
      "Technical structure supports a continuation move.",
      "Volume confirms accumulation over the past sessions.",
      "Sentiment indicators remain favorable."],
  },
  {
    symbol: "HDFCBANK",
    name: "HDFC Bank",
    price: "1,409.50",
    change: "+0.92%",
    signal: "BUY",
    confidence: 75,
    entry: "1,380",
    target: "1,460",
    stopLoss: "1,340",
    aiBullets: [
      "Banking index strength is supporting the rally.",
      "Short-term momentum is positive.",
      "The model prefers a buy setup near support."],
  },
  {
    symbol: "ADANIENT",
    name: "Adani Enterprises",
    price: "3,986.00",
    change: "-0.88%",
    signal: "SELL",
    confidence: 69,
    entry: "4,050",
    target: "3,860",
    stopLoss: "4,120",
    aiBullets: [
      "Price is testing a key resistance zone.",
      "Risk parameters favor a defensive bias.",
      "Model signals an increased chance of pullback."],
  },
  {
    symbol: "SBIN",
    name: "State Bank of India",
    price: "779.80",
    change: "-1.42%",
    signal: "SELL",
    confidence: 65,
    entry: "800",
    target: "755",
    stopLoss: "815",
    aiBullets: [
      "Weakness is visible in banking sector flows.",
      "Short-term indicators are oversold but still bearish.",
      "The model suggests waiting for a clearer reversal signal."],
  },
];

const watchlistData = stockList.slice(0, 4);
const signalData = stockList.filter((item) => item.signal !== "BUY");
const ALL_COMPANIES = STOCK_CATALOG.map((stock) => ({ ...stock }));

function App() {
  const [activeTab, setActiveTab] = useState("explore");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedStock, setSelectedStock] = useState(null);

  const tabContent = {
    explore: stockList,
    watchlist: watchlistData,
    signals: signalData,
  };

  const currentItems = tabContent[activeTab] || [];
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const searchResults = normalizedQuery
    ? ALL_COMPANIES.filter((stock) =>
        stock.name.toLowerCase().includes(normalizedQuery) ||
        stock.symbol.toLowerCase().startsWith(normalizedQuery)
      )
    : [];

  const filteredItems = normalizedQuery ? searchResults : currentItems;
  const suggestions = normalizedQuery ? searchResults.slice(0, 4) : [];

  return (
    <div className="simple-shell">
      <header className="simple-topbar">
        <div className="brand">
          <div className="brand-icon">AI</div>
          <div>
            <h1>AI StockPrediction</h1>
            <p>Neon market signals in one clean view</p>
          </div>
        </div>
        <div className="top-actions">
          <div className="search-container">
            {isSearchOpen && (
              <>
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search companies..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                />
                {suggestions.length > 0 && (
                  <div className="suggestions-list">
                    {suggestions.map((stock) => (
                      <button
                        key={stock.symbol}
                        type="button"
                        className="suggestion-item"
                        onClick={() => setSearchQuery(stock.name)}
                      >
                        <strong>{stock.symbol}</strong>
                        <span>{stock.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            <button
              className="icon-btn"
              aria-label="Search"
              onClick={() => {
                setIsSearchOpen(!isSearchOpen);
                if (isSearchOpen) {
                  setSearchQuery("");
                }
              }}
            >
              <i className={isSearchOpen ? "fas fa-times" : "fas fa-search"} />
            </button>
          </div>
          <button className="user-badge">A</button>
        </div>
      </header>

      <section className="market-strip">
        {marketData.map((item) => (
          <article key={item.ticker} className={`market-card ${item.trend}`}>
            <span>{item.ticker}</span>
            <strong>{item.price}</strong>
            <small>{item.change}</small>
          </article>
        ))}
      </section>

      <nav className="simple-tabs">
        {[
          { id: "explore", label: "Explore" },
          { id: "watchlist", label: "Watchlist" },
          { id: "signals", label: "Signals" },
        ].map((tab) => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? "tab active" : "tab"}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="stock-panel">
        <div className="panel-header">
          <div>
            <h2>{activeTab === "explore" ? "Top Predictions" : activeTab === "watchlist" ? "Watchlist" : "Signals"}</h2>
            <p>Live model confidence and market direction.</p>
          </div>
          <button className="action-pill">Refresh</button>
        </div>

        <div className="stock-list">
          {filteredItems.map((stock) => (
            <article key={stock.symbol} className="stock-row" onClick={() => setSelectedStock(stock)}>
              <div className="stock-main">
                <div className="stock-chip">{stock.symbol}</div>
                <div>
                  <h3>{stock.name}</h3>
                  <p>{stock.price} • <span className={stock.change.startsWith("+") ? "gain" : "loss"}>{stock.change}</span></p>
                </div>
              </div>
              <div className="stock-meta">
                <span className={`signal-pill ${stock.signal === "BUY" ? "buy" : "sell"}`}>{stock.signal}</span>
                <span className="confidence">{stock.confidence}%</span>
              </div>
            </article>
          ))}
        </div>
      </main>

      {selectedStock && (
        <div className="modal-overlay" onClick={() => setSelectedStock(null)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedStock(null)}>
              <i className="fas fa-times" />
            </button>
            <div className="modal-title">
              <div>
                <span className="modal-symbol">{selectedStock.symbol}</span>
                <h3>{selectedStock.name}</h3>
              </div>
              <div className={`signal-pill ${selectedStock.signal === "BUY" ? "buy" : "sell"}`}>
                {selectedStock.signal}
              </div>
            </div>
            <div className="modal-grid">
              <div className="modal-card-item">
                <span>Current Price</span>
                <strong>{selectedStock.price || "--"}</strong>
              </div>
              <div className="modal-card-item">
                <span>Change</span>
                <strong className={selectedStock.change && selectedStock.change.startsWith("+") ? "gain" : "loss"}>
                  {selectedStock.change || "--"}
                </strong>
              </div>
              <div className="modal-card-item">
                <span>Confidence</span>
                <strong>{selectedStock.confidence != null ? `${selectedStock.confidence}%` : "--"}</strong>
              </div>
              <div className="modal-card-item">
                <span>Entry</span>
                <strong>{selectedStock.entry || "--"}</strong>
              </div>
              <div className="modal-card-item">
                <span>Target</span>
                <strong>{selectedStock.target || "--"}</strong>
              </div>
              <div className="modal-card-item">
                <span>Stop Loss</span>
                <strong>{selectedStock.stopLoss || "--"}</strong>
              </div>
            </div>
            <div className="modal-explanation">
              <h4>AI Prediction Details</h4>
              <ul>
                {(selectedStock.aiBullets || ["AI details unavailable for this company yet."]).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
