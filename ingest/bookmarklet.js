// Spitogatos listing extractor — run this from a bookmark while logged in
// and viewing your saved search results page. It reads only what's already
// loaded in your own browser session and downloads it as a JSON file.
//
// Primary data source is the page's own Nuxt hydration payload
// (window.__NUXT__.state.searchResults.properties), which holds the full
// listing record (description, every photo ID, exact room counts) — not
// just whatever the photo carousel currently happens to have rendered into
// the DOM. DOM scraping is kept only as a per-field fallback.
//
// To install: minify this (see build_bookmarklet.py) and save the resulting
// `javascript:...` string as the URL of a browser bookmark.

(function () {
  function findNuxtProperties() {
    const direct = window.__NUXT__ && window.__NUXT__.state && window.__NUXT__.state.searchResults
      ? window.__NUXT__.state.searchResults.properties
      : null;
    if (Array.isArray(direct) && direct.length) return direct;

    // Fallback: walk the Nuxt payload looking for an array of listing-shaped objects,
    // in case the page structure differs (e.g. a different view than map-search).
    const seen = new Set();
    let found = null;
    function walk(obj, depth) {
      if (found || !obj || typeof obj !== "object" || depth > 8 || seen.has(obj)) return;
      seen.add(obj);
      if (Array.isArray(obj) && obj.length && obj[0] && typeof obj[0] === "object" && "imageIds" in obj[0] && "id" in obj[0]) {
        found = obj;
        return;
      }
      for (const k in obj) {
        try { walk(obj[k], depth + 1); } catch (e) {}
      }
    }
    walk(window.__NUXT__, 0);
    return found || [];
  }

  const nuxtProperties = findNuxtProperties();
  const byRawId = new Map();
  nuxtProperties.forEach((p) => {
    if (p && p.id != null) byRawId.set(String(p.id), p);
  });

  function matchNuxtProperty(hrefId) {
    if (!hrefId) return null;
    for (const [rawId, p] of byRawId) {
      if (hrefId.endsWith(rawId)) return p;
    }
    return null;
  }

  function imagesFromNuxt(p) {
    if (p && Array.isArray(p.imageIds) && p.imageIds.length && p.mainImageURL) {
      try {
        const host = new URL(p.mainImageURL).host;
        return p.imageIds.map((imgId) => `https://${host}/${imgId}_300x220.jpg?v=20130730`);
      } catch (e) {}
    }
    return null;
  }

  const cards = document.querySelectorAll(".tile__content");
  if (!cards.length) {
    alert("No listing cards found on this page (selector .tile__content matched nothing).");
    return;
  }

  const results = [];

  cards.forEach((content) => {
    const card = content.parentElement;
    if (!card) return;

    const linkEl = card.querySelector('a.tile__link[href^="/aggelia/"]');
    const href = linkEl ? linkEl.getAttribute("href") : null;
    const id = href ? href.split("/").filter(Boolean).pop() : null;
    if (!id) return;

    const nuxtProp = matchNuxtProperty(id);

    const title = content.querySelector(".tile__title")?.textContent.trim() || null;
    const domLocation = content.querySelector(".tile__location")?.textContent.trim() || null;
    const domDescription = content.querySelector(".tile__description")?.textContent.trim() || null;

    const priceText = content.querySelector(".price__text")?.textContent.trim() || null;
    const domPrice = priceText ? parseInt(priceText.replace(/[^\d]/g, ""), 10) : null;

    const updated = content.querySelector(".tile__updated time")?.getAttribute("datetime") || null;

    const info = {};
    content.querySelectorAll(".tile__info li").forEach((li) => {
      const label = li.getAttribute("title");
      const value = li.querySelector("span > span")?.textContent.trim();
      if (label) info[label] = value || null;
    });

    const areaMatch = title ? title.match(/(\d+(?:[.,]\d+)?)\s*τ\.?\s*μ/i) : null;
    const domArea = areaMatch ? parseFloat(areaMatch[1].replace(",", ".")) : null;

    const domImages = [];
    card.querySelectorAll("img").forEach((img) => {
      const src = img.getAttribute("data-src") || img.getAttribute("src");
      if (src && !src.startsWith("data:") && !domImages.includes(src)) domImages.push(src);
    });

    const domAgency = card.querySelector(".tile__logo")?.getAttribute("title") || null;

    const images = imagesFromNuxt(nuxtProp) || domImages;

    results.push({
      id,
      url: "https://www.spitogatos.gr" + href,
      title,
      location: (nuxtProp && nuxtProp.geography) || domLocation,
      description: (nuxtProp && nuxtProp.description) || domDescription,
      price: nuxtProp && nuxtProp.price != null ? nuxtProp.price : domPrice,
      area: nuxtProp && nuxtProp.sq_meters != null ? nuxtProp.sq_meters : domArea,
      // floor stays DOM-only: the Nuxt payload's floorNumber didn't match the
      // displayed floor in testing, so it's not trustworthy for this field.
      floor: info["Όροφος"] ?? null,
      bedrooms: nuxtProp && nuxtProp.rooms != null ? String(nuxtProp.rooms) : (info["Υπνοδωμάτια"] ?? null),
      bathrooms: nuxtProp && nuxtProp.no_of_bathrooms != null ? String(nuxtProp.no_of_bathrooms) : (info["Μπάνια"] ?? null),
      updated_on_site: updated,
      image: images[0] || null,
      images,
      agency: (nuxtProp && nuxtProp.reAgent && nuxtProp.reAgent.agencyName) || domAgency,
      scraped_at: new Date().toISOString(),
    });
  });

  const payload = {
    scraped_at: new Date().toISOString(),
    source_url: location.href,
    count: results.length,
    listings: results,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  const ts = payload.scraped_at.replace(/[:.]/g, "-");
  a.href = URL.createObjectURL(blob);
  a.download = `spitogatos_${ts}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  const matchedCount = results.filter((r) => matchNuxtProperty(r.id) != null).length;
  alert(
    `Captured ${results.length} listing(s), ${matchedCount} with full data (description/photos/room counts). ` +
    `Check your downloads folder, then drop the file into the dashboard.`,
  );
})();
