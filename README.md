# 📈 Jarnox Stock Intelligence Dashboard

A professional, full-stack **financial data platform** built with **FastAPI + SQLite + Chart.js** for the Jarnox Internship Assignment. This project demonstrates data engineering, RESTful API design, and interactive data visualization.

---

 Advanced Technical Showcase (Part 4)

To go beyond the basics, I have implemented advanced features in this project.

 AI/ML Forecasting**: Integrated a **Linear Regression** model via `scikit-learn` to predict future price trends based on historical OHLCV data.
 Async API Handling**: Built using **FastAPI** to handle concurrent requests asynchronously, ensuring a non-blocking and super-fast user experience.
 Dockerization**: Fully containerized with `Dockerfile` and `docker-compose.yml` for seamless multi-platform deployment.
Deployment Ready**: Optimized for hosting on **Render**, **Oracle Cloud**, or **GitHub Pages** (static frontend).

---

 Core Features

| Feature | Detail |
|---|---|
| 📥 Data Pipeline | Robust ETL using `yfinance` to fetch 1-year historical data for 10 major NSE stocks. |
| 🧮 Financial Metrics | Computed **Daily Returns**, **7/30-Day Moving Averages**, and **52-Week High/Low**. |
| 🧪 Custom Analysis | **Volatility Scores** (Rolling STD) and a live **Market Sentiment Index**. |
| ⚖️ Comparison Tool | Side-by-side stock comparison with **Pearson Correlation Coefficient** calculation. |
| 🔥 Market Insights | Real-time **Top Gainers/Losers** and a cross-sector **Correlation Heatmap**. |

---

## 🏗️ Project Structure

```
Jarnox/
├── main.py              # FastAPI app — Async REST endpoints & ML Logic
├── requirements.txt     # Project dependencies
├── stock_data.db        # SQLite database (auto-generated)
├── Dockerfile           # Backend containerization
├── docker-compose.yml   # Multi-stage orchestration
├── data/
│   └── fetch_data.py    # ETL Pipeline: Fetch -> Clean -> Transform -> Store
└── frontend/
    ├── index.html       # Responsive Dashboard UI
    ├── style.css        # Premium Dark-themed styling
    └── app.js           # Chart.js integration & API Interactivity
```

---

## ⚙️ Setup & Installation

### 1. Local Setup
```bash
# Clone and enter directory
cd Jarnox

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run initial Data Pipeline
python data/fetch_data.py

# Start the Backend Server
uvicorn main:app --reload
```
- **Dashboard:** http://localhost:8000
- **API Docs:** http://localhost:8000/docs

### 2. Docker Setup
```bash
docker-compose up --build
```

---

## 🔌 API Documentation (Logic Layer)

The backend exposes a clean RESTful interface for all data operations:

- `GET /stocks`: Returns a list of all tracked companies.
- `GET /stocks/{symbol}/history`: Returns historical time-series data with pre-computed moving averages.
- `GET /stocks/{symbol}/predict`: Utilizes a Linear Regression model trained on historical closes to forecast the next 14 days.
- `GET /correlation`: Computes a real-time correlation matrix between all stocks in the database.
- `GET /market-sentiment`: A custom algorithm that gauges market mood based on the latest daily returns.

---

## 📊 Market Insights & Logic

- **Volatility Risk**: Calculated as the 7-day rolling standard deviation. This helps identify "high-risk" versus "stable" stocks.
- **Sector Correlation**: The heatmap allows users to see if Reliance (Energy) moves in sync with TCS (IT), providing diversification insights.
- **Moving Averages (MA7/MA30)**: Used as a technical indicator to identify "Golden Cross" or "Death Cross" scenarios in the dashboard.

---

## 📐 Design Philosophy

- **Zero Config**: Used **SQLite** to ensure the project works out of the box without complex database migrations.
- **Asynchronous**: Leveraged FastAPI's `async/await` to provide a snappy UI even when calculating heavy correlations.
- **Client-Side Rendering**: Vanilla JavaScript keeps the frontend lightweight and compatible with any static hosting provider.

---

