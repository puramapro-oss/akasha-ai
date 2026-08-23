import {
  MessageCircle,
  Send as SendIcon,
  Mail,
  Smartphone,
  Globe,
  AtSign,
  Link2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface SharePlatform {
  id: string
  name: string
  icon: LucideIcon
  color: string
  getUrl: (link: string, text: string) => string
}

export const PLATFORMS: SharePlatform[] = [
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    icon: MessageCircle,
    color: '#25D366',
    getUrl: (link: string, text: string) =>
      `https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`,
  },
  {
    id: 'telegram',
    name: 'Telegram',
    icon: SendIcon,
    color: '#0088cc',
    getUrl: (link: string, text: string) =>
      `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`,
  },
  {
    id: 'twitter',
    name: 'Twitter / X',
    icon: AtSign,
    color: '#1DA1F2',
    getUrl: (link: string, text: string) =>
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`,
  },
  {
    id: 'facebook',
    name: 'Facebook',
    icon: Globe,
    color: '#1877F2',
    getUrl: (link: string) =>
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`,
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    icon: Link2,
    color: '#0A66C2',
    getUrl: (link: string) =>
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`,
  },
  {
    id: 'email',
    name: 'Email',
    icon: Mail,
    color: '#EA4335',
    getUrl: (link: string, text: string) =>
      `mailto:?subject=${encodeURIComponent('Decouvre AKASHA AI')}&body=${encodeURIComponent(`${text}\n\n${link}`)}`,
  },
  {
    id: 'sms',
    name: 'SMS',
    icon: Smartphone,
    color: '#10b981',
    getUrl: (link: string, text: string) =>
      `sms:?body=${encodeURIComponent(`${text} ${link}`)}`,
  },
]
