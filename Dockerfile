FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Fetch stock data on first run (baked in)
# Run the data fetch script at start, then start the server
# This ensures the database is populated even if the build-time fetch failed.
CMD ["sh", "-c", "python data/fetch_data.py && uvicorn main:app --host 0.0.0.0 --port ${PORT:-10000}"]
