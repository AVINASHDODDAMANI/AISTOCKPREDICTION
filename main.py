import os
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from urllib.parse import quote_plus
from urllib.request import urlopen
import xml.etree.ElementTree as ET

import joblib
import numpy as np
import pandas as pd
import pytz
import yfinance as yf
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from stocks_catalog import SECTOR_OPTIONS, STOCK_CATALOG

app = FastAPI(title="Indian Stock AI Analyzer")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "model.pkl")

DEFAULT_WATCHLIST = [
    "RELIANCE",
    "TCS",
    "INFY",
    "HDFCBANK",
    "ICICIBANK",
    "SBIN",
]

POSITIVE_KEYWORDS = {
    "surge",
    "growth",
    "profit",
    "gains",
    "gain",
    "beats",
    "beat",
    "strong",
    "bullish",
    "upgrade",
    "expands",
    "expansion",
    "record",
    "rise",
    "rises",
    "up",
    "buy",
    "outperform",
    "order win",
    "partnership",
}

NEGATIVE_KEYWORDS = {
    "fall",
    "falls",
    "loss",
    "losses",
    "weak",
    "miss",
    "misses",
    "cuts",
    "cut",
    "downgrade",
    "bearish",
    "drops",
    "drop",
    "down",
    "fraud",
    "probe",
    "penalty",
    "decline",
    "risk",
    "lawsuit",
}


def load_model():
    if not os.path.exists(MODEL_PATH):
        return None
    try:
        return joblib.load(MODEL_PATH)
    except Exception:
        return None


model = load_model()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def fix_symbol(symbol: str) -> str:
    clean = symbol.upper().strip()
    if not clean.endswith(".NS"):
        clean += ".NS"
    return clean


def normalize_stock_query(query: str) -> str:
    return query.upper().replace(".NS", "").strip()


def resolve_stock_query(query: str) -> Dict[str, str]:
    clean_query = normalize_stock_query(query)

    for stock in STOCK_CATALOG:
        if clean_query == stock["symbol"] or clean_query == stock["name"].upper():
            return stock

    for stock in STOCK_CATALOG:
        name_upper = stock["name"].upper()
        if clean_query in stock["symbol"] or clean_query in name_upper:
            return stock

    live_results = search_yahoo_india(clean_query, limit=1)
    if live_results:
        return live_results[0]

    return {"symbol": clean_query, "name": clean_query.title()}


def search_stock_catalog(query: str, limit: int = 8, sector: str = "") -> List[Dict[str, str]]:
    clean_query = normalize_stock_query(query)
    selected_sector = sector.strip().lower()
    catalog = [
        stock for stock in STOCK_CATALOG
        if not selected_sector or stock["sector"].lower() == selected_sector
    ]

    if not clean_query:
        return catalog[:limit]

    ranked_matches = []
    for stock in catalog:
        symbol = stock["symbol"]
        name = stock["name"]
        name_upper = name.upper()
        sector_name = stock["sector"].upper()

        score = 0
        if symbol.startswith(clean_query):
            score += 4
        if name_upper.startswith(clean_query):
            score += 5
        if sector_name.startswith(clean_query):
            score += 1
        if clean_query in symbol:
            score += 2
        if clean_query in name_upper:
            score += 3
        if clean_query in sector_name:
            score += 1

        if score > 0:
            ranked_matches.append((score, stock))

    ranked_matches.sort(key=lambda item: (-item[0], item[1]["name"]))
    unique_results = []
    seen_symbols = set()

    for _, stock in ranked_matches:
        if stock["symbol"] in seen_symbols:
            continue
        seen_symbols.add(stock["symbol"])
        unique_results.append(stock)
        if len(unique_results) >= limit:
            break

    return unique_results


def search_yahoo_india(query: str, limit: int = 8) -> List[Dict[str, str]]:
    trimmed_query = query.strip()
    if not trimmed_query:
        return []

    try:
        search = yf.Search(
            trimmed_query,
            max_results=max(limit * 2, 10),
            news_count=0,
            lists_count=0,
            enable_fuzzy_query=True,
            raise_errors=False,
        )
        quotes = getattr(search, "quotes", []) or []
    except Exception:
        return []

    results = []
    seen_symbols = set()

    for quote in quotes:
        symbol = str(quote.get("symbol", "")).upper().replace(".NS", "")
        short_name = quote.get("shortname") or quote.get("longname") or symbol
        exchange = str(quote.get("exchange", "")).upper()
        quote_type = str(quote.get("quoteType", "")).upper()

        if not symbol:
            continue
        if symbol in seen_symbols:
            continue
        if ".NS" not in str(quote.get("symbol", "")).upper() and "NSE" not in exchange:
            continue
        if quote_type and quote_type not in {"EQUITY", "MUTUALFUND", "ETF"}:
            continue

        seen_symbols.add(symbol)
        results.append(
            {
                "symbol": symbol,
                "name": str(short_name),
                "sector": "Live Search",
            }
        )

        if len(results) >= limit:
            break

    return results


def combined_stock_search(query: str, limit: int = 8, sector: str = "") -> List[Dict[str, str]]:
    local_results = search_stock_catalog(query, limit=limit, sector=sector)
    if sector:
        return local_results

    live_results = search_yahoo_india(query, limit=limit)

    merged = []
    seen_symbols = set()

    for stock in local_results + live_results:
        symbol = stock["symbol"]
        if symbol in seen_symbols:
            continue
        seen_symbols.add(symbol)
        merged.append(stock)
        if len(merged) >= limit:
            break

    return merged


def get_ist_timestamp() -> str:
    ist = pytz.timezone("Asia/Kolkata")
    return datetime.now(ist).strftime("%d-%m-%Y %H:%M:%S")


def calculate_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0).rolling(period).mean()
    loss = (-delta.clip(upper=0)).rolling(period).mean()
    rs = gain / loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def prepare_dataframe(symbol: str) -> pd.DataFrame:
    df = yf.download(symbol, period="6mo", interval="1d", progress=False)

    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    if df.empty:
        return df

    df["Return"] = df["Close"].pct_change()
    df["MA10"] = df["Close"].rolling(10).mean()
    df["MA20"] = df["Close"].rolling(20).mean()
    df["MA50"] = df["Close"].rolling(50).mean()
    df["Momentum5"] = df["Close"].pct_change(5)
    df["Volatility14"] = df["Return"].rolling(14).std() * np.sqrt(14)
    df["RSI14"] = calculate_rsi(df["Close"], 14)
    return df.dropna()


def heuristic_signal(latest: pd.Series) -> Tuple[str, int, List[str]]:
    score = 0
    reasons = []

    close_price = float(latest["Close"])
    ma20 = float(latest["MA20"])
    ma50 = float(latest["MA50"])
    rsi = float(latest["RSI14"])
    momentum = float(latest["Momentum5"])
    daily_return = float(latest["Return"])

    if close_price > ma20 > ma50:
        score += 2
        reasons.append("Price is trading above 20-day and 50-day moving averages.")
    elif close_price > ma20:
        score += 1
        reasons.append("Price is trading above the 20-day moving average.")
    else:
        score -= 1
        reasons.append("Price is below the 20-day moving average.")

    if momentum > 0.03:
        score += 2
        reasons.append("5-day momentum is strong and positive.")
    elif momentum > 0:
        score += 1
        reasons.append("5-day momentum is positive.")
    elif momentum < -0.03:
        score -= 2
        reasons.append("5-day momentum is sharply negative.")
    else:
        score -= 1
        reasons.append("5-day momentum is weak.")

    if 45 <= rsi <= 65:
        score += 1
        reasons.append("RSI is in a healthy trend zone.")
    elif rsi < 35:
        score += 1
        reasons.append("RSI suggests the stock may be oversold.")
    elif rsi > 75:
        score -= 2
        reasons.append("RSI suggests the stock is overheated.")

    if daily_return > 0.015:
        score += 1
        reasons.append("Latest session closed with strong positive return.")
    elif daily_return < -0.015:
        score -= 1
        reasons.append("Latest session closed with notable weakness.")

    if score >= 4:
        return "STRONG BUY", score, reasons
    if score >= 2:
        return "BUY", score, reasons
    if score >= 0:
        return "HOLD", score, reasons
    if score <= -4:
        return "STRONG SELL", score, reasons
    return "SELL", score, reasons


def model_signal(latest: pd.Series) -> Optional[str]:
    if model is None:
        return None

    try:
        features = np.array([[latest["Return"], latest["MA10"], latest["MA20"]]])
        prediction = model.predict(features)[0]
        return "BUY" if int(prediction) == 1 else "SELL"
    except Exception:
        return None


def confidence_from_score(score: int) -> int:
    return int(min(92, 50 + (abs(score) * 10)))


def analyze_stock(symbol: str) -> Dict:
    resolved_stock = resolve_stock_query(symbol)
    display_symbol = resolved_stock["symbol"]
    company_name = resolved_stock["name"]
    normalized_symbol = fix_symbol(display_symbol)
    current_time = get_ist_timestamp()

    try:
        df = prepare_dataframe(normalized_symbol)
        if df.empty:
            return {
                "stock": normalized_symbol,
                "company_symbol": display_symbol,
                "company_name": company_name,
                "signal": "NO DATA",
                "trend": "Unavailable",
                "confidence": 0,
                "current_price": None,
                "entry_zone": None,
                "target_price": None,
                "stop_loss": None,
                "rsi": None,
                "momentum_5d": None,
                "volatility": None,
                "model_signal": None,
                "summary": "No recent NSE data was returned for this symbol.",
                "reasons": [],
                "date_time_ist": current_time,
                "disclaimer": "This is an analytical tool, not guaranteed investment advice.",
            }

        latest = df.iloc[-1]
        current_price = round(float(latest["Close"]), 2)
        rsi = round(float(latest["RSI14"]), 2)
        momentum = round(float(latest["Momentum5"]) * 100, 2)
        volatility = round(float(latest["Volatility14"]) * 100, 2)

        signal, score, reasons = heuristic_signal(latest)
        ai_model_view = model_signal(latest)

        if ai_model_view == "BUY" and signal in {"HOLD", "SELL"}:
            score += 1
            signal = "BUY" if score >= 2 else "HOLD"
            reasons.append("The trained model also leans bullish.")
        elif ai_model_view == "SELL" and signal in {"HOLD", "BUY"}:
            score -= 1
            signal = "SELL" if score < 0 else "HOLD"
            reasons.append("The trained model also leans bearish.")

        confidence = confidence_from_score(score)
        trend = "Bullish" if score > 1 else "Bearish" if score < 0 else "Sideways"

        entry_zone = round(current_price * 0.992, 2)
        target_price = round(current_price * 1.03, 2) if score >= 0 else round(current_price * 0.97, 2)
        stop_loss = round(current_price * 0.98, 2) if score >= 0 else round(current_price * 1.02, 2)

        summary = (
            f"{display_symbol} looks {trend.lower()} with a "
            f"{signal.lower()} bias based on moving averages, momentum, RSI, and recent price action."
        )

        return {
            "stock": normalized_symbol,
            "company_symbol": display_symbol,
            "company_name": company_name,
            "signal": signal,
            "trend": trend,
            "confidence": confidence,
            "current_price": current_price,
            "entry_zone": entry_zone,
            "target_price": target_price,
            "stop_loss": stop_loss,
            "rsi": rsi,
            "momentum_5d": momentum,
            "volatility": volatility,
            "model_signal": ai_model_view,
            "summary": summary,
            "reasons": reasons,
            "date_time_ist": current_time,
            "disclaimer": "This is an analytical tool for education and research. It cannot guarantee future market direction.",
        }

    except Exception as exc:
        return {
            "stock": normalized_symbol,
            "company_symbol": display_symbol,
            "company_name": company_name,
            "signal": "ERROR",
            "trend": "Unavailable",
            "confidence": 0,
            "current_price": None,
            "entry_zone": None,
            "target_price": None,
            "stop_loss": None,
            "rsi": None,
            "momentum_5d": None,
            "volatility": None,
            "model_signal": None,
            "summary": "The analysis could not be completed for this stock.",
            "reasons": [str(exc)],
            "date_time_ist": current_time,
            "disclaimer": "This is an analytical tool, not guaranteed investment advice.",
        }


def get_stock_history(symbol: str, period: str = "3mo", interval: str = "1d") -> Dict:
    resolved_stock = resolve_stock_query(symbol)
    display_symbol = resolved_stock["symbol"]
    company_name = resolved_stock["name"]
    normalized_symbol = fix_symbol(display_symbol)
    current_time = get_ist_timestamp()

    try:
        df = yf.download(normalized_symbol, period=period, interval=interval, progress=False)

        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)

        if df.empty:
            return {
                "stock": normalized_symbol,
                "company_symbol": display_symbol,
                "company_name": company_name,
                "generated_at_ist": current_time,
                "points": [],
                "error": "No recent data was returned for this symbol.",
            }

        df = df.tail(60).copy()
        points = []
        for index, row in df.iterrows():
            points.append(
                {
                    "date": index.strftime("%Y-%m-%d"),
                    "open": round(float(row["Open"]), 2),
                    "high": round(float(row["High"]), 2),
                    "low": round(float(row["Low"]), 2),
                    "close": round(float(row["Close"]), 2),
                    "volume": int(row["Volume"]) if not pd.isna(row["Volume"]) else 0,
                }
            )

        return {
            "stock": normalized_symbol,
            "company_symbol": display_symbol,
            "company_name": company_name,
            "generated_at_ist": current_time,
            "points": points,
            "error": None,
        }
    except Exception as exc:
        return {
            "stock": normalized_symbol,
            "company_symbol": display_symbol,
            "company_name": company_name,
            "generated_at_ist": current_time,
            "points": [],
            "error": str(exc),
        }


def score_headline_sentiment(text: str) -> int:
    content = text.lower()
    score = 0

    for keyword in POSITIVE_KEYWORDS:
        if keyword in content:
            score += 1

    for keyword in NEGATIVE_KEYWORDS:
        if keyword in content:
            score -= 1

    return score


def classify_sentiment(score: int) -> str:
    if score >= 2:
        return "Positive"
    if score <= -2:
        return "Negative"
    return "Neutral"


def get_stock_news(symbol: str) -> Dict:
    resolved_stock = resolve_stock_query(symbol)
    clean_symbol = resolved_stock["symbol"]
    company_name = resolved_stock["name"]
    current_time = get_ist_timestamp()
    query = quote_plus(f"{clean_symbol} NSE stock")
    rss_url = f"https://news.google.com/rss/search?q={query}&hl=en-IN&gl=IN&ceid=IN:en"

    try:
        with urlopen(rss_url, timeout=10) as response:
            xml_bytes = response.read()

        root = ET.fromstring(xml_bytes)
        items = root.findall(".//item")

        articles = []
        sentiment_total = 0

        for item in items[:6]:
            title = item.findtext("title", default="No title")
            link = item.findtext("link", default="")
            pub_date = item.findtext("pubDate", default="")
            score = score_headline_sentiment(title)
            sentiment_total += score

            articles.append(
                {
                    "title": title,
                    "link": link,
                    "published_at": pub_date,
                    "sentiment": classify_sentiment(score),
                    "sentiment_score": score,
                }
            )

        overall = classify_sentiment(sentiment_total)

        return {
            "stock": clean_symbol,
            "company_name": company_name,
            "generated_at_ist": current_time,
            "overall_sentiment": overall,
            "sentiment_score": sentiment_total,
            "articles": articles,
            "error": None,
        }
    except Exception as exc:
        return {
            "stock": clean_symbol,
            "company_name": company_name,
            "generated_at_ist": current_time,
            "overall_sentiment": "Unavailable",
            "sentiment_score": 0,
            "articles": [],
            "error": str(exc),
        }


@app.get("/")
def root():
    return FileResponse(os.path.join(BASE_DIR, "index.html"))


@app.get("/api")
def api_root():
    return {
        "message": "Indian Stock AI Analyzer API is running.",
        "watchlist": DEFAULT_WATCHLIST,
        "model_loaded": model is not None,
    }


@app.get("/analyze")
def analyze(symbol: str = Query(..., description="NSE stock symbol like RELIANCE or TCS")):
    return analyze_stock(symbol)


@app.get("/history")
def history(
    symbol: str = Query(..., description="NSE stock symbol like RELIANCE or TCS"),
    period: str = Query("3mo", description="Data period like 1mo, 3mo, 6mo"),
    interval: str = Query("1d", description="Interval like 1d, 1h"),
):
    return get_stock_history(symbol, period=period, interval=interval)


@app.get("/news")
def news(symbol: str = Query(..., description="NSE stock symbol like RELIANCE or TCS")):
    return get_stock_news(symbol)


@app.get("/search-stocks")
def search_stocks(
    q: str = Query("", description="Stock name or ticker query"),
    sector: str = Query("", description="Optional sector filter"),
):
    results = combined_stock_search(q, sector=sector)
    return {
        "query": q,
        "sector": sector,
        "sectors": SECTOR_OPTIONS,
        "results": results,
    }


@app.get("/sectors")
def sectors():
    return {
        "sectors": SECTOR_OPTIONS,
    }


@app.get("/market-overview")
def market_overview():
    return {
        "generated_at_ist": get_ist_timestamp(),
        "stocks": [analyze_stock(symbol) for symbol in DEFAULT_WATCHLIST],
    }


@app.get("/script.js")
def frontend_script():
    return FileResponse(os.path.join(BASE_DIR, "script.js"))


@app.get("/style.css")
def frontend_style():
    return FileResponse(os.path.join(BASE_DIR, "style.css"))
