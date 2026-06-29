export interface RoomAssessment {
  visible_in_photos: boolean
  renovated: boolean
  spacious: boolean
  notes: string
}

export interface AiAnalysis {
  bathroom: RoomAssessment
  kitchen: RoomAssessment
  overall_condition: 'newly_renovated' | 'good' | 'dated' | 'needs_renovation' | 'unclear'
  natural_light: 'bright' | 'moderate' | 'dim' | 'unclear'
  ai_score: number
  summary: string
}

export interface Listing {
  id: string
  url: string
  title: string | null
  location: string | null
  description: string | null
  price: number | null
  area: number | null
  floor: string | null
  bedrooms: string | null
  bathrooms: string | null
  updated_on_site: string | null
  image: string | null
  images: string[]
  agency: string | null
  first_seen_at: string
  last_seen_at: string
  is_removed: number
  removed_at: string | null
  score: number | null
  tags: string | null
  notes: string | null
  hidden: number
  ai_analysis: AiAnalysis | null
  ai_analyzed_at: string | null
}

export interface PricePoint {
  price: number | null
  observed_at: string
}

export interface ImportRecord {
  id: number
  source_url: string | null
  scraped_at: string
  count: number
  imported_at: string
}

export type SortKey = 'newest' | 'price_asc' | 'price_desc' | 'price_per_sqm' | 'score' | 'ai_score'

export type Provider = 'anthropic' | 'openai' | 'mistral' | 'ollama'

export interface Settings {
  provider: Provider
  anthropic_api_key: string
  openai_api_key: string
  mistral_api_key: string
  ollama_base_url: string
  model: string
  custom_prompt: string
  default_prompt: string
  default_models: Record<Provider, string>
}
