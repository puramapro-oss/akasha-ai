'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { X, Loader2, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { DbAgent } from '@/types/chat'

const EMOJI_OPTIONS = ['🤖', '⚡', '🎯', '🔮', '🧠', '🛠️', '📊', '🚀', '💡', '🎨', '🔍', '📝', '🎧', '📧', '📱', '💻', '🌐', '🔥', '✨', '🎵']
const COLOR_OPTIONS = [
  '#00d4ff',
  '#a855f7',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#8b5cf6',
  '#06b6d4',
  '#0ea5e9',
  '#d97757',
]

export default function CreateAgentForm({
  onSave,
  onCancel,
}: {
  onSave: (agent: DbAgent) => void
  onCancel: () => void
}) {
  const supabase = createClient()
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState('🤖')
  const [color, setColor] = useState('#00d4ff')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)

  const handleSave = async () => {
    if (!name.trim() || !systemPrompt.trim()) {
      toast.error('Nom et prompt systeme requis')
      return
    }
    if (!user) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('agents')
        .insert({
          creator_id: user.id,
          name: name.trim(),
          description: description.trim() || 'Mon agent custom',
          icon,
          color,
          system_prompt: systemPrompt.trim(),
          category: 'custom',
          is_active: true,
          is_public: false,
          is_verified: false,
          model: 'claude-sonnet-4',
        })
        .select()
        .single()

      if (error) throw error
      toast.success('Agent cree avec succes !')
      onSave(data as DbAgent)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur creation agent')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--cyan)]/30 bg-[var(--cyan)]/5 p-5 space-y-4" data-testid="create-agent-form">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[var(--cyan)]" />
          Creer un agent custom
        </h3>
        <button aria-label="Fermer" onClick={onCancel} className="p-1.5 rounded-lg hover:bg-white/5 text-white/40 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Icon + Color row */}
      <div className="flex gap-3">
        <div className="relative">
          <button
            onClick={() => setShowEmojiPicker((p) => !p)}
            className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl border border-white/[0.08] bg-white/5 hover:bg-white/10 transition-colors"
            style={{ borderColor: color + '44' }}
            data-testid="emoji-picker-toggle"
          >
            {icon}
          </button>
          {showEmojiPicker && (
            <div className="absolute top-14 left-0 z-50 p-3 rounded-xl bg-[#141420] border border-white/[0.08] shadow-xl grid grid-cols-5 gap-2">
              {EMOJI_OPTIONS.map((e) => (
                <button
                  key={e}
                  onClick={() => {
                    setIcon(e)
                    setShowEmojiPicker(false)
                  }}
                  className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-lg transition-colors"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1">
          <label className="text-xs text-white/50 mb-1.5 block">Couleur</label>
          <div className="flex gap-2 flex-wrap">
            {COLOR_OPTIONS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className="w-6 h-6 rounded-full transition-all hover:scale-110"
                style={{
                  backgroundColor: c,
                  outline: color === c ? `2px solid ${c}` : 'none',
                  outlineOffset: '2px',
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Name */}
      <div>
        <label className="text-xs text-white/50 mb-1.5 block" htmlFor="name">Nom de l&apos;agent *</label>
        <input id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Mon super agent"
          maxLength={50}
          className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/[0.08] text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[var(--cyan)]/50 transition-all"
          data-testid="agent-name-input"
        />
      </div>

      {/* Description */}
      <div>
        <label className="text-xs text-white/50 mb-1.5 block" htmlFor="description">Description</label>
        <input id="description"
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ce que fait votre agent..."
          maxLength={120}
          className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/[0.08] text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[var(--cyan)]/50 transition-all"
          data-testid="agent-description-input"
        />
      </div>

      {/* System prompt */}
      <div>
        <label className="text-xs text-white/50 mb-1.5 block" htmlFor="systemPrompt">Prompt systeme *</label>
        <textarea id="systemPrompt"
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="Tu es un expert en... Tu dois toujours..."
          rows={5}
          className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/[0.08] text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[var(--cyan)]/50 transition-all resize-none"
          data-testid="agent-system-prompt-input"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl bg-white/5 text-white/60 text-sm font-medium hover:bg-white/10 transition-colors"
        >
          Annuler
        </button>
        <button
          onClick={handleSave}
          disabled={loading || !name.trim() || !systemPrompt.trim()}
          data-testid="save-agent-button"
          className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[var(--cyan)] to-[var(--purple)] text-white text-sm font-medium disabled:opacity-50 hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Sauvegarder
        </button>
      </div>
    </div>
  )
}
