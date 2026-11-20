export interface Tool {
  id: string
  name: string
  description: string
  category: 'text' | 'image' | 'video' | 'audio' | 'code' | 'research' | 'automation'
  badge: 'LIVE' | 'LINK' | 'LOCAL'
  url?: string
  route?: string
  color: string
  universe: 'automate' | 'create' | 'build' | 'complete'
  planRequired: 'free' | 'essential' | 'pro' | 'max'
}

export const TOOLS: Tool[] = [
  // LIVE - Text/Chat (chacun route vers une variante AKASHA reelle)
  { id: 'akasha-sonnet', name: 'AKASHA Sonnet', description: 'LLM equilibre — qualite premium', category: 'text', badge: 'LIVE', route: '/dashboard/chat?model=akasha-sonnet', color: '#00d4ff', universe: 'build', planRequired: 'free' },
  { id: 'akasha-opus', name: 'AKASHA Opus', description: 'Reflexion profonde pour taches complexes', category: 'text', badge: 'LIVE', route: '/dashboard/chat?model=akasha-opus', color: '#a855f7', universe: 'build', planRequired: 'pro' },
  { id: 'akasha-haiku', name: 'AKASHA Haiku', description: 'Reponses ultra-rapides', category: 'text', badge: 'LIVE', route: '/dashboard/chat?model=akasha-haiku', color: '#10b981', universe: 'build', planRequired: 'free' },
  // LINK - LLMs externes (acces direct via leur plateforme)
  { id: 'gpt-4o', name: 'GPT-4o', description: "Modele phare d'OpenAI", category: 'text', badge: 'LINK', url: 'https://chatgpt.com', color: '#10a37f', universe: 'build', planRequired: 'free' },
  { id: 'gemini', name: 'Gemini 2.5 Pro', description: 'Modele multimodal de Google', category: 'text', badge: 'LINK', url: 'https://gemini.google.com', color: '#4285f4', universe: 'build', planRequired: 'free' },
  { id: 'mistral', name: 'Mistral Large', description: 'LLM francais open-weights', category: 'text', badge: 'LINK', url: 'https://chat.mistral.ai', color: '#ff7000', universe: 'build', planRequired: 'free' },
  { id: 'deepseek', name: 'DeepSeek R2', description: 'Reasoning LLM ultra-performant', category: 'text', badge: 'LINK', url: 'https://chat.deepseek.com', color: '#0ea5e9', universe: 'automate', planRequired: 'free' },
  { id: 'grok', name: 'Grok 3', description: 'LLM xAI avec acces temps reel', category: 'text', badge: 'LINK', url: 'https://x.ai', color: '#1d9bf0', universe: 'automate', planRequired: 'free' },

  // LIVE - Image (4)
  { id: 'flux', name: 'FLUX Pro', description: "Generation d'images photorealistes", category: 'image', badge: 'LIVE', route: '/dashboard/studio?tab=image&model=flux', color: '#a855f7', universe: 'create', planRequired: 'essential' },
  { id: 'dalle', name: 'DALL-E 3', description: "Generateur d'images OpenAI", category: 'image', badge: 'LIVE', route: '/dashboard/studio?tab=image&model=dalle', color: '#10a37f', universe: 'create', planRequired: 'essential' },
  { id: 'pollinations', name: 'Pollinations Flux', description: 'Generation rapide haute fidelite', category: 'image', badge: 'LIVE', route: '/dashboard/studio?tab=image&model=imagen', color: '#4285f4', universe: 'create', planRequired: 'free' },
  { id: 'ideogram', name: 'Ideogram 3', description: 'Texte dans les images', category: 'image', badge: 'LINK', url: 'https://ideogram.ai', color: '#ec4899', universe: 'create', planRequired: 'free' },

  // LIVE - Audio (3)
  { id: 'elevenlabs', name: 'ElevenLabs v3', description: 'Voix IA ultra-realistes', category: 'audio', badge: 'LIVE', route: '/dashboard/studio?tab=audio&model=elevenlabs', color: '#ff6b35', universe: 'create', planRequired: 'essential' },
  { id: 'openai-tts', name: 'OpenAI TTS', description: 'Text-to-speech rapide', category: 'audio', badge: 'LIVE', route: '/dashboard/studio?tab=audio&model=openai-tts', color: '#10a37f', universe: 'create', planRequired: 'free' },
  { id: 'whisper', name: 'Whisper Pro', description: 'Transcription audio multilingue', category: 'audio', badge: 'LIVE', route: '/dashboard/studio?tab=audio&model=whisper', color: '#8b5cf6', universe: 'automate', planRequired: 'essential' },

  // LIVE - Video (1)
  { id: 'ltx', name: 'LTX-2.3', description: 'Generation video IA', category: 'video', badge: 'LIVE', route: '/dashboard/studio?tab=video&model=ltx', color: '#f59e0b', universe: 'create', planRequired: 'pro' },

  // LIVE - Music (1)
  { id: 'suno', name: 'Suno v4.5', description: 'Creation musicale IA', category: 'audio', badge: 'LIVE', route: '/dashboard/studio?tab=audio&model=suno', color: '#ec4899', universe: 'create', planRequired: 'pro' },

  // LINK - Image
  { id: 'midjourney', name: 'Midjourney', description: "Generateur d'images artistiques", category: 'image', badge: 'LINK', url: 'https://midjourney.com', color: '#6d28d9', universe: 'create', planRequired: 'free' },
  { id: 'firefly', name: 'Adobe Firefly', description: 'IA Adobe pour Creative Cloud', category: 'image', badge: 'LINK', url: 'https://firefly.adobe.com', color: '#ff3366', universe: 'create', planRequired: 'free' },
  { id: 'canva', name: 'Canva IA', description: 'Design avec IA integree', category: 'image', badge: 'LINK', url: 'https://canva.com/ai', color: '#00c4cc', universe: 'create', planRequired: 'free' },

  // LINK - Code
  { id: 'cursor', name: 'Cursor', description: 'Editeur de code avec IA', category: 'code', badge: 'LINK', url: 'https://cursor.com', color: '#6366f1', universe: 'build', planRequired: 'free' },
  { id: 'bolt', name: 'Bolt.new', description: 'Build & deploy en 1 clic', category: 'code', badge: 'LINK', url: 'https://bolt.new', color: '#f59e0b', universe: 'build', planRequired: 'free' },
  { id: 'v0', name: 'v0.dev', description: 'Generation UI React par Vercel', category: 'code', badge: 'LINK', url: 'https://v0.dev', color: '#000000', universe: 'build', planRequired: 'free' },
  { id: 'claude-code', name: 'Claude Code', description: "Assistant code d'Anthropic", category: 'code', badge: 'LINK', url: 'https://claude.ai/code', color: '#d97757', universe: 'build', planRequired: 'free' },
  { id: 'copilot', name: 'GitHub Copilot', description: 'Completion de code IA', category: 'code', badge: 'LINK', url: 'https://github.com/features/copilot', color: '#24292e', universe: 'build', planRequired: 'free' },

  // LINK - Video
  { id: 'runway', name: 'Runway Gen-4', description: 'Generation video IA cinematique', category: 'video', badge: 'LINK', url: 'https://runwayml.com', color: '#8b5cf6', universe: 'create', planRequired: 'free' },
  { id: 'kling', name: 'Kling 2.0', description: 'Video IA chinoise haute qualite', category: 'video', badge: 'LINK', url: 'https://klingai.com', color: '#ec4899', universe: 'create', planRequired: 'free' },
  { id: 'heygen', name: 'HeyGen', description: 'Avatars video IA', category: 'video', badge: 'LINK', url: 'https://heygen.com', color: '#0ea5e9', universe: 'create', planRequired: 'free' },
  { id: 'descript', name: 'Descript', description: 'Edition video + audio IA', category: 'video', badge: 'LINK', url: 'https://descript.com', color: '#6366f1', universe: 'create', planRequired: 'free' },

  // LINK - Research
  { id: 'notion', name: 'Notion IA', description: 'Workspace avec IA integree', category: 'research', badge: 'LINK', url: 'https://notion.so', color: '#374151', universe: 'automate', planRequired: 'free' },
  { id: 'perplexity', name: 'Perplexity', description: 'Recherche IA avec sources', category: 'research', badge: 'LINK', url: 'https://perplexity.ai', color: '#20b2aa', universe: 'automate', planRequired: 'free' },

  // LINK - Automation
  { id: 'n8n', name: 'n8n', description: 'Automatisation workflows open-source', category: 'automation', badge: 'LINK', url: 'https://n8n.io', color: '#ea4b71', universe: 'automate', planRequired: 'free' },
  { id: 'make', name: 'Make', description: 'Automatisation visuelle', category: 'automation', badge: 'LINK', url: 'https://make.com', color: '#6d28d9', universe: 'automate', planRequired: 'free' },
  { id: 'zapier', name: 'Zapier', description: "Connecteur d'apps", category: 'automation', badge: 'LINK', url: 'https://zapier.com', color: '#ff4a00', universe: 'automate', planRequired: 'free' },

  // LINK - Audio
  { id: 'udio', name: 'Udio', description: 'Generation musicale IA', category: 'audio', badge: 'LINK', url: 'https://udio.com', color: '#ec4899', universe: 'create', planRequired: 'free' },
  { id: 'stable-audio', name: 'Stable Audio', description: 'Audio IA par Stability', category: 'audio', badge: 'LINK', url: 'https://stableaudio.com', color: '#8b5cf6', universe: 'create', planRequired: 'free' },

  // LINK - 3D
  { id: 'meshy', name: '3D Gen IA', description: 'Generation 3D par Meshy', category: 'image', badge: 'LINK', url: 'https://meshy.ai', color: '#f59e0b', universe: 'create', planRequired: 'free' },

  // LIVE bonus
  { id: 'akasha-code-gen', name: 'AKASHA Code Gen', description: 'Generation de code expert', category: 'code', badge: 'LIVE', route: '/dashboard/studio?tab=code', color: '#00d4ff', universe: 'build', planRequired: 'free' },
  { id: 'tts-voices', name: 'TTS Multi-voix', description: '6+ voix OpenAI', category: 'audio', badge: 'LIVE', route: '/dashboard/studio?tab=audio&model=openai-tts', color: '#10a37f', universe: 'create', planRequired: 'free' },

  // More LINK
  { id: 'luma', name: 'Luma Dream', description: 'Video IA de Luma Labs', category: 'video', badge: 'LINK', url: 'https://lumalabs.ai', color: '#8b5cf6', universe: 'create', planRequired: 'free' },
  { id: 'pika', name: 'Pika Labs', description: 'Video IA creative', category: 'video', badge: 'LINK', url: 'https://pika.art', color: '#ec4899', universe: 'create', planRequired: 'free' },
  { id: 'hailuo', name: 'Hailuo AI', description: 'Video IA MiniMax', category: 'video', badge: 'LINK', url: 'https://hailuoai.com', color: '#0ea5e9', universe: 'create', planRequired: 'free' },
  { id: 'leonardo', name: 'Leonardo', description: 'Generation images gaming', category: 'image', badge: 'LINK', url: 'https://leonardo.ai', color: '#f59e0b', universe: 'create', planRequired: 'free' },
  { id: 'krea', name: 'Krea AI', description: 'Generation temps reel', category: 'image', badge: 'LINK', url: 'https://krea.ai', color: '#ec4899', universe: 'create', planRequired: 'free' },
  { id: 'recraft', name: 'Recraft V3', description: 'Design vectoriel IA', category: 'image', badge: 'LINK', url: 'https://recraft.ai', color: '#8b5cf6', universe: 'create', planRequired: 'free' },
  { id: 'replit', name: 'Replit Agent', description: 'Agent dev cloud', category: 'code', badge: 'LINK', url: 'https://replit.com', color: '#f26207', universe: 'build', planRequired: 'free' },
]

export const CATEGORIES = [
  { id: 'all', label: 'Tous' },
  { id: 'text', label: 'Texte' },
  { id: 'image', label: 'Image' },
  { id: 'video', label: 'Video' },
  { id: 'audio', label: 'Audio' },
  { id: 'code', label: 'Code' },
  { id: 'research', label: 'Recherche' },
  { id: 'automation', label: 'Automatisation' },
] as const

export type Category = typeof CATEGORIES[number]['id']
