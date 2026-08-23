// ─── Chat Types ──────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

export interface QuotaInfo {
  plan: string
  limit: number
  used: number
  remaining: number
  isSuperAdmin: boolean
}

// ─── Agent Types ─────────────────────────────────────────────────────────────

export interface DbAgent {
  id: string
  name: string
  description: string
  icon: string
  color: string
  system_prompt: string
  category: string
  is_active: boolean
  creator_id: string
}

// ─── Speech Recognition Types ────────────────────────────────────────────────

export interface SpeechRecognitionResult {
  isFinal: boolean
  0: { transcript: string }
}

export interface SpeechRecognitionEvent extends Event {
  results: { length: number; [index: number]: SpeechRecognitionResult }
  resultIndex: number
}

export interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: Event) => void) | null
  onend: (() => void) | null
}

export type SpeechRecognitionCtor = new () => SpeechRecognitionLike
