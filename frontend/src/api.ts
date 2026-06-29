import type { AiAnalysis, ImportRecord, Listing, PricePoint, Settings } from './types'

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<T>
}

export const api = {
  listings: (includeHidden: boolean) =>
    fetch(`/api/listings?include_hidden=${includeHidden}`).then((r) => json<Listing[]>(r)),

  history: (id: string) => fetch(`/api/listings/${id}/history`).then((r) => json<PricePoint[]>(r)),

  imports: () => fetch('/api/imports').then((r) => json<ImportRecord[]>(r)),

  patch: (id: string, patch: Partial<Pick<Listing, 'score' | 'tags' | 'notes' | 'hidden'>>) =>
    fetch(`/api/listings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).then((r) => json<{ ok: true }>(r)),

  ingest: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return fetch('/api/ingest', { method: 'POST', body: form }).then((r) =>
      json<{ new: string[]; updated: string[]; price_changed: { id: string; old_price: number; new_price: number }[]; removed: string[] }>(r),
    )
  },

  analyze: (id: string) =>
    fetch(`/api/listings/${id}/analyze`, { method: 'POST' }).then((r) =>
      json<{ ai_analysis: AiAnalysis; ai_analyzed_at: string }>(r),
    ),

  analyzeAll: (force: boolean) =>
    fetch(`/api/listings/analyze-all?force=${force}`, { method: 'POST' }).then((r) =>
      json<{ analyzed: string[]; skipped_no_photos: string[]; failed: { id: string; error: string }[] }>(r),
    ),

  getSettings: () => fetch('/api/settings').then((r) => json<Settings>(r)),

  saveSettings: (settings: Partial<Settings>) =>
    fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }).then((r) => json<{ ok: true; provider: string }>(r)),
}
