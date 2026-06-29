"""Turn a bookmarklet JSON export into database rows.

A single "scrape session" may span several JSON files (one per results page).
Listings not seen again within REMOVED_GRACE_HOURS of the latest scrape are
considered removed/rented — that window exists so uploading page 2 an hour
after page 1 doesn't falsely mark page 2's listings as removed.
"""
import json
from datetime import datetime, timedelta, timezone

from db import get_conn

REMOVED_GRACE_HOURS = 6


def _parse_iso(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def ingest_payload(payload: dict) -> dict:
    scraped_at = payload.get("scraped_at") or datetime.now(timezone.utc).isoformat()
    listings = payload.get("listings", [])

    summary = {"new": [], "updated": [], "price_changed": [], "removed": []}

    with get_conn() as conn:
        for item in listings:
            listing_id = item.get("id")
            if not listing_id:
                continue

            existing = conn.execute(
                "SELECT price FROM listings WHERE id = ?", (listing_id,)
            ).fetchone()

            images_json = json.dumps(item.get("images") or [])

            if existing is None:
                conn.execute(
                    """
                    INSERT INTO listings (
                        id, url, title, location, description, price, area,
                        floor, bedrooms, bathrooms, updated_on_site, image, images,
                        agency, first_seen_at, last_seen_at, is_removed, removed_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)
                    """,
                    (
                        listing_id, item.get("url"), item.get("title"),
                        item.get("location"), item.get("description"),
                        item.get("price"), item.get("area"), item.get("floor"),
                        item.get("bedrooms"), item.get("bathrooms"),
                        item.get("updated_on_site"), item.get("image"), images_json,
                        item.get("agency"), scraped_at, scraped_at,
                    ),
                )
                conn.execute(
                    "INSERT INTO price_history (listing_id, price, observed_at) VALUES (?, ?, ?)",
                    (listing_id, item.get("price"), scraped_at),
                )
                summary["new"].append(listing_id)
            else:
                old_price = existing["price"]
                new_price = item.get("price")
                conn.execute(
                    """
                    UPDATE listings SET
                        url = ?, title = ?, location = ?, description = ?,
                        price = ?, area = ?, floor = ?, bedrooms = ?, bathrooms = ?,
                        updated_on_site = ?, image = ?, images = ?, agency = ?,
                        last_seen_at = ?, is_removed = 0, removed_at = NULL
                    WHERE id = ?
                    """,
                    (
                        item.get("url"), item.get("title"), item.get("location"),
                        item.get("description"), new_price, item.get("area"),
                        item.get("floor"), item.get("bedrooms"), item.get("bathrooms"),
                        item.get("updated_on_site"), item.get("image"), images_json,
                        item.get("agency"), scraped_at, listing_id,
                    ),
                )
                if old_price != new_price:
                    conn.execute(
                        "INSERT INTO price_history (listing_id, price, observed_at) VALUES (?, ?, ?)",
                        (listing_id, new_price, scraped_at),
                    )
                    summary["price_changed"].append(
                        {"id": listing_id, "old_price": old_price, "new_price": new_price}
                    )
                else:
                    summary["updated"].append(listing_id)

        conn.execute(
            "INSERT INTO imports (source_url, scraped_at, count, imported_at) VALUES (?, ?, ?, ?)",
            (payload.get("source_url"), scraped_at, len(listings), datetime.now(timezone.utc).isoformat()),
        )

        cutoff = _parse_iso(scraped_at) - timedelta(hours=REMOVED_GRACE_HOURS)
        stale = conn.execute(
            "SELECT id FROM listings WHERE is_removed = 0 AND last_seen_at < ?",
            (cutoff.isoformat(),),
        ).fetchall()
        if stale:
            ids = [row["id"] for row in stale]
            conn.executemany(
                "UPDATE listings SET is_removed = 1, removed_at = ? WHERE id = ?",
                [(scraped_at, i) for i in ids],
            )
            summary["removed"] = ids

    return summary
