"""
Jarnox Stock Intelligence Dashboard — FastAPI Backend
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import sqlite3
import pandas as pd
import numpy as np
import os
from datetime import datetime, timedelta
from typing import Optional
import logging
from data.fetch_data import fetch_and_store # Import for self-healing
try:
    from sklearn.linear_model import LinearRegression
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False

DB_PATH = os.path.join(os.path.dirname(__file__), "stocks.db")

app = FastAPI(
    title="📈 Jarnox Stock Intelligence Dashboard",
    description="""
A mini financial data platform built for the Jarnox Internship Assignment.

## Features
- Real-time NSE stock data via yfinance
- Computed metrics: Daily Return, 7-day MA, 52-week High/Low, Volatility
- Price prediction using Linear Regression
- Compare two stocks
- Top Gainers & Losers
    """,
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static frontend
STATIC_DIR = os.path.join(os.path.dirname(__file__), "frontend")
if os.path.exists(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# ─────────────────────────────────────────────
# ROOT
# ─────────────────────────────────────────────
@app.get("/", include_in_schema=False)
def serve_frontend():
    # Attempt to serve index.html from static dir
    index = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index):
        return FileResponse(index)
    return {"message": "Jarnox Stock API is running! Static frontend not found in /frontend."}

@app.get("/market-sentiment", tags=["Market"], summary="Market Sentiment Index")
def market_sentiment():
    """
    Mock sentiment index based on price action and volatility.
    """
    conn = get_conn()
    latest_date = conn.execute("SELECT MAX(date) FROM stock_prices").fetchone()[0]
    rows = conn.execute("SELECT daily_return FROM stock_prices WHERE date = ?", (latest_date,)).fetchall()
    conn.close()

    if not rows:
        return {"sentiment": "Neutral", "score": 50}

    returns = [r[0] for r in rows if r[0] is not None]
    up_count = len([r for r in returns if r > 0])
    avg_ret = sum(returns) / len(returns) if returns else 0

    score = 50 + (up_count / len(returns) * 40) + (avg_ret * 5)
    score = max(0, min(100, score))

    if score > 70: sentiment = "Bullish 🚀"
    elif score > 55: sentiment = "Slightly Bullish"
    elif score > 45: sentiment = "Neutral"
    elif score > 30: sentiment = "Slightly Bearish"
    else: sentiment = "Bearish 📉"

    return {
        "sentiment": sentiment,
        "score": round(score, 1),
        "advancing": up_count,
        "declining": len(returns) - up_count,
        "avg_market_return": round(avg_ret, 2)
    }


# ─────────────────────────────────────────────
# STOCKS LIST
# ─────────────────────────────────────────────
@app.get("/stocks", tags=["Stocks"], summary="Sabhi tracked stocks ki list")
def list_stocks():
    """
    Database mein available sabhi stocks return karta hai.
    """
    conn = get_conn()
    try:
        rows = conn.execute("SELECT symbol, company_name FROM stocks ORDER BY symbol").fetchall()
        print(f"DEBUG: Found {len(rows)} stocks in DB.")
        # SELF-HEALING: If DB is empty, fetch data automatically
        if not rows:
            print("⚠️ Database empty! Triggering auto-fetch...")
            fetch_and_store()
            rows = conn.execute("SELECT symbol, company_name FROM stocks ORDER BY symbol").fetchall()
            print(f"DEBUG: After fetch, found {len(rows)} stocks.")
    except Exception as e:
        print(f"ERROR in list_stocks: {e}")
        fetch_and_store()
        rows = conn.execute("SELECT symbol, company_name FROM stocks ORDER BY symbol").fetchall()
    
    conn.close()
    return [dict(r) for r in rows]

@app.get("/refresh-data", tags=["Market"], summary="Force refresh stock data")
def force_refresh():
    """
    Manually triggers the fetch_data script to update the database.
    """
    try:
        fetch_and_store()
        return {"status": "success", "message": "Data refreshed successfully!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────
# STOCK DETAIL
# ─────────────────────────────────────────────
@app.get("/stocks/{symbol}", tags=["Stocks"], summary="Ek stock ki latest info")
def stock_detail(symbol: str):
    """
    Ek specific stock ki latest price, metrics, aur 52-week data deta hai.
    """
    symbol = symbol.upper()
    conn = get_conn()

    company = conn.execute(
        "SELECT * FROM stocks WHERE symbol = ?", (symbol,)
    ).fetchone()
    if not company:
        raise HTTPException(status_code=404, detail=f"Stock '{symbol}' not found")

    latest = conn.execute("""
        SELECT * FROM stock_prices WHERE symbol = ? ORDER BY date DESC LIMIT 1
    """, (symbol,)).fetchone()

    one_year_ago = (datetime.now() - timedelta(days=365)).strftime("%Y-%m-%d")
    hw = conn.execute("""
        SELECT MAX(high) as high_52w, MIN(low) as low_52w
        FROM stock_prices WHERE symbol = ? AND date >= ?
    """, (symbol, one_year_ago)).fetchone()

    conn.close()

    return {
        "symbol": symbol,
        "company_name": company["company_name"],
        "latest": dict(latest) if latest else None,
        "52_week_high": hw["high_52w"],
        "52_week_low": hw["low_52w"],
    }


# ─────────────────────────────────────────────
# HISTORICAL DATA
# ─────────────────────────────────────────────
@app.get("/stocks/{symbol}/history", tags=["Stocks"], summary="Historical OHLCV data")
def stock_history(
    symbol: str,
    days: int = Query(90, description="Kitne din ka data chahiye (e.g. 30, 90, 365)"),
):
    """
    Stock ka historical OHLCV data with computed metrics return karta hai.
    """
    symbol = symbol.upper()
    since = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

    conn = get_conn()
    rows = conn.execute("""
        SELECT date, open, high, low, close, volume, daily_return, ma_7, ma_30, volatility
        FROM stock_prices
        WHERE symbol = ? AND date >= ?
        ORDER BY date ASC
    """, (symbol, since)).fetchall()
    conn.close()

    if not rows:
        raise HTTPException(status_code=404, detail=f"No history for '{symbol}'")

    return [dict(r) for r in rows]


# ─────────────────────────────────────────────
# METRICS SUMMARY
# ─────────────────────────────────────────────
@app.get("/stocks/{symbol}/metrics", tags=["Stocks"], summary="Computed metrics summary")
def stock_metrics(symbol: str):
    """
    Symbol ke liye avg return, avg volatility, best/worst day return karta hai.
    """
    symbol = symbol.upper()
    conn = get_conn()
    rows = conn.execute("""
        SELECT daily_return, volatility, date, close
        FROM stock_prices WHERE symbol = ?
        ORDER BY date
    """, (symbol,)).fetchall()
    conn.close()

    if not rows:
        raise HTTPException(status_code=404, detail=f"No data for '{symbol}'")

    df = pd.DataFrame(rows, columns=["daily_return", "volatility", "date", "close"])
    df.dropna(subset=["daily_return"], inplace=True)

    best_day = df.loc[df["daily_return"].idxmax()]
    worst_day = df.loc[df["daily_return"].idxmin()]

    return {
        "symbol": symbol,
        "avg_daily_return_pct": round(df["daily_return"].mean(), 4),
        "avg_volatility": round(df["volatility"].dropna().mean(), 4),
        "best_day": {"date": best_day["date"], "return_pct": round(best_day["daily_return"], 4)},
        "worst_day": {"date": worst_day["date"], "return_pct": round(worst_day["daily_return"], 4)},
        "total_return_pct": round(
            (df["close"].iloc[-1] - df["close"].iloc[0]) / df["close"].iloc[0] * 100, 2
        ),
    }


# ─────────────────────────────────────────────
# PREDICTION (ML)
# ─────────────────────────────────────────────
@app.get("/stocks/{symbol}/predict", tags=["ML"], summary="Linear Regression se price prediction")
def predict_price(
    symbol: str,
    days_ahead: int = Query(7, description="Aage kitne din predict karne hain"),
):
    """
    Simple Linear Regression model use karke future closing price predict karta hai.
    Ye sirf educational purpose ke liye hai — real trading ke liye use na karein.
    """
    if not SKLEARN_AVAILABLE:
        raise HTTPException(
            status_code=501, 
            detail="ML Prediction requires scikit-learn, which is not installed on this system."
        )
    symbol = symbol.upper()
    conn = get_conn()
    rows = conn.execute("""
        SELECT date, close FROM stock_prices WHERE symbol = ?
        ORDER BY date ASC
    """, (symbol,)).fetchall()
    conn.close()

    if len(rows) < 30:
        raise HTTPException(status_code=400, detail="Not enough data for prediction")

    df = pd.DataFrame(rows, columns=["date", "close"])
    df["idx"] = range(len(df))

    X = df[["idx"]].values
    y = df["close"].values

    model = LinearRegression()
    model.fit(X, y)

    last_idx = df["idx"].max()
    future_idxs = [[last_idx + i] for i in range(1, days_ahead + 1)]
    predictions = model.predict(future_idxs)

    last_date = datetime.strptime(df["date"].iloc[-1], "%Y-%m-%d")
    future_dates = [
        (last_date + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(1, days_ahead + 1)
    ]

    return {
        "symbol": symbol,
        "disclaimer": "Educational purpose only. Not financial advice.",
        "predictions": [
            {"date": d, "predicted_close": round(float(p), 2)}
            for d, p in zip(future_dates, predictions)
        ],
    }


# ─────────────────────────────────────────────
# TOP GAINERS
# ─────────────────────────────────────────────
@app.get("/top-gainers", tags=["Market"], summary="Aaj ke top gainers")
def top_gainers(limit: int = Query(5, description="Kitne stocks return karne hain")):
    """
    Latest trading day ke hisaab se sabse zyada daily_return wale stocks.
    """
    conn = get_conn()
    latest_date = conn.execute(
        "SELECT MAX(date) FROM stock_prices"
    ).fetchone()[0]

    rows = conn.execute("""
        SELECT s.symbol, s.company_name, p.close, p.daily_return, p.date
        FROM stock_prices p
        JOIN stocks s ON s.symbol = p.symbol
        WHERE p.date = ?
        ORDER BY p.daily_return DESC
        LIMIT ?
    """, (latest_date, limit)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ─────────────────────────────────────────────
# TOP LOSERS
# ─────────────────────────────────────────────
@app.get("/top-losers", tags=["Market"], summary="Aaj ke top losers")
def top_losers(limit: int = Query(5, description="Kitne stocks return karne hain")):
    """
    Latest trading day ke hisaab se sabse zyada gire hue stocks.
    """
    conn = get_conn()
    latest_date = conn.execute(
        "SELECT MAX(date) FROM stock_prices"
    ).fetchone()[0]

    rows = conn.execute("""
        SELECT s.symbol, s.company_name, p.close, p.daily_return, p.date
        FROM stock_prices p
        JOIN stocks s ON s.symbol = p.symbol
        WHERE p.date = ?
        ORDER BY p.daily_return ASC
        LIMIT ?
    """, (latest_date, limit)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ─────────────────────────────────────────────
# COMPARE TWO STOCKS
# ─────────────────────────────────────────────
@app.get("/compare", tags=["Market"], summary="Do stocks ko compare karo")
def compare_stocks(
    symbol1: str = Query(..., description="Pehla stock symbol (e.g. TCS)"),
    symbol2: str = Query(..., description="Doosra stock symbol (e.g. INFY)"),
    days: int = Query(90, description="Comparison window in days"),
):
    """
    Do stocks ka closing price history side-by-side return karta hai.
    Correlation bhi compute karta hai.
    """
    s1, s2 = symbol1.upper(), symbol2.upper()
    since = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    conn = get_conn()

    def fetch(sym):
        rows = conn.execute("""
            SELECT date, close, daily_return FROM stock_prices
            WHERE symbol = ? AND date >= ?
            ORDER BY date ASC
        """, (sym, since)).fetchall()
        return pd.DataFrame(rows, columns=["date", "close", "daily_return"])

    df1 = fetch(s1)
    df2 = fetch(s2)
    conn.close()

    if df1.empty or df2.empty:
        raise HTTPException(status_code=404, detail="One or both symbols not found")

    merged = pd.merge(
        df1.rename(columns={"close": f"{s1}_close", "daily_return": f"{s1}_return"}),
        df2.rename(columns={"close": f"{s2}_close", "daily_return": f"{s2}_return"}),
        on="date", how="inner"
    )

    correlation = merged[[f"{s1}_return", f"{s2}_return"]].corr().iloc[0, 1]

    return {
        "symbol1": s1,
        "symbol2": s2,
        "correlation": round(float(correlation), 4),
        "correlation_interpretation": (
            "Strong Positive" if correlation > 0.7 else
            "Moderate Positive" if correlation > 0.3 else
            "Weak/Negative"
        ),
        "data": merged.to_dict(orient="records"),
    }


# ─────────────────────────────────────────────
# CORRELATION MATRIX
# ─────────────────────────────────────────────
@app.get("/correlation", tags=["Market"], summary="Sabhi stocks ka correlation matrix")
def correlation_matrix():
    """
    Sabhi tracked stocks ke beech price return correlation matrix return karta hai.
    """
    conn = get_conn()
    df = pd.read_sql("SELECT symbol, date, close FROM stock_prices", conn)
    conn.close()

    pivot = df.pivot(index="date", columns="symbol", values="close")
    corr = pivot.pct_change().corr().round(3)
    return {"correlation_matrix": corr.to_dict()}
