const { useState } = React;

const marketData = [
  { ticker: "NIFTY 50", price: "22,713.10", change: "+0.50%", trend: "up" },
  { ticker: "SENSEX", price: "73,319.55", change: "+0.25%", trend: "up" },
];

const stockList = [
  { symbol: "RELIANCE", name: "Reliance Industries", price: "2,450.70", change: "+1.27%", signal: "BUY", confidence: 78 },
  { symbol: "TCS", name: "Tata Consultancy", price: "3,951.20", change: "+1.08%", signal: "BUY", confidence: 83 },
  { symbol: "INFY", name: "Infosys", price: "1,623.45", change: "+0.95%", signal: "BUY", confidence: 80 },
  { symbol: "HDFCBANK", name: "HDFC Bank", price: "1,409.50", change: "+0.92%", signal: "BUY", confidence: 75 },
  { symbol: "ADANIENT", name: "Adani Enterprises", price: "3,986.00", change: "-0.88%", signal: "SELL", confidence: 69 },
  { symbol: "SBIN", name: "State Bank of India", price: "779.80", change: "-1.42%", signal: "SELL", confidence: 65 },
];

const watchlistData = stockList.slice(0, 4);
const signalData = stockList.filter((item) => item.signal !== "BUY");

function App() {
  const [activeTab, setActiveTab] = useState("explore");

  const tabContent = {
    explore: stockList,
    watchlist: watchlistData,
    signals: signalData,
  };

  const currentItems = tabContent[activeTab] || [];

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
          <button className="icon-btn" aria-label="Search">
            <i className="fas fa-search" />
          </button>
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
          {currentItems.map((stock) => (
            <article key={stock.symbol} className="stock-row">
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
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
