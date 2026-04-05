# AI Stock Trading Dashboard - Complete Implementation

## 🚀 Overview

A comprehensive AI-powered stock trading dashboard built with **FastAPI** backend and **React** frontend. Features real-time market analysis with technical indicators, multi-timeframe analysis, AI signals, watchlist management, and stock comparison tools.

## 📋 Features

### Frontend (React)
- **Modern Dashboard UI** with responsive design
- **Real-time Candlestick Charts** with Lightweight Charts library
- **Multiple Views:**
  - Dashboard: Comprehensive stock analysis
  - Watchlist: Save and track favorite stocks
  - Compare: Side-by-side comparison of up to 3 stocks
  - Auth: User registration and login

- **Technical Indicators:**
  - RSI (14): Relative Strength Index
  - MACD: Moving Average Convergence Divergence
  - Bollinger Bands: Price volatility bands
  - Moving Averages: 20-day and 50-day
  - Momentum: Price momentum analysis
  - Volatility: 14-period volatility

- **Multi-Timeframe Analysis:**
  - 5-minute (5m)
  - 15-minute (15m)
  - 1-hour (1h)
  - 1-day (1d)

- **Trading Signals:**
  - AI-powered BUY/SELL signals
  - Confidence scoring
  - Entry, Target, and Stop Loss levels
  - Automated trading recommendations

### Backend (FastAPI)
- **RESTful APIs:**
  - `/api/dashboard/{symbol}` - Full stock analysis
  - `/api/compare` - Compare multiple stocks
  - `/api/watchlist` - Get user watchlist
  - `/api/search` - Search stocks
  - `/api/portfolio/stats` - Portfolio metrics
  - `/api/market/indexes` - Market indexes
  - `/api/market/top-movers` - Top performing stocks

- **Authentication:**
  - User registration with email or phone
  - Secure JWT-based authentication
  - Session management
  - Watchlist persistence

- **Data Processing:**
  - Real-time market data from Yahoo Finance
  - Technical indicator calculations
  - News sentiment analysis
  - Multi-symbol analysis with parallel processing

## 📁 Project Structure

```
AISTOCKPREDICTION/
├── main.py                 # FastAPI backend
├── stocks_catalog.py       # Stock and sector data
├── app.jsx                 # React frontend component
├── index.html              # HTML entry point
├── style.css               # Enhanced CSS styling
├── requirements.txt        # Python dependencies
├── render.yaml             # Render deployment config
├── app_data.db            # SQLite database (created on first run)
├── watchlist_store.json   # Default watchlist
└── model.pkl              # Trained ML model (optional)
```

## 🛠️ Installation & Setup

### Prerequisites
- Python 3.8+
- pip or conda
- Modern web browser
- Git (for version control)

### 1. Clone Repository
```bash
git clone https://github.com/yourusername/AISTOCKPREDICTION.git
cd AISTOCKPREDICTION
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Run Backend Server
```bash
python main.py
```

Server will start at `http://localhost:8000`

### 4. Access Dashboard
Open browser and navigate to:
```
http://localhost:8000
```

## 📊 API Endpoints

### Search & Resolve
```
GET /api/search?q=RELIANCE&sector=Finance
GET /api/resolve?q=RELIANCE
```

### Dashboard Analysis
```
GET /api/dashboard/RELIANCE?timeframe=1d
```

**Response:**
```json
{
  "symbol": "RELIANCE",
  "name": "Reliance Industries",
  "price": 2045.50,
  "signal": "BUY",
  "confidence": 85,
  "trend": "Bullish",
  "entry": 2040.00,
  "target": 2100.00,
  "stopLoss": 2000.00,
  "indicators": {
    "rsi": 65.5,
    "macd": 0.0123,
    "bollingerUpper": 2150.00,
    "bollingerLower": 1950.00
  }
}
```

### Watchlist Management
```
GET /api/watchlist?timeframe=1d
POST /api/watchlist (add stock)
DELETE /api/watchlist/{symbol} (remove stock)
```

### Compare Stocks
```
GET /api/compare?symbols=RELIANCE,TCS,INFY&timeframe=1d
```

### Portfolio Stats (Authenticated)
```
GET /api/portfolio/stats
```

### Market Indexes
```
GET /api/market/indexes?timeframe=1d
```

## 🔐 Authentication

### Register
```bash
POST /api/auth/register
{
  "fullName": "John Doe",
  "phone": "9876543210",
  "password": "secure_password"
}
```

### Login
```bash
POST /api/auth/login
{
  "identifier": "9876543210",
  "password": "secure_password"
}
```

## 📈 Technical Indicators Explained

### RSI (Relative Strength Index)
- **Range:** 0-100
- **Overbought:** > 70
- **Oversold:** < 30
- **Healthy:** 45-65

### MACD (Moving Average Convergence Divergence)
- **Buy Signal:** MACD > Signal Line
- **Sell Signal:** MACD < Signal Line

### Bollinger Bands
- **Upper Band:** SMA + 2×σ
- **Lower Band:** SMA - 2×σ
- **Breakout:** Price > Upper or < Lower

### Moving Averages
- **MA20:** 20-day simple moving average
- **MA50:** 50-day simple moving average
- **Trend:** Price > MA20 > MA50 = Uptrend

## 🎨 Styling & Customization

The dashboard uses a dark theme with:
- **Primary Colors:**
  - Bull (Green): `#21c17a`
  - Bear (Red): `#ff7575`
  - Neutral (Gold): `#ffd166`
  - Accent (Blue): `#4da4ff`

- **Gradients** and **Glassmorphism** effects
- **Responsive Design** for mobile and tablet
- **Smooth Animations** and transitions

## 🚀 Deployment

### Render.com
```yaml
# render.yaml already configured
runtime: python-3.11
buildCommand: "pip install -r requirements.txt"
startCommand: "uvicorn main:app --host 0.0.0.0 --port 8000"
```

### Deploy Steps
1. Push to GitHub
2. Connect repository to Render
3. Deploy automatically on push

## 📚 Libraries Used

### Backend
- `fastapi` - Web framework
- `uvicorn` - ASGI server
- `yfinance` - Market data
- `pandas` - Data analysis
- `numpy` - Numerical computing
- `joblib` - ML model loading

### Frontend
- `React 18` - UI framework
- `Lightweight-Charts` - Advanced charting
- `Chart.js` - Indicator charts
- `Babel` - JSX transpilation

## 🔧 Configuration

### Database Schema
- `users` - User accounts and authentication
- `sessions` - Active user sessions
- `user_watchlist` - Saved watchlist items

### Environment Variables
```python
# main.py
MODEL_PATH = "model.pkl"  # Path to ML model
WATCHLIST_PATH = "watchlist_store.json"
DB_PATH = "app_data.db"
```

## 📖 Usage Examples

### Adding to Watchlist
1. Click "Watchlist" tab
2. Enter stock symbol (e.g., "INFY")
3. Click "Add" button
4. Stock appears in watchlist grid

### Comparing Stocks
1. Click "Compare" tab
2. Enter up to 3 stock symbols
3. Click "Compare" button
4. View side-by-side analysis

### Analyzing Timeframes
1. Select timeframe (5m, 15m, 1h, 1d)
2. Dashboard automatically updates
3. View multi-timeframe analysis in "Timing" tab

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Find process on port 8000
lsof -i :8000
# Kill process
kill -9 <PID>
```

### Database Errors
```bash
# Reset database
rm app_data.db
python main.py  # Creates fresh database
```

### Import Errors
```bash
# Reinstall dependencies
pip install --upgrade -r requirements.txt
```

## 📝 Notes

- All prices in Indian Rupees (Rs)
- IST timezone used for timestamps
- Free tier limited to 500 API calls/day (yfinance)
- ML model predictions are suggestions only

## ⚠️ Disclaimer

This dashboard is for **research and educational purposes only**. It does not constitute financial advice. Always conduct your own research and consult with financial advisors before trading.

## 📄 License

MIT License - Feel free to use and modify

## 👨‍💻 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📞 Support

For issues and questions:
- Open GitHub Issues
- Check existing documentation
- Review error logs in console

---

**Last Updated:** April 2026
**Version:** 1.0.0-Enhanced
