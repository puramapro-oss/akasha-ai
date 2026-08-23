export interface ApiEndpoint {
  method: string
  path: string
  desc: string
  curl: (key: string) => string
}

export const ENDPOINTS: ApiEndpoint[] = [
  {
    method: 'POST',
    path: '/api/v1/chat',
    desc: 'Envoie un message a AKASHA IA',
    curl: (key: string) =>
      `curl -X POST https://akasha.purama.dev/api/v1/chat \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Bonjour AKASHA !", "model": "claude-sonnet-4"}'`,
  },
  {
    method: 'POST',
    path: '/api/v1/generate/image',
    desc: 'Genere une image avec FLUX',
    curl: (key: string) =>
      `curl -X POST https://akasha.purama.dev/api/v1/generate/image \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{"prompt": "Un chat astronaute dans l\\'espace", "style": "photorealistic"}'`,
  },
  {
    method: 'POST',
    path: '/api/v1/generate/audio',
    desc: 'Convertit du texte en audio',
    curl: (key: string) =>
      `curl -X POST https://akasha.purama.dev/api/v1/generate/audio \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{"text": "Bonjour depuis AKASHA", "voice": "nova"}'`,
  },
]
