import csv
import io
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import anthropic
import openai

from ai_analysis import analyze_listing, DEFAULT_PROMPT, DEFAULT_MODELS
from db import get_conn, get_settings, save_settings, init_db
from ingest import ingest_payload

app = FastAPI(title="Spitogatos Tracker")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()


@app.post("/api/ingest")
async def ingest(file: UploadFile = File(...)):
    raw = await file.read()
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(400, "Not valid JSON")
    if "listings" not in payload:
        raise HTTPException(400, "Missing 'listings' field — is this a bookmarklet export?")
    summary = ingest_payload(payload)
    return summary


def _serialize_listing(row) -> dict:
    d = dict(row)
    d["images"] = json.loads(d["images"]) if d.get("images") else []
    d["ai_analysis"] = json.loads(d["ai_analysis"]) if d.get("ai_analysis") else None
    return d


@app.get("/api/listings")
def list_listings(include_hidden: bool = False, include_removed: bool = True):
    query = "SELECT * FROM listings WHERE 1=1"
    if not include_hidden:
        query += " AND hidden = 0"
    if not include_removed:
        query += " AND is_removed = 0"
    query += " ORDER BY first_seen_at DESC"
    with get_conn() as conn:
        rows = conn.execute(query).fetchall()
        return [_serialize_listing(r) for r in rows]


@app.get("/api/listings/{listing_id}/history")
def listing_history(listing_id: str):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT price, observed_at FROM price_history WHERE listing_id = ? ORDER BY observed_at",
            (listing_id,),
        ).fetchall()
        return [dict(r) for r in rows]


class ListingPatch(BaseModel):
    score: Optional[int] = None
    tags: Optional[str] = None
    notes: Optional[str] = None
    hidden: Optional[bool] = None


@app.patch("/api/listings/{listing_id}")
def patch_listing(listing_id: str, patch: ListingPatch):
    fields, values = [], []
    for key, value in patch.model_dump(exclude_unset=True).items():
        fields.append(f"{key} = ?")
        values.append(int(value) if isinstance(value, bool) else value)
    if not fields:
        raise HTTPException(400, "No fields to update")
    values.append(listing_id)
    with get_conn() as conn:
        cur = conn.execute(f"UPDATE listings SET {', '.join(fields)} WHERE id = ?", values)
        if cur.rowcount == 0:
            raise HTTPException(404, "Listing not found")
    return {"ok": True}


SETTINGS_KEYS = [
    "provider", "anthropic_api_key", "openai_api_key", "mistral_api_key",
    "ollama_base_url", "model", "custom_prompt",
]


@app.get("/api/settings")
def read_settings():
    s = get_settings()
    masked = {}
    for key in SETTINGS_KEYS:
        val = s.get(key, "")
        if key.endswith("_api_key") and val:
            masked[key] = val[:8] + "…" + val[-4:] if len(val) > 12 else "••••"
        else:
            masked[key] = val
    masked.setdefault("provider", "anthropic")
    masked["default_prompt"] = DEFAULT_PROMPT
    masked["default_models"] = DEFAULT_MODELS
    return masked


@app.put("/api/settings")
def update_settings(body: dict):
    current = get_settings()
    to_save = {}
    for key in SETTINGS_KEYS:
        if key not in body:
            continue
        val = body[key]
        if key.endswith("_api_key") and ("…" in val or val == "••••"):
            continue
        to_save[key] = val
    save_settings(to_save)
    merged = {**current, **to_save}
    return {"ok": True, "provider": merged.get("provider", "anthropic")}


def _run_analysis(listing: dict) -> dict:
    """Raises HTTPException on failure; returns {"ai_analysis", "ai_analyzed_at"} on success."""
    settings = get_settings()
    provider = settings.get("provider", "anthropic")

    try:
        result = analyze_listing(listing, settings)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except (TypeError, anthropic.AuthenticationError, openai.AuthenticationError):
        raise HTTPException(500, f"API key for {provider} is not set or invalid")
    except (anthropic.APIError, openai.APIError) as e:
        msg = getattr(e, "message", str(e))
        raise HTTPException(502, f"{provider} API error: {msg}")

    analyzed_at = datetime.now(timezone.utc).isoformat()
    with get_conn() as conn:
        conn.execute(
            "UPDATE listings SET ai_analysis = ?, ai_analyzed_at = ? WHERE id = ?",
            (json.dumps(result), analyzed_at, listing["id"]),
        )
    return {"ai_analysis": result, "ai_analyzed_at": analyzed_at}


@app.post("/api/listings/{listing_id}/analyze")
def analyze(listing_id: str):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id, title, description, images FROM listings WHERE id = ?", (listing_id,)
        ).fetchone()
        if row is None:
            raise HTTPException(404, "Listing not found")
        listing = dict(row)
        listing["images"] = json.loads(listing["images"] or "[]")

    return _run_analysis(listing)


@app.post("/api/listings/analyze-all")
def analyze_all(force: bool = False):
    query = "SELECT id, title, description, images FROM listings WHERE hidden = 0 AND is_removed = 0"
    if not force:
        query += " AND ai_analysis IS NULL"
    with get_conn() as conn:
        rows = conn.execute(query).fetchall()

    results = {"analyzed": [], "skipped_no_photos": [], "failed": []}
    for row in rows:
        listing = dict(row)
        listing["images"] = json.loads(listing["images"] or "[]")
        if not listing["images"]:
            results["skipped_no_photos"].append(listing["id"])
            continue
        try:
            _run_analysis(listing)
            results["analyzed"].append(listing["id"])
        except HTTPException as e:
            # stop early on auth/config errors — they'll fail for every remaining listing too
            if e.status_code == 500:
                raise
            results["failed"].append({"id": listing["id"], "error": e.detail})

    return results


CSV_COLUMNS = [
    "title", "price", "area", "price_per_sqm", "location", "floor", "bedrooms", "bathrooms",
    "agency", "url", "score", "ai_score", "overall_condition", "natural_light",
    "bathroom_renovated", "bathroom_spacious", "kitchen_renovated", "kitchen_spacious",
    "ai_summary", "tags", "notes", "is_removed", "first_seen_at", "last_seen_at",
]


@app.get("/api/export.csv")
def export_csv(include_hidden: bool = False, include_removed: bool = True):
    query = "SELECT * FROM listings WHERE 1=1"
    if not include_hidden:
        query += " AND hidden = 0"
    if not include_removed:
        query += " AND is_removed = 0"
    query += " ORDER BY first_seen_at DESC"
    with get_conn() as conn:
        rows = [_serialize_listing(r) for r in conn.execute(query).fetchall()]

    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=CSV_COLUMNS)
    writer.writeheader()
    for l in rows:
        a = l.get("ai_analysis") or {}
        bathroom = a.get("bathroom") or {}
        kitchen = a.get("kitchen") or {}
        writer.writerow({
            "title": l.get("title"),
            "price": l.get("price"),
            "area": l.get("area"),
            "price_per_sqm": round(l["price"] / l["area"], 1) if l.get("price") and l.get("area") else None,
            "location": l.get("location"),
            "floor": l.get("floor"),
            "bedrooms": l.get("bedrooms"),
            "bathrooms": l.get("bathrooms"),
            "agency": l.get("agency"),
            "url": l.get("url"),
            "score": l.get("score"),
            "ai_score": a.get("ai_score"),
            "overall_condition": a.get("overall_condition"),
            "natural_light": a.get("natural_light"),
            "bathroom_renovated": bathroom.get("renovated") if bathroom.get("visible_in_photos") else None,
            "bathroom_spacious": bathroom.get("spacious") if bathroom.get("visible_in_photos") else None,
            "kitchen_renovated": kitchen.get("renovated") if kitchen.get("visible_in_photos") else None,
            "kitchen_spacious": kitchen.get("spacious") if kitchen.get("visible_in_photos") else None,
            "ai_summary": a.get("summary"),
            "tags": l.get("tags"),
            "notes": l.get("notes"),
            "is_removed": bool(l.get("is_removed")),
            "first_seen_at": l.get("first_seen_at"),
            "last_seen_at": l.get("last_seen_at"),
        })

    buffer.seek(0)
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H%M")
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="spitogatos_export_{ts}.csv"'},
    )


@app.get("/api/imports")
def list_imports():
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM imports ORDER BY imported_at DESC").fetchall()
        return [dict(r) for r in rows]


frontend_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
