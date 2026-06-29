# Spitogatos Tracker

Track your Spitogatos rental search for new listings, price changes, and removed listings. No scraping -- you use a bookmarklet in your browser to export what you see, then upload it to a local dashboard.

## One-time setup

### 1. Install dependencies

```bash
python3 -m venv venv && source venv/bin/activate
pip install -r backend/requirements.txt
cd frontend && npm install
```

### 2. Build and install the bookmarklet

```bash
cd ingest && python3 build_bookmarklet.py
```

This creates `bookmarklet.url.txt` with a `javascript:...` URL inside.

### 3. Add it to your browser

1. Create a new bookmark in your browser.
2. Name it anything (e.g. "Capture Spitogatos").
3. Paste the URL from `bookmarklet.url.txt` as the bookmark address.

## Running the dashboard

### Option A: Development mode (two terminals)

Terminal 1 -- backend:

```bash
cd backend && source ../venv/bin/activate && uvicorn app:app --port 8077
```

Terminal 2 -- frontend:

```bash
cd frontend && npm run dev
```

Open http://localhost:5173.

### Option B: Single process

```bash
cd frontend && npm run build
cd ../backend && uvicorn app:app --port 8077
```

Open http://localhost:8077.

## Daily workflow

1. Go to spitogatos.gr and search for rentals in your preferred region. Use filters (price range, bedrooms, size, etc.) to narrow down results.
2. Click the bookmarklet on the results page. A JSON file downloads with all visible listings.
3. If there are multiple result pages, go to each page and click the bookmarklet again. Do this within the same sitting.
4. Open the dashboard and upload each downloaded file.

## AI photo analysis (optional)

The dashboard can analyze listing photos using AI to assess things like renovation quality, natural light, and overall condition.

### Setup

1. Open the dashboard.
2. Click **AI Settings** in the header.
3. Pick a provider: **Anthropic (Claude)**, **OpenAI (GPT)**, **Mistral (Pixtral)**, or **Ollama (local)**.
4. Enter your API key for the chosen provider (not needed for Ollama).
5. Choose a model or leave blank for the default.
6. Optionally customize the analysis prompt to match what you're searching for.

### Usage

- Click **"Analyze photos with AI"** on any listing card to analyze that listing.
- Click **"Analyze all"** in the header to run analysis on all eligible listings at once.

## How removal detection works

A listing is marked "removed" if it stops appearing in your uploads for more than 6 hours. This grace period lets you upload multiple pages from one search session without false removals. Just upload all pages within a few hours of each other.

## Data

SQLite database at `data/spitogatos.db`. Local and personal -- nothing is committed to the repo.
