import asyncio
import hashlib
import json
import os
import secrets
import sqlite3
import time
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Dict, List, Optional
from urllib.parse import quote_plus
from urllib.request import urlopen

import joblib
import numpy as np
import pandas as pd
import pytz
import yfinance as yf
from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel

from stocks_catalog import SECTOR_OPTIONS, STOCK_CATALOG

app = FastAPI(title="AI Stock Trading Dashboard")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "model.pkl")
WATCHLIST_PATH = os.path.join(BASE_DIR, "watchlist_store.json")
DB_PATH = os.path.join(BASE_DIR, "app_data.db")

SPECIAL_INSTRUMENTS = [
    {"symbol": "NIFTY", "name": "Nifty 50", "sector": "Index", "yahoo_symbol": "^NSEI", "instrument_type": "INDEX"},
    {"symbol": "BANKNIFTY", "name": "Nifty Bank", "sector": "Index", "yahoo_symbol": "^NSEBANK", "instrument_type": "INDEX"},
    {"symbol": "SENSEX", "name": "BSE Sensex", "sector": "Index", "yahoo_symbol": "^BSESN", "instrument_type": "INDEX"},
    {"symbol": "NIFTYFUT", "name": "Nifty Futures", "sector": "Derivatives", "yahoo_symbol": "^NSEI", "instrument_type": "FUTURES_PROXY"},
    {"symbol": "BANKNIFTYFUT", "name": "Bank Nifty Futures", "sector": "Derivatives", "yahoo_symbol": "^NSEBANK", "instrument_type": "FUTURES_PROXY"},
    {"symbol": "SENSEXFUT", "name": "Sensex Futures", "sector": "Derivatives", "yahoo_symbol": "^BSESN", "instrument_type": "FUTURES_PROXY"},
]

TIMEFRAME_CONFIG = {
    "5m": {"period": "5d", "interval": "5m", "label": "5 Minutes"},
    "15m": {"period": "1mo", "interval": "15m", "label": "15 Minutes"},
    "1h": {"period": "3mo", "interval": "60m", "label": "1 Hour"},
    "1d": {"period": "3mo", "interval": "1d", "label": "1 Day"},
}

POSITIVE_KEYWORDS = {
    "surge", "growth", "profit", "gains", "gain", "beats", "beat", "strong",
    "bullish", "upgrade", "expands", "expansion", "record", "rise", "rises",
    "up", "buy", "outperform", "order win", "partnership",
}
NEGATIVE_KEYWORDS = {
    "fall", "falls", "loss", "losses", "weak", "miss", "misses", "cuts", "cut",
    "downgrade", "bearish", "drops", "drop", "down", "fraud", "probe",
    "penalty", "decline", "risk", "lawsuit",
}


class WatchlistPayload(BaseModel):
    symbol: str


class RegisterPayload(BaseModel):
    fullName: str
    phone: str = ""
    email: str = ""
    password: str


class LoginPayload(BaseModel):
    identifier: str
    password: str


def load_model():
    if not os.path.exists(MODEL_PATH):
        return None
    try:
        return joblib.load(MODEL_PATH)
    except Exception:
        return None


class TTLCache:
    def __init__(self):
        self._values: Dict[str, tuple[float, object]] = {}

    def get(self, key: str, ttl_seconds: int):
        record = self._values.get(key)
        if not record:
            return None
        created_at, value = record
        if time.time() - created_at > ttl_seconds:
            self._values.pop(key, None)
            return None
        return value

    def set(self, key: str, value: object):
        self._values[key] = (time.time(), value)


model = load_model()
cache = TTLCache()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def db_connection():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db():
    connection = db_connection()
    cursor = connection.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT NOT NULL,
            phone TEXT UNIQUE,
            email TEXT UNIQUE,
            password_salt TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    cursor.execute("PRAGMA table_info(users)")
    columns = [row[1] for row in cursor.fetchall()]
    if "email" not in columns:
        cursor.execute("ALTER TABLE users ADD COLUMN email TEXT")
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS user_watchlist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            symbol TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(user_id, symbol),
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
        """
    )
    connection.commit()
    connection.close()


@app.on_event("startup")
def startup_event():
    init_db()


def get_ist_timestamp() -> str:
    ist = pytz.timezone("Asia/Kolkata")
    return datetime.now(ist).strftime("%d-%m-%Y %H:%M:%S")


def normalize_phone(phone: str) -> str:
    digits = "".join(character for character in phone if character.isdigit())
    if phone and len(digits) < 10:
        raise HTTPException(status_code=400, detail="Enter a valid phone number.")
    return digits


def normalize_email(email: str) -> str:
    normalized = email.strip().lower()
    if normalized and ("@" not in normalized or "." not in normalized.split("@")[-1]):
        raise HTTPException(status_code=400, detail="Enter a valid email address.")
    return normalized


def hash_password(password: str, salt_hex: str) -> str:
    salt = bytes.fromhex(salt_hex)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 120000)
    return derived.hex()


def create_password_hash(password: str) -> tuple[str, str]:
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
    salt_hex = secrets.token_hex(16)
    return salt_hex, hash_password(password, salt_hex)


def fetch_user_by_phone(phone: str):
    connection = db_connection()
    try:
        cursor = connection.cursor()
        cursor.execute("SELECT * FROM users WHERE phone = ?", (phone,))
        return cursor.fetchone()
    finally:
        connection.close()


def fetch_user_by_email(email: str):
    connection = db_connection()
    try:
        cursor = connection.cursor()
        cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
        return cursor.fetchone()
    finally:
        connection.close()


def fetch_user_by_identifier(identifier: str):
    normalized_email = normalize_email(identifier)
    if normalized_email:
        return fetch_user_by_email(normalized_email)
    normalized_phone = normalize_phone(identifier)
    if normalized_phone:
        return fetch_user_by_phone(normalized_phone)
    return None


def create_session(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    created_at = datetime.utcnow()
    expires_at = created_at.timestamp() + (60 * 60 * 24 * 7)
    connection = db_connection()
    try:
        cursor = connection.cursor()
        cursor.execute(
            "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (token, user_id, created_at.isoformat(), str(expires_at)),
        )
        connection.commit()
    finally:
        connection.close()
    return token


def get_user_from_token(token: str):
    connection = db_connection()
    try:
        cursor = connection.cursor()
        cursor.execute(
            """
            SELECT users.* FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.token = ?
            """,
            (token,),
        )
        user = cursor.fetchone()
        cursor.execute("SELECT expires_at FROM sessions WHERE token = ?", (token,))
        session = cursor.fetchone()
        if not user or not session:
            return None
        if float(session["expires_at"]) < datetime.utcnow().timestamp():
            cursor.execute("DELETE FROM sessions WHERE token = ?", (token,))
            connection.commit()
            return None
        return user
    finally:
        connection.close()


def parse_bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    prefix = "Bearer "
    if not authorization.startswith(prefix):
        return None
    return authorization[len(prefix):].strip() or None


def require_authenticated_user(authorization: Optional[str]):
    token = parse_bearer_token(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Login required.")
    user = get_user_from_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Session expired or invalid.")
    return user, token


def normalize_alias(value: str) -> str:
    return (
        value.upper()
        .replace(".NS", "")
        .replace(" ", "")
        .replace("-", "")
        .replace("&", "")
        .strip()
    )


def fix_symbol(symbol: str) -> str:
    clean = symbol.upper().strip()
    if clean.startswith("^"):
        return clean
    if not clean.endswith(".NS"):
        clean += ".NS"
    return clean


def resolved_yahoo_symbol(resolved_stock: Dict[str, str]) -> str:
    if resolved_stock.get("yahoo_symbol"):
        return str(resolved_stock["yahoo_symbol"])
    return fix_symbol(resolved_stock["symbol"])


def symbol_candidates(resolved_stock: Dict[str, str]) -> List[str]:
    candidates = []
    primary = resolved_yahoo_symbol(resolved_stock)
    candidates.append(primary)

    base_symbol = str(resolved_stock.get("symbol", "")).upper().replace(".NS", "").strip()
    if base_symbol:
        candidates.append(f"{base_symbol}.NS")
        candidates.append(f"{base_symbol}.BO")
        candidates.append(base_symbol)

    cleaned = []
    seen = set()
    for item in candidates:
        if not item:
            continue
        if item in seen:
            continue
        seen.add(item)
        cleaned.append(item)
    return cleaned


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
        raw_symbol = str(quote.get("symbol", "")).upper()
        symbol = raw_symbol.replace(".NS", "")
        short_name = quote.get("shortname") or quote.get("longname") or symbol
        exchange = str(quote.get("exchange", "")).upper()
        quote_type = str(quote.get("quoteType", "")).upper()

        if not symbol or symbol in seen_symbols:
            continue
        if ".NS" not in raw_symbol and "NSE" not in exchange and raw_symbol not in {"^NSEI", "^NSEBANK", "^BSESN"}:
            continue
        if quote_type and quote_type not in {"EQUITY", "ETF", "MUTUALFUND", "INDEX", "FUTURE"}:
            continue

        seen_symbols.add(symbol)
        results.append(
            {
                "symbol": symbol,
                "name": str(short_name),
                "sector": "Live Search",
                "instrument_type": quote_type or "UNKNOWN",
                "yahoo_symbol": raw_symbol if raw_symbol.startswith("^") else quote.get("symbol", ""),
            }
        )
        if len(results) >= limit:
            break
    return results


def resolve_symbol(query: str) -> Dict[str, str]:
    clean_query = normalize_alias(query)

    for instrument in SPECIAL_INSTRUMENTS:
        aliases = {normalize_alias(instrument["symbol"]), normalize_alias(instrument["name"])}
        if instrument["symbol"] == "NIFTYFUT":
            aliases.update({"NIFTYFUT", "NIFTYFUTURE", "NIFTYFUTURES", "NIFTY50FUT"})
        if instrument["symbol"] == "BANKNIFTYFUT":
            aliases.update({"BANKNIFTYFUT", "BANKNIFTYFUTURE", "BANKNIFTYFUTURES"})
        if instrument["symbol"] == "SENSEXFUT":
            aliases.update({"SENSEXFUT", "SENSEXFUTURE", "SENSEXFUTURES"})
        if clean_query in aliases:
            return instrument

    for stock in STOCK_CATALOG:
        if clean_query == normalize_alias(stock["symbol"]) or clean_query == normalize_alias(stock["name"]):
            enriched = dict(stock)
            enriched["instrument_type"] = "EQUITY"
            return enriched

    for stock in STOCK_CATALOG:
        if clean_query in normalize_alias(stock["symbol"]) or clean_query in normalize_alias(stock["name"]):
            enriched = dict(stock)
            enriched["instrument_type"] = "EQUITY"
            return enriched

    live_results = search_yahoo_india(clean_query, limit=1)
    if live_results:
        return live_results[0]

    return {
        "symbol": clean_query,
        "name": clean_query.title(),
        "sector": "Unknown",
        "instrument_type": "EQUITY",
    }


def search_universe(query: str, sector: str = "", limit: int = 8) -> List[Dict[str, str]]:
    clean_query = normalize_alias(query)
    selected_sector = sector.strip().lower()
    catalog = []

    for stock in STOCK_CATALOG + SPECIAL_INSTRUMENTS:
        if selected_sector and stock["sector"].lower() != selected_sector:
            continue
        enriched = dict(stock)
        enriched["instrument_type"] = enriched.get("instrument_type", "EQUITY")
        catalog.append(enriched)

    ranked = []
    for stock in catalog:
        score = 0
        symbol_alias = normalize_alias(stock["symbol"])
        name_alias = normalize_alias(stock["name"])
        sector_alias = normalize_alias(stock["sector"])
        if not clean_query:
            score = 1
        else:
            if name_alias.startswith(clean_query):
                score += 5
            if symbol_alias.startswith(clean_query):
                score += 4
            if clean_query in name_alias:
                score += 3
            if clean_query in symbol_alias:
                score += 2
            if clean_query in sector_alias:
                score += 1
        if score > 0:
            ranked.append((score, stock))

    ranked.sort(key=lambda item: (-item[0], item[1]["name"]))
    results = []
    seen = set()
    for _, stock in ranked:
        if stock["symbol"] in seen:
            continue
        seen.add(stock["symbol"])
        results.append(stock)
        if len(results) >= limit:
            break

    if not selected_sector and clean_query:
        for stock in search_yahoo_india(query, limit=limit):
            if stock["symbol"] in seen:
                continue
            seen.add(stock["symbol"])
            results.append(stock)
            if len(results) >= limit:
                break
    return results


def resolve_query_to_result(query: str) -> Dict[str, str]:
    resolved = resolve_symbol(query)
    if resolved.get("sector") != "Unknown":
        return resolved

    matches = search_universe(query, limit=1)
    if matches:
        return matches[0]

    return resolved


def cached_json(key: str, ttl_seconds: int):
    return cache.get(key, ttl_seconds)


async def download_ohlc(symbols: List[str], period: str, interval: str) -> pd.DataFrame:
    symbol_key = "|".join(symbols)
    cache_key = f"ohlc::{symbol_key}::{period}::{interval}"
    ttl = 60 if interval in {"5m", "15m", "60m"} else 180
    cached = cached_json(cache_key, ttl)
    if cached is not None:
        return cached.copy()

    def _download(single_symbol: str):
        return yf.download(single_symbol, period=period, interval=interval, progress=False)

    for symbol in symbols:
        df = await asyncio.to_thread(_download, symbol)
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
        if not df.empty:
            cache.set(cache_key, df.copy())
            return df

    empty = pd.DataFrame()
    cache.set(cache_key, empty.copy())
    return empty


def ema(series: pd.Series, span: int) -> pd.Series:
    return series.ewm(span=span, adjust=False).mean()


def calculate_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def enrich_indicators(df: pd.DataFrame) -> pd.DataFrame:
    enriched = df.copy()
    enriched["Return"] = enriched["Close"].pct_change()
    enriched["EMA12"] = ema(enriched["Close"], 12)
    enriched["EMA26"] = ema(enriched["Close"], 26)
    enriched["MACD"] = enriched["EMA12"] - enriched["EMA26"]
    enriched["MACDSignal"] = ema(enriched["MACD"], 9)
    enriched["MACDHist"] = enriched["MACD"] - enriched["MACDSignal"]
    enriched["RSI14"] = calculate_rsi(enriched["Close"], 14)
    enriched["SMA20"] = enriched["Close"].rolling(20).mean()
    enriched["STD20"] = enriched["Close"].rolling(20).std()
    enriched["BBUpper"] = enriched["SMA20"] + (2 * enriched["STD20"])
    enriched["BBLower"] = enriched["SMA20"] - (2 * enriched["STD20"])
    enriched["MA20"] = enriched["Close"].rolling(20).mean()
    enriched["MA50"] = enriched["Close"].rolling(50).mean()
    enriched["Momentum5"] = enriched["Close"].pct_change(5)
    enriched["Volatility14"] = enriched["Return"].rolling(14).std() * np.sqrt(14)
    return enriched.dropna()


def confidence_from_score(score: int) -> int:
    return int(min(95, 55 + abs(score) * 8))


def classify_signal(score: int) -> str:
    if score >= 4:
        return "STRONG BUY"
    if score >= 2:
        return "BUY"
    if score <= -4:
        return "STRONG SELL"
    if score <= -2:
        return "SELL"
    return "HOLD"


def dynamic_explanation(latest: pd.Series, signal: str, trend: str, timing_bias: str, news_bias: str) -> Dict[str, object]:
    rsi = float(latest["RSI14"])
    macd = float(latest["MACD"])
    macd_signal = float(latest["MACDSignal"])
    close = float(latest["Close"])
    bb_upper = float(latest["BBUpper"])
    bb_lower = float(latest["BBLower"])
    momentum = float(latest["Momentum5"]) * 100

    bullets = []

    if macd > macd_signal:
        bullets.append("MACD is above its signal line, showing bullish momentum pressure.")
    else:
        bullets.append("MACD is below its signal line, showing weakening short-term momentum.")

    if rsi > 70:
        bullets.append("RSI is in overbought territory, so upside may continue but with pullback risk.")
    elif rsi < 35:
        bullets.append("RSI is near oversold territory, so a relief bounce is possible if sellers fade.")
    else:
        bullets.append("RSI is balanced enough to support continuation instead of an extreme reversal.")

    if close > bb_upper:
        bullets.append("Price is pushing above the upper Bollinger Band, which signals expansion and trend strength.")
    elif close < bb_lower:
        bullets.append("Price is below the lower Bollinger Band, which reflects heavy downside pressure.")
    else:
        bullets.append("Price is trading inside the Bollinger Bands, so the market is not in an extreme band breakout.")

    if momentum > 2:
        bullets.append("Recent momentum is clearly positive, so the next candles favor follow-through if support holds.")
    elif momentum < -2:
        bullets.append("Recent momentum is negative, so rallies may struggle unless the structure improves.")
    else:
        bullets.append("Momentum is mild, which suggests a mixed or consolidating market condition.")

    if timing_bias == "BULLISH":
        bullets.append("Most lower timeframes are bullish, which supports near-term continuation.")
    elif timing_bias == "BEARISH":
        bullets.append("Most lower timeframes are bearish, which keeps short-term downside risk active.")
    else:
        bullets.append("Lower timeframes are mixed, so the market may stay choppy until a breakout confirms direction.")

    if news_bias == "Positive":
        bullets.append("News sentiment is positive, which can add fuel to bullish price action.")
    elif news_bias == "Negative":
        bullets.append("News sentiment is negative, which can cap upside or accelerate weakness.")
    else:
        bullets.append("News sentiment is neutral, so the chart structure matters more than headlines right now.")

    outlook = (
        f"{trend} structure with a {signal.lower()} bias. "
        f"Near-term market condition looks {timing_bias.lower()} while broader context is shaped by RSI, MACD, and Bollinger positioning."
    )

    return {"summary": outlook, "bullets": bullets}


def prepare_chart_payload(df: pd.DataFrame) -> Dict[str, object]:
    points = []
    for index, row in df.tail(120).iterrows():
        points.append(
            {
                "time": index.isoformat() if hasattr(index, "isoformat") else str(index),
                "open": round(float(row["Open"]), 2),
                "high": round(float(row["High"]), 2),
                "low": round(float(row["Low"]), 2),
                "close": round(float(row["Close"]), 2),
                "volume": int(row["Volume"]) if not pd.isna(row["Volume"]) else 0,
            }
        )

    def line_payload(column: str):
        return [
            {"time": item["time"], "value": round(float(df.tail(120).iloc[idx][column]), 2)}
            for idx, item in enumerate(points)
            if not pd.isna(df.tail(120).iloc[idx][column])
        ]

    return {
        "candles": points,
        "indicators": {
            "rsi": line_payload("RSI14"),
            "macd": line_payload("MACD"),
            "macdSignal": line_payload("MACDSignal"),
            "bollingerUpper": line_payload("BBUpper"),
            "bollingerMiddle": line_payload("SMA20"),
            "bollingerLower": line_payload("BBLower"),
        },
    }


async def fetch_news(symbol: str) -> Dict[str, object]:
    cache_key = f"news::{symbol}"
    cached = cached_json(cache_key, 300)
    if cached is not None:
        return cached

    resolved = resolve_symbol(symbol)
    query = quote_plus(f'{resolved["symbol"]} NSE stock')
    rss_url = f"https://news.google.com/rss/search?q={query}&hl=en-IN&gl=IN&ceid=IN:en"

    def _read_news():
        with urlopen(rss_url, timeout=10) as response:
            return response.read()

    try:
        xml_bytes = await asyncio.to_thread(_read_news)
        root = ET.fromstring(xml_bytes)
        items = root.findall(".//item")
        sentiment_total = 0
        articles = []
        for item in items[:5]:
            title = item.findtext("title", default="No title")
            link = item.findtext("link", default="")
            published = item.findtext("pubDate", default="")
            score = 0
            content = title.lower()
            for keyword in POSITIVE_KEYWORDS:
                if keyword in content:
                    score += 1
            for keyword in NEGATIVE_KEYWORDS:
                if keyword in content:
                    score -= 1
            sentiment_total += score
            articles.append(
                {
                    "title": title,
                    "link": link,
                    "publishedAt": published,
                    "sentiment": "Positive" if score > 0 else "Negative" if score < 0 else "Neutral",
                }
            )
        overall = "Positive" if sentiment_total > 1 else "Negative" if sentiment_total < -1 else "Neutral"
        payload = {"overall": overall, "score": sentiment_total, "articles": articles}
        cache.set(cache_key, payload)
        return payload
    except Exception:
        return {"overall": "Neutral", "score": 0, "articles": []}


async def analyze_timeframe(symbol: str, timeframe: str) -> Dict[str, object]:
    if timeframe not in TIMEFRAME_CONFIG:
        raise HTTPException(status_code=400, detail="Unsupported timeframe")

    resolved = resolve_symbol(symbol)
    candidates = symbol_candidates(resolved)
    config = TIMEFRAME_CONFIG[timeframe]
    df_raw = await download_ohlc(candidates, config["period"], config["interval"])

    if df_raw.empty:
        raise HTTPException(status_code=404, detail=f'No market data found for "{resolved["name"]}" in timeframe {timeframe}.')

    df = enrich_indicators(df_raw)
    if df.empty:
        raise HTTPException(status_code=404, detail="Insufficient data for indicators")

    latest = df.iloc[-1]
    score = 0
    reasons = []

    close = float(latest["Close"])
    ma20 = float(latest["MA20"])
    ma50 = float(latest["MA50"]) if not pd.isna(latest["MA50"]) else ma20
    rsi = float(latest["RSI14"])
    macd = float(latest["MACD"])
    macd_signal = float(latest["MACDSignal"])
    momentum = float(latest["Momentum5"])
    bb_upper = float(latest["BBUpper"])
    bb_lower = float(latest["BBLower"])

    if close > ma20:
        score += 1
        reasons.append("Price is trading above the 20-period moving average.")
    else:
        score -= 1
        reasons.append("Price is trading below the 20-period moving average.")

    if close > ma20 > ma50:
        score += 1
        reasons.append("Trend structure is aligned above the 20 and 50-period moving averages.")
    elif close < ma20 < ma50:
        score -= 1
        reasons.append("Trend structure is aligned below the 20 and 50-period moving averages.")

    if macd > macd_signal:
        score += 1
        reasons.append("MACD is above the signal line.")
    else:
        score -= 1
        reasons.append("MACD is below the signal line.")

    if 45 <= rsi <= 65:
        score += 1
        reasons.append("RSI is in a healthy trend continuation zone.")
    elif rsi > 70:
        score -= 1
        reasons.append("RSI is overbought and warns of exhaustion risk.")
    elif rsi < 35:
        score += 1
        reasons.append("RSI is oversold and may support a bounce.")

    if momentum > 0.02:
        score += 1
        reasons.append("Momentum is positive over the recent lookback window.")
    elif momentum < -0.02:
        score -= 1
        reasons.append("Momentum is negative over the recent lookback window.")

    if close > bb_upper:
        score += 1
        reasons.append("Price is breaking above the upper Bollinger Band.")
    elif close < bb_lower:
        score -= 1
        reasons.append("Price is breaking below the lower Bollinger Band.")

    ai_model_signal = None
    if model is not None:
        try:
            features = np.array([[latest["Return"], latest["MA20"], latest["MA50"]]])
            ai_model_signal = "BUY" if int(model.predict(features)[0]) == 1 else "SELL"
            if ai_model_signal == "BUY":
                score += 1
            else:
                score -= 1
        except Exception:
            ai_model_signal = None

    signal = classify_signal(score)
    confidence = confidence_from_score(score)
    trend = "Bullish" if score > 1 else "Bearish" if score < -1 else "Sideways"

    timing_tasks = []
    for lower_tf in ["5m", "15m", "1h"]:
        config_tf = TIMEFRAME_CONFIG[lower_tf]
        timing_tasks.append(download_ohlc(candidates, config_tf["period"], config_tf["interval"]))
    timing_raw = await asyncio.gather(*timing_tasks, return_exceptions=True)
    timing_views = []
    bullish_count = 0
    bearish_count = 0
    for lower_tf, raw in zip(["5m", "15m", "1h"], timing_raw):
        if isinstance(raw, Exception) or raw.empty:
            continue
        working = enrich_indicators(raw)
        if working.empty:
            continue
        latest_tf = working.iloc[-1]
        tf_score = 0
        if float(latest_tf["Close"]) > float(latest_tf["MA20"]):
            tf_score += 1
        if float(latest_tf["MACD"]) > float(latest_tf["MACDSignal"]):
            tf_score += 1
        if float(latest_tf["RSI14"]) > 55:
            tf_score += 1
        if float(latest_tf["RSI14"]) < 45:
            tf_score -= 1
        bias = "BULLISH" if tf_score >= 2 else "BEARISH" if tf_score <= -1 else "SIDEWAYS"
        if bias == "BULLISH":
            bullish_count += 1
        if bias == "BEARISH":
            bearish_count += 1
        timing_views.append(
            {
                "timeframe": lower_tf,
                "signal": bias,
                "confidence": confidence_from_score(tf_score),
                "summary": f'{TIMEFRAME_CONFIG[lower_tf]["label"]} structure is {bias.lower()} based on RSI, MACD, and moving-average alignment.',
            }
        )

    timing_bias = "BULLISH" if bullish_count >= 2 else "BEARISH" if bearish_count >= 2 else "SIDEWAYS"
    news = await fetch_news(symbol)
    explanation = dynamic_explanation(latest, signal, trend, timing_bias, str(news["overall"]))

    current_price = round(close, 2)
    if signal in {"BUY", "STRONG BUY"}:
        entry = round(current_price * 0.997, 2)
        target = round(current_price * 1.025, 2)
        stop_loss = round(current_price * 0.985, 2)
    elif signal in {"SELL", "STRONG SELL"}:
        entry = round(current_price * 1.003, 2)
        target = round(current_price * 0.975, 2)
        stop_loss = round(current_price * 1.015, 2)
    else:
        entry = round(current_price, 2)
        target = round(current_price * 1.01, 2)
        stop_loss = round(current_price * 0.99, 2)

    return {
        "symbol": resolved["symbol"],
        "name": resolved["name"],
        "sector": resolved.get("sector", "Unknown"),
        "instrumentType": resolved.get("instrument_type", "EQUITY"),
        "timeframe": timeframe,
        "timeframeLabel": config["label"],
        "generatedAtIST": get_ist_timestamp(),
        "price": current_price,
        "signal": signal,
        "confidence": confidence,
        "trend": trend,
        "entry": entry,
        "target": target,
        "stopLoss": stop_loss,
        "indicators": {
            "rsi": round(rsi, 2),
            "macd": round(macd, 2),
            "macdSignal": round(macd_signal, 2),
            "bollingerUpper": round(bb_upper, 2),
            "bollingerMiddle": round(float(latest["SMA20"]), 2),
            "bollingerLower": round(bb_lower, 2),
            "momentum": round(momentum * 100, 2),
            "volatility": round(float(latest["Volatility14"]) * 100, 2),
        },
        "aiModelSignal": ai_model_signal,
        "reasons": reasons,
        "dynamicExplanation": explanation,
        "news": news,
        "multiTimeframe": timing_views,
        "chart": prepare_chart_payload(df),
        "disclaimer": "This dashboard is for research and education. It does not guarantee future market direction.",
    }


async def summarize_watchlist(symbols: List[str], timeframe: str) -> List[Dict[str, object]]:
    tasks = [analyze_timeframe(symbol, timeframe) for symbol in symbols]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    summaries = []
    for symbol, result in zip(symbols, results):
        if isinstance(result, Exception):
            summaries.append({"symbol": symbol, "error": str(result)})
            continue
        summaries.append(
            {
                "symbol": result["symbol"],
                "name": result["name"],
                "price": result["price"],
                "signal": result["signal"],
                "confidence": result["confidence"],
                "trend": result["trend"],
                "entry": result["entry"],
                "target": result["target"],
                "stopLoss": result["stopLoss"],
            }
        )
    return summaries


def read_watchlist_store() -> List[str]:
    if not os.path.exists(WATCHLIST_PATH):
        return ["RELIANCE", "TCS", "INFY"]
    try:
        with open(WATCHLIST_PATH, "r", encoding="utf-8") as file:
            payload = json.load(file)
        if isinstance(payload, list):
            return [str(item).upper() for item in payload]
    except Exception:
        pass
    return ["RELIANCE", "TCS", "INFY"]


def write_watchlist_store(symbols: List[str]) -> List[str]:
    normalized = []
    seen = set()
    for symbol in symbols:
        resolved = resolve_symbol(symbol)
        if resolved["symbol"] in seen:
            continue
        seen.add(resolved["symbol"])
        normalized.append(resolved["symbol"])
    with open(WATCHLIST_PATH, "w", encoding="utf-8") as file:
        json.dump(normalized, file, indent=2)
    return normalized


def read_user_watchlist(user_id: int) -> List[str]:
    connection = db_connection()
    try:
        cursor = connection.cursor()
        cursor.execute("SELECT symbol FROM user_watchlist WHERE user_id = ? ORDER BY id DESC", (user_id,))
        rows = cursor.fetchall()
        return [row["symbol"] for row in rows]
    finally:
        connection.close()


def add_user_watchlist_symbol(user_id: int, symbol: str) -> List[str]:
    resolved = resolve_symbol(symbol)["symbol"]
    connection = db_connection()
    try:
        cursor = connection.cursor()
        cursor.execute(
            "INSERT OR IGNORE INTO user_watchlist (user_id, symbol, created_at) VALUES (?, ?, ?)",
            (user_id, resolved, get_ist_timestamp()),
        )
        connection.commit()
    finally:
        connection.close()
    return read_user_watchlist(user_id)


def remove_user_watchlist_symbol(user_id: int, symbol: str) -> List[str]:
    resolved = resolve_symbol(symbol)["symbol"]
    connection = db_connection()
    try:
        cursor = connection.cursor()
        cursor.execute("DELETE FROM user_watchlist WHERE user_id = ? AND symbol = ?", (user_id, resolved))
        connection.commit()
    finally:
        connection.close()
    return read_user_watchlist(user_id)


@app.get("/")
def root():
    return FileResponse(os.path.join(BASE_DIR, "index.html"))


@app.get("/app.jsx")
def react_app():
    return FileResponse(os.path.join(BASE_DIR, "app.jsx"), media_type="text/babel")


@app.get("/app_simple.jsx")
def react_app_simple():
    return FileResponse(os.path.join(BASE_DIR, "app_simple.jsx"), media_type="text/babel")


@app.get("/style.css")
def style():
    return FileResponse(os.path.join(BASE_DIR, "style.css"))


@app.get("/style_simple.css")
def style_simple():
    return FileResponse(os.path.join(BASE_DIR, "style_simple.css"))


@app.get("/api/meta")
def api_meta():
    return {
        "message": "AI Stock Trading Dashboard API is running.",
        "timeframes": list(TIMEFRAME_CONFIG.keys()),
        "sectors": SECTOR_OPTIONS + ["Index", "Derivatives"],
        "watchlist": read_watchlist_store(),
    }


@app.post("/api/auth/register")
def api_register(payload: RegisterPayload):
    full_name = payload.fullName.strip()
    phone = normalize_phone(payload.phone)
    email = normalize_email(payload.email)
    if not full_name:
        raise HTTPException(status_code=400, detail="Full name is required.")
    if not phone and not email:
        raise HTTPException(status_code=400, detail="Register using either phone number or email.")
    if phone and fetch_user_by_phone(phone):
        raise HTTPException(status_code=409, detail="Phone number is already registered.")
    if email and fetch_user_by_email(email):
        raise HTTPException(status_code=409, detail="Email is already registered.")

    salt_hex, password_hash = create_password_hash(payload.password)
    connection = db_connection()
    try:
        cursor = connection.cursor()
        cursor.execute(
            """
            INSERT INTO users (full_name, phone, email, password_salt, password_hash, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (full_name, phone or None, email or None, salt_hex, password_hash, get_ist_timestamp()),
        )
        connection.commit()
        user_id = cursor.lastrowid
    finally:
        connection.close()

    token = create_session(user_id)
    return {
        "token": token,
        "user": {"id": user_id, "fullName": full_name, "phone": phone or "", "email": email or ""},
    }


@app.post("/api/auth/login")
def api_login(payload: LoginPayload):
    user = fetch_user_by_identifier(payload.identifier)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid login or password.")

    if hash_password(payload.password, user["password_salt"]) != user["password_hash"]:
        raise HTTPException(status_code=401, detail="Invalid login or password.")

    token = create_session(int(user["id"]))
    return {
        "token": token,
        "user": {
            "id": int(user["id"]),
            "fullName": user["full_name"],
            "phone": user["phone"] or "",
            "email": user["email"] or "",
        },
    }


@app.get("/api/auth/me")
def api_me(authorization: Optional[str] = Header(default=None)):
    user, _ = require_authenticated_user(authorization)
    return {
        "user": {
            "id": int(user["id"]),
            "fullName": user["full_name"],
            "phone": user["phone"] or "",
            "email": user["email"] or "",
        }
    }


@app.post("/api/auth/logout")
def api_logout(authorization: Optional[str] = Header(default=None)):
    _, token = require_authenticated_user(authorization)
    connection = db_connection()
    try:
        cursor = connection.cursor()
        cursor.execute("DELETE FROM sessions WHERE token = ?", (token,))
        connection.commit()
    finally:
        connection.close()
    return {"success": True}


@app.get("/api/search")
def api_search(q: str = Query("", description="Ticker or company name"), sector: str = Query("", description="Sector filter")):
    return {"query": q, "sector": sector, "results": search_universe(q, sector=sector)}


@app.get("/api/resolve")
def api_resolve(q: str = Query(..., description="Ticker or company name")):
    return resolve_query_to_result(q)


@app.get("/api/dashboard/{symbol}")
async def api_dashboard(symbol: str, timeframe: str = Query("1d", description="5m, 15m, 1h, 1d")):
    return await analyze_timeframe(symbol, timeframe)


@app.get("/api/compare")
async def api_compare(symbols: str = Query(..., description="Comma separated symbols"), timeframe: str = Query("1d")):
    parsed = [item.strip() for item in symbols.split(",") if item.strip()]
    if len(parsed) < 2 or len(parsed) > 3:
        raise HTTPException(status_code=400, detail="Provide 2 or 3 symbols for comparison.")
    results = await summarize_watchlist(parsed, timeframe)
    return {"timeframe": timeframe, "results": results}


@app.get("/api/watchlist")
async def api_watchlist(timeframe: str = Query("1d"), authorization: Optional[str] = Header(default=None)):
    token = parse_bearer_token(authorization)
    user = get_user_from_token(token) if token else None
    symbols = read_user_watchlist(int(user["id"])) if user else read_watchlist_store()
    return {"symbols": symbols, "items": await summarize_watchlist(symbols, timeframe)}


@app.post("/api/watchlist")
async def api_watchlist_add(payload: WatchlistPayload, authorization: Optional[str] = Header(default=None)):
    user, _ = require_authenticated_user(authorization)
    updated = add_user_watchlist_symbol(int(user["id"]), payload.symbol)
    return {"symbols": updated}


@app.delete("/api/watchlist/{symbol}")
async def api_watchlist_delete(symbol: str, authorization: Optional[str] = Header(default=None)):
    user, _ = require_authenticated_user(authorization)
    updated = remove_user_watchlist_symbol(int(user["id"]), symbol)
    return {"symbols": updated}


@app.get("/api/portfolio/stats")
async def api_portfolio_stats(authorization: Optional[str] = Header(default=None)):
    """Get portfolio statistics and performance metrics"""
    token = parse_bearer_token(authorization)
    user = get_user_from_token(token) if token else None
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required for portfolio stats")
    
    symbols = read_user_watchlist(int(user["id"]))
    
    if not symbols:
        return {
            "totalStocks": 0,
            "bullishCount": 0,
            "bearishCount": 0,
            "neutralCount": 0,
            "averageConfidence": 0,
            "generatedAt": get_ist_timestamp(),
        }
    
    stats = await summarize_watchlist(symbols, "1d")
    
    bullish = sum(1 for s in stats if "BUY" in s.get("signal", "").upper())
    bearish = sum(1 for s in stats if "SELL" in s.get("signal", "").upper())
    neutral = len(stats) - bullish - bearish
    
    confidences = [s.get("confidence", 0) for s in stats if isinstance(s.get("confidence"), (int, float))]
    avg_confidence = sum(confidences) / len(confidences) if confidences else 0
    
    return {
        "totalStocks": len(stats),
        "bullishCount": bullish,
        "bearishCount": bearish,
        "neutralCount": neutral,
        "averageConfidence": round(avg_confidence, 2),
        "generatedAt": get_ist_timestamp(),
    }


@app.get("/api/market/indexes")
async def api_market_indexes(timeframe: str = Query("1d")):
    """Get major index data for market overview"""
    indexes = ["NIFTY", "BANKNIFTY", "SENSEX"]
    results = await summarize_watchlist(indexes, timeframe)
    return {
        "timeframe": timeframe,
        "indexes": results,
        "generatedAt": get_ist_timestamp(),
    }


@app.get("/api/market/top-movers")
async def api_market_top_movers(timeframe: str = Query("1d"), limit: int = Query(5, ge=1, le=20)):
    """Get top performing stocks"""
    # Get a sample of popular stocks
    sample_stocks = ["RELIANCE", "TCS", "INFY", "HDFC", "ITC", "MARUTI", "WIPRO", "AXISBANK", "LT", "BAJAJFINSV"]
    
    results = await summarize_watchlist(sample_stocks[:limit + 5], timeframe)
    
    # Sort by confidence and signal strength
    sorted_results = sorted(
        results,
        key=lambda x: (
            1 if "BUY" in x.get("signal", "").upper() else 0,
            x.get("confidence", 0)
        ),
        reverse=True
    )
    
    return {
        "timeframe": timeframe,
        "topMovers": sorted_results[:limit],
        "generatedAt": get_ist_timestamp(),
    }