import { useState } from 'react'
import { api } from './api'
import type { Listing, PricePoint, RoomAssessment } from './types'

function RoomBadges({ label, room }: { label: string; room: RoomAssessment }) {
  if (!room.visible_in_photos) {
    return (
      <span className="text-xs text-gray-400">
        {label}: not visible in photos
      </span>
    )
  }
  return (
    <span className="text-xs">
      {label}:{' '}
      <span className={room.renovated ? 'text-emerald-600' : 'text-gray-500'}>
        {room.renovated ? 'renovated' : 'not renovated'}
      </span>
      {', '}
      <span className={room.spacious ? 'text-emerald-600' : 'text-gray-500'}>
        {room.spacious ? 'spacious' : 'compact'}
      </span>
    </span>
  )
}

function Stars({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          onClick={() => onChange(n === value ? 0 : n)}
          className={`text-lg leading-none ${n <= value ? 'text-amber-400' : 'text-gray-300'}`}
          aria-label={`Score ${n}`}
        >
          ★
        </button>
      ))}
    </div>
  )
}

export default function ListingCard({
  listing,
  badge,
  onChange,
}: {
  listing: Listing
  badge: 'new' | 'active' | 'removed'
  onChange: (l: Listing) => void
}) {
  const [tagsDraft, setTagsDraft] = useState(listing.tags ?? '')
  const [notesDraft, setNotesDraft] = useState(listing.notes ?? '')
  const [history, setHistory] = useState<PricePoint[] | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)

  const pricePerSqm = listing.price && listing.area ? Math.round(listing.price / listing.area) : null

  async function patch(fields: Partial<Pick<Listing, 'score' | 'tags' | 'notes' | 'hidden'>>) {
    await api.patch(listing.id, fields)
    onChange({ ...listing, ...fields })
  }

  async function toggleHistory() {
    if (history) {
      setHistory(null)
      return
    }
    setHistory(await api.history(listing.id))
  }

  async function runAnalysis() {
    setAnalyzing(true)
    setAnalyzeError(null)
    try {
      const { ai_analysis, ai_analyzed_at } = await api.analyze(listing.id)
      onChange({ ...listing, ai_analysis, ai_analyzed_at })
    } catch (e) {
      setAnalyzeError((e as Error).message)
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div
      className={`rounded-xl border bg-white shadow-sm overflow-hidden flex flex-col ${
        badge === 'removed' ? 'opacity-60' : ''
      }`}
    >
      <div className="relative h-40 bg-gray-100">
        {listing.image && (
          <img src={listing.image} alt={listing.title ?? ''} className="w-full h-full object-cover" />
        )}
        {badge === 'new' && (
          <span className="absolute top-2 left-2 bg-emerald-500 text-white text-xs font-semibold px-2 py-0.5 rounded">
            NEW
          </span>
        )}
        {badge === 'removed' && (
          <span className="absolute top-2 left-2 bg-gray-700 text-white text-xs font-semibold px-2 py-0.5 rounded">
            REMOVED
          </span>
        )}
        {listing.ai_analysis && (
          <span
            className={`absolute top-2 right-2 text-white text-xs font-semibold px-2 py-0.5 rounded ${
              listing.ai_analysis.ai_score >= 7
                ? 'bg-emerald-600'
                : listing.ai_analysis.ai_score >= 4
                  ? 'bg-amber-500'
                  : 'bg-red-500'
            }`}
          >
            AI {listing.ai_analysis.ai_score}/10
          </span>
        )}
      </div>

      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="flex items-start justify-between gap-2">
          <a
            href={listing.url}
            target="_blank"
            rel="noreferrer"
            className={`font-medium text-sm leading-snug hover:underline ${badge === 'removed' ? 'line-through' : ''}`}
          >
            {listing.title}
          </a>
          <Stars value={listing.score ?? 0} onChange={(v) => patch({ score: v })} />
        </div>

        <p className="text-xs text-gray-500">{listing.location}</p>

        <div className="flex items-baseline gap-2">
          <span className="text-lg font-semibold">{listing.price ? `€${listing.price}` : '—'}</span>
          {pricePerSqm && <span className="text-xs text-gray-400">€{pricePerSqm}/m²</span>}
          <button onClick={toggleHistory} className="text-xs text-blue-500 hover:underline ml-auto">
            history
          </button>
        </div>

        {history && (
          <div className="text-xs text-gray-500 bg-gray-50 rounded p-2">
            {history.map((p, i) => (
              <div key={i}>
                {new Date(p.observed_at).toLocaleString()}: €{p.price}
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3 text-xs text-gray-600">
          {listing.area && <span>{listing.area} m²</span>}
          {listing.floor && <span>floor {listing.floor}</span>}
          {listing.bedrooms && <span>{listing.bedrooms} bed</span>}
          {listing.bathrooms && <span>{listing.bathrooms} bath</span>}
        </div>

        {listing.agency && <p className="text-xs text-gray-400">{listing.agency}</p>}

        <div className="border-t pt-2 flex flex-col gap-1">
          {listing.ai_analysis ? (
            <>
              <div className="flex flex-col gap-0.5">
                <RoomBadges label="Bathroom" room={listing.ai_analysis.bathroom} />
                <RoomBadges label="Kitchen" room={listing.ai_analysis.kitchen} />
              </div>
              <p className="text-xs text-gray-600">
                {listing.ai_analysis.overall_condition.replace('_', ' ')} · {listing.ai_analysis.natural_light} light
              </p>
              <p className="text-xs text-gray-500 italic">{listing.ai_analysis.summary}</p>
              <button
                onClick={runAnalysis}
                disabled={analyzing}
                className="text-xs text-blue-500 hover:underline self-start disabled:text-gray-400"
              >
                {analyzing ? 'Re-analyzing…' : 're-analyze photos'}
              </button>
            </>
          ) : (
            <button
              onClick={runAnalysis}
              disabled={analyzing || listing.images.length === 0}
              className="text-xs text-blue-500 hover:underline self-start disabled:text-gray-400"
            >
              {analyzing
                ? 'Analyzing photos…'
                : listing.images.length === 0
                  ? 'No photos captured'
                  : 'Analyze photos with AI'}
            </button>
          )}
          {analyzeError && <p className="text-xs text-red-500">{analyzeError}</p>}
        </div>

        <input
          value={tagsDraft}
          onChange={(e) => setTagsDraft(e.target.value)}
          onBlur={() => tagsDraft !== (listing.tags ?? '') && patch({ tags: tagsDraft })}
          placeholder="tags, comma, separated"
          className="text-xs border rounded px-2 py-1"
        />

        <textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          onBlur={() => notesDraft !== (listing.notes ?? '') && patch({ notes: notesDraft })}
          placeholder="notes"
          rows={2}
          className="text-xs border rounded px-2 py-1 resize-none"
        />

        <button
          onClick={() => patch({ hidden: listing.hidden ? 0 : 1 })}
          className="text-xs text-gray-500 hover:text-red-500 mt-auto self-start"
        >
          {listing.hidden ? 'unhide' : 'hide'}
        </button>
      </div>
    </div>
  )
}
