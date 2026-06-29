import sqlite3
from contextlib import contextmanager
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "spitogatos.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS listings (
    id              TEXT PRIMARY KEY,
    url             TEXT NOT NULL,
    title           TEXT,
    location        TEXT,
    description     TEXT,
    price           INTEGER,
    area            REAL,
    floor           TEXT,
    bedrooms        TEXT,
    bathrooms       TEXT,
    updated_on_site TEXT,
    image           TEXT,
    images          TEXT,
    agency          TEXT,
    first_seen_at   TEXT NOT NULL,
    last_seen_at    TEXT NOT NULL,
    is_removed      INTEGER NOT NULL DEFAULT 0,
    removed_at      TEXT,
    score           INTEGER,
    tags            TEXT,
    notes           TEXT,
    hidden          INTEGER NOT NULL DEFAULT 0,
    ai_analysis     TEXT,
    ai_analyzed_at  TEXT
);

CREATE TABLE IF NOT EXISTS price_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id  TEXT NOT NULL REFERENCES listings(id),
    price       INTEGER,
    observed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS imports (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    source_url  TEXT,
    scraped_at  TEXT NOT NULL,
    count       INTEGER NOT NULL,
    imported_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


def get_settings() -> dict:
    with get_conn() as conn:
        rows = conn.execute("SELECT key, value FROM settings").fetchall()
        return {r["key"]: r["value"] for r in rows}


def save_settings(data: dict):
    with get_conn() as conn:
        for key, value in data.items():
            conn.execute(
                "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?",
                (key, value, value),
            )


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with get_conn() as conn:
        conn.executescript(SCHEMA)
