import { useEffect, useState } from 'react'
import { api } from './api'
import type { Provider, Settings } from './types'

const PROVIDERS: { value: Provider; label: string }[] = [
  { value: 'anthropic', label: 'Anthropic (Claude)' },
  { value: 'openai', label: 'OpenAI (GPT)' },
  { value: 'mistral', label: 'Mistral (Pixtral)' },
  { value: 'ollama', label: 'Ollama (local)' },
]

const API_KEY_FIELDS: Record<string, Provider> = {
  anthropic_api_key: 'anthropic',
  openai_api_key: 'openai',
  mistral_api_key: 'mistral',
}

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [draft, setDraft] = useState<Partial<Settings>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    api.getSettings().then((s) => {
      setSettings(s)
      setDraft(s)
    })
  }, [])

  if (!settings) return null

  const provider = (draft.provider ?? settings.provider) as Provider

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
    setSuccess(false)
  }

  function handleProviderChange(p: Provider) {
    const defaultModel = settings!.default_models[p] ?? ''
    setDraft((d) => ({ ...d, provider: p, model: defaultModel }))
    setSuccess(false)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      await api.saveSettings(draft)
      setSuccess(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  function handleResetPrompt() {
    update('custom_prompt', '')
    setSuccess(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">AI Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
            &times;
          </button>
        </div>

        <div className="p-4 flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Provider</label>
            <select
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value as Provider)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {provider !== 'ollama' && (
            <div>
              <label className="block text-sm font-medium mb-1">
                {PROVIDERS.find((p) => p.value === provider)?.label} API Key
              </label>
              <input
                type="password"
                value={draft[`${provider}_api_key` as keyof Settings] as string ?? ''}
                onChange={(e) => update(`${provider}_api_key` as keyof Settings, e.target.value)}
                placeholder="sk-..."
                className="w-full border rounded px-3 py-2 text-sm font-mono"
              />
            </div>
          )}

          {provider === 'ollama' && (
            <div>
              <label className="block text-sm font-medium mb-1">Ollama Base URL</label>
              <input
                value={(draft.ollama_base_url as string) ?? 'http://localhost:11434/v1'}
                onChange={(e) => update('ollama_base_url', e.target.value)}
                placeholder="http://localhost:11434/v1"
                className="w-full border rounded px-3 py-2 text-sm font-mono"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Model</label>
            <input
              value={(draft.model as string) ?? ''}
              onChange={(e) => update('model', e.target.value)}
              placeholder={settings.default_models[provider]}
              className="w-full border rounded px-3 py-2 text-sm font-mono"
            />
            <p className="text-xs text-gray-400 mt-1">
              Leave empty for default: {settings.default_models[provider]}
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium">Analysis Prompt</label>
              <button
                onClick={handleResetPrompt}
                className="text-xs text-blue-500 hover:underline"
              >
                reset to default
              </button>
            </div>
            <textarea
              value={(draft.custom_prompt as string) || settings.default_prompt}
              onChange={(e) => update('custom_prompt', e.target.value)}
              rows={8}
              className="w-full border rounded px-3 py-2 text-sm font-mono"
            />
            <p className="text-xs text-gray-400 mt-1">
              Use {'{title}'} and {'{description}'} as placeholders for listing data.
            </p>
          </div>

          {Object.entries(API_KEY_FIELDS)
            .filter(([, p]) => p !== provider)
            .map(([key, p]) => (
              <div key={key}>
                <label className="block text-sm font-medium mb-1 text-gray-400">
                  {PROVIDERS.find((pr) => pr.value === p)?.label} API Key
                </label>
                <input
                  type="password"
                  value={draft[key as keyof Settings] as string ?? ''}
                  onChange={(e) => update(key as keyof Settings, e.target.value)}
                  placeholder="(not active — set key to switch later)"
                  className="w-full border rounded px-3 py-2 text-sm font-mono text-gray-400"
                />
              </div>
            ))}
        </div>

        <div className="flex items-center gap-3 p-4 border-t">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded hover:bg-blue-700 disabled:bg-blue-300"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">
            Cancel
          </button>
          {success && <span className="text-sm text-emerald-600">Saved!</span>}
          {error && <span className="text-sm text-red-500">{error}</span>}
        </div>
      </div>
    </div>
  )
}
