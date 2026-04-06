const { useEffect, useMemo, useRef, useState } = React;

const API = {
  meta: "/api/meta",
  search: "/api/search",
  resolve: (query) => `/api/resolve?q=${encodeURIComponent(query)}`,
  dashboard: (symbol, timeframe) => `/api/dashboard/${encodeURIComponent(symbol)}?timeframe=${encodeURIComponent(timeframe)}`,
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
        height: hostRef.current.clientHeight,
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
  const [query, setQuery] = useState("RELIANCE");
  const [selectedTimeframe, setSelectedTimeframe] = useState("1d");
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function boot() {
      try {
        await loadDashboard(query, selectedTimeframe);
      } catch (err) {
        setError(err.message);
      }
    }
    boot();
  }, []);

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

  async function resolveSelection(rawQuery) {
    const trimmed = rawQuery.trim();
    if (!trimmed) return null;
    const resolved = await fetchJson(API.resolve(trimmed));
    return resolved;
  }

  async function submitDashboard(rawQuery) {
    const resolved = await resolveSelection(rawQuery);
    if (!resolved || !resolved.symbol) return;
    setQuery(resolved.name || resolved.symbol);
    await loadDashboard(resolved.symbol, selectedTimeframe);
  }

  async function handleTimeframeChange(next) {
    setSelectedTimeframe(next);
    await loadDashboard((dashboard && dashboard.symbol) || query, next);
  }

  return (
    <div className="app-shell">
      <div className="top-bar">
        <div className="search-controls">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Enter stock symbol"
          />
          <select value={selectedTimeframe} onChange={(event) => handleTimeframeChange(event.target.value)}>
            {TIMEFRAME_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <button onClick={() => submitDashboard(query)}>Analyze</button>
        </div>
      </div>

      <div className="main-content">
        <div className="chart-section">
          {dashboard && dashboard.chart ? <CandlestickChart chart={dashboard.chart} /> : <div className="chart-placeholder">No chart yet.</div>}
        </div>
        <div className="cards-section">
          <MetricCard label="Current Price" value={dashboard ? formatCurrency(dashboard.price) : "--"} />
          <MetricCard label="Trend" value={dashboard ? dashboard.trend : "--"} tone={signalTone(dashboard && dashboard.signal)} />
          <MetricCard label="Confidence" value={dashboard ? `${dashboard.confidence}%` : "--"} />
          <div className="levels-section">
            <MetricCard label="Entry" value={dashboard ? formatCurrency(dashboard.entry) : "--"} />
            <MetricCard label="Target" value={dashboard ? formatCurrency(dashboard.target) : "--"} />
            <MetricCard label="Stop Loss" value={dashboard ? formatCurrency(dashboard.stopLoss) : "--"} />
          </div>
        </div>
      </div>

      <div className="bottom-section">
        <h3>AI Explanation</h3>
        <ul>
          {dashboard && dashboard.dynamicExplanation
            ? dashboard.dynamicExplanation.bullets.map((item) => <li key={item}>{item}</li>)
            : <li>Run an analysis to generate the market explanation.</li>}
        </ul>
      </div>

      {loading && <div className="loading-overlay"><span className="spinner" /> <span>Loading...</span></div>}
      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);