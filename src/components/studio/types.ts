import { Image as ImageIcon, Video, Music, Code2 } from 'lucide-react'

export interface Generation {
  id: string
  type: string
  prompt: string
  model: string | null
  result_url: string | null
  result_text: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export type StudioTab = 'image' | 'video' | 'audio' | 'code'
export type AudioSubTab = 'voice' | 'music'

export const TABS: { id: StudioTab; label: string; icon: React.ElementType }[] = [
  { id: 'image', label: 'Image', icon: ImageIcon },
  { id: 'video', label: 'Video', icon: Video },
  { id: 'audio', label: 'Audio', icon: Music },
  { id: 'code', label: 'Code', icon: Code2 },
]

export const IMAGE_MODELS = [
  { id: 'flux', label: 'FLUX Pro', badge: 'LIVE', available: true },
  { id: 'dalle', label: 'DALL-E 3', badge: 'LIVE', available: true },
  { id: 'imagen', label: 'Pollinations Flux', badge: 'LIVE', available: true },
]

export const CODE_LANGUAGES = [
  'JavaScript', 'TypeScript', 'Python', 'Go', 'Rust', 'SQL',
  'Java', 'C++', 'C#', 'PHP', 'Swift', 'Kotlin',
]

export const TTS_VOICES = [
  { id: 'alloy', label: 'Alloy' },
  { id: 'nova', label: 'Nova' },
  { id: 'shimmer', label: 'Shimmer' },
  { id: 'echo', label: 'Echo' },
  { id: 'fable', label: 'Fable' },
  { id: 'onyx', label: 'Onyx' },
]

export const TTS_MODELS = [
  { id: 'openai-tts', label: 'OpenAI TTS', badge: 'LIVE', available: true },
  { id: 'elevenlabs', label: 'ElevenLabs', badge: 'LIVE', available: true },
]
