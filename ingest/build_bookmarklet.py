"""Generate the javascript: bookmarklet URL from bookmarklet.js.

Run: python3 build_bookmarklet.py
Then copy the printed URL into a new browser bookmark.
"""
import pathlib
import re
import urllib.parse

src = pathlib.Path(__file__).parent / "bookmarklet.js"
code = src.read_text(encoding="utf-8")

# strip // comments (but not inside strings — this file has none in code lines) and blank lines
lines = []
for line in code.splitlines():
    stripped = line.strip()
    if stripped.startswith("//"):
        continue
    lines.append(line)
minified = " ".join(re.sub(r"\s+", " ", l).strip() for l in lines if l.strip())

bookmarklet = "javascript:" + urllib.parse.quote(minified)

out = pathlib.Path(__file__).parent / "bookmarklet.url.txt"
out.write_text(bookmarklet, encoding="utf-8")
print(f"Wrote {out}")
print()
print("Bookmarklet URL (paste as the URL of a new bookmark):")
print(bookmarklet)
