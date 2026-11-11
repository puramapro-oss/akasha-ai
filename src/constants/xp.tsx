'use client'

import {
  Zap,
  MessageSquare,
  Image as ImageIcon,
  Video,
  Music,
  Bot,
  Globe,
  CheckCircle,
} from 'lucide-react'

export const XP_ACTION_ICON_NAMES: Record<string, string> = {
  daily_login: 'zap',
  chat_message: 'message',
  generate_image: 'image',
  generate_video: 'video',
  generate_music: 'music',
  create_agent: 'bot',
  publish_agent: 'globe',
  arena_vote: 'check',
  complete_workflow: 'check',
  invite_friend: 'globe',
  streak_7: 'zap',
  streak_30: 'zap',
}

export function getXPActionIcon(key: string): React.ReactNode {
  const name = XP_ACTION_ICON_NAMES[key] ?? 'star'
  const className = 'h-4 w-4'
  switch (name) {
    case 'zap':
      return <Zap className={className} />
    case 'message':
      return <MessageSquare className={className} />
    case 'image':
      return <ImageIcon className={className} aria-hidden="true" />
    case 'video':
      return <Video className={className} />
    case 'music':
      return <Music className={className} />
    case 'bot':
      return <Bot className={className} />
    case 'globe':
      return <Globe className={className} />
    case 'check':
      return <CheckCircle className={className} />
    default:
      return null
  }
}

export const XP_ACTION_LABELS: Record<string, string> = {
  daily_login: 'Connexion quotidienne',
  chat_message: 'Envoyer un message IA',
  generate_image: 'Generer une image',
  generate_video: 'Generer une video',
  generate_music: 'Generer de la musique',
  create_agent: 'Creer un agent',
  publish_agent: 'Publier un agent',
  arena_vote: 'Voter dans l\'arena',
  complete_workflow: 'Completer un workflow',
  invite_friend: 'Inviter un ami',
  streak_7: 'Serie de 7 jours',
  streak_30: 'Serie de 30 jours',
}
