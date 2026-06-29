import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api'
import ListingCard from './ListingCard'
import SettingsModal from './SettingsModal'
import type { ImportRecord, Listing, SortKey } from './types'

function App() {
  const [listings, setListings] = useState<Listing[]>([])
  const [imports, setImports] = useState<ImportRecord[]>([])
  const [includeHidden, setIncludeHidden] = useState(false)
  const [hideRemoved, setHideRemoved] = useState(false)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('newest')
  const [status, setStatus] = useState<string | null>(null)
  const [analyzingAll, setAnalyzingAll] = useState(false)
  const [forceReanalyze, setForceReanalyze] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  async function refresh() {
    const [l, i] = await Promise.all([api.listings(includeHidden), api.imports()])
    setListings(l)
    setImports(i)
  }

  useEffect(() => {
    refresh()
  }, [includeHidden])

  const latestScrapedAt = imports[0]?.scraped_at

  async function handleFile(file: File) {
    setStatus('Importing…')
    try {
      const summary = await api.ingest(file)
      setStatus(
        `Imported: ${summary.new.length} new, ${summary.price_changed.length} price changes, ${summary.removed.length} removed`,
      )
      await refresh()
    } catch (e) {
      setStatus(`Import failed: ${(e as Error).message}`)
    }
  }

  const eligibleCount = useMemo(
    () =>
      listings.filter(
        (l) => (forceReanalyze || !l.ai_analysis) && !l.hidden && !l.is_removed && l.images.length > 0,
      ).length,
    [listings, forceReanalyze],
  )

  async function handleAnalyzeAll() {
    setAnalyzingAll(true)
    setStatus(`Analyzing ${eligibleCount} listing(s)…`)
    try {
      const result = await api.analyzeAll(forceReanalyze)
      setStatus(
        `Analyzed ${result.analyzed.length}, skipped ${result.skipped_no_photos.length} (no photos), ${result.failed.length} failed`,
      )
      await refresh()
    } catch (e) {
      setStatus(`Analyze all failed: ${(e as Error).message}`)
    } finally {
      setAnalyzingAll(false)
    }
  }

  const visible = useMemo(() => {
    let rows = listings
    if (hideRemoved) rows = rows.filter((l) => !l.is_removed)
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(
        (l) => l.title?.toLowerCase().includes(q) || l.location?.toLowerCase().includes(q),
      )
    }
    const withPpsm = (l: Listing) => (l.price && l.area ? l.price / l.area : Infinity)
    const sorted = [...rows]
    switch (sortKey) {
      case 'price_asc':
        sorted.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))
        break
      case 'price_desc':
        sorted.sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity))
        break
      case 'price_per_sqm':
        sorted.sort((a, b) => withPpsm(a) - withPpsm(b))
        break
      case 'score':
        sorted.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        break
      case 'ai_score':
        sorted.sort((a, b) => (b.ai_analysis?.ai_score ?? -1) - (a.ai_analysis?.ai_score ?? -1))
        break
      case 'newest':
      default:
        sorted.sort((a, b) => b.first_seen_at.localeCompare(a.first_seen_at))
    }
    return sorted
  }, [listings, hideRemoved, search, sortKey])

  function badgeFor(l: Listing): 'new' | 'active' | 'removed' {
    if (l.is_removed) return 'removed'
    if (latestScrapedAt && l.first_seen_at === latestScrapedAt) return 'new'
    return 'active'
  }

  function updateListing(updated: Listing) {
    setListings((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold">Spitogatos Tracker</h1>

          <input
            type="file"
            accept="application/json"
            ref={fileInput}
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <button
            onClick={() => fileInput.current?.click()}
            className="bg-blue-600 text-white text-sm px-3 py-1.5 rounded hover:bg-blue-700"
          >
            Upload export
          </button>

          {eligibleCount > 0 && (
            <button
              onClick={handleAnalyzeAll}
              disabled={analyzingAll}
              className="bg-emerald-600 text-white text-sm px-3 py-1.5 rounded hover:bg-emerald-700 disabled:bg-emerald-300"
            >
              {analyzingAll ? 'Analyzing…' : `Analyze all (${eligibleCount})`}
            </button>
          )}
          <label className="flex items-center gap-1 text-xs text-gray-500">
            <input
              type="checkbox"
              checked={forceReanalyze}
              onChange={(e) => setForceReanalyze(e.target.checked)}
            />
            re-analyze already-done
          </label>

          <a
            href={`/api/export.csv?include_hidden=${includeHidden}`}
            className="text-sm text-blue-600 hover:underline"
          >
            Export CSV
          </a>

          <button
            onClick={() => setShowSettings(true)}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            AI Settings
          </button>

          {status && <span className="text-xs text-gray-500">{status}</span>}

          <div className="ml-auto flex items-center gap-3 text-sm">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search title/location"
              className="border rounded px-2 py-1 text-sm"
            />
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="border rounded px-2 py-1 text-sm"
            >
              <option value="newest">Newest first</option>
              <option value="price_asc">Price ↑</option>
              <option value="price_desc">Price ↓</option>
              <option value="price_per_sqm">€/m²</option>
              <option value="score">My score</option>
              <option value="ai_score">AI score</option>
            </select>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={hideRemoved} onChange={(e) => setHideRemoved(e.target.checked)} />
              hide removed
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={includeHidden}
                onChange={(e) => setIncludeHidden(e.target.checked)}
              />
              show hidden
            </label>
          </div>
        </div>
      </header>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      <main className="max-w-7xl mx-auto px-4 py-6">
        {visible.length === 0 ? (
          <p className="text-gray-500 text-sm">
            No listings yet. Run the bookmarklet on your search results page, then upload the downloaded
            JSON file here.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {visible.map((l) => (
              <ListingCard key={l.id} listing={l} badge={badgeFor(l)} onChange={updateListing} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

export default App
