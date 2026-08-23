import { useState, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import type { SpeechRecognitionLike, SpeechRecognitionCtor, SpeechRecognitionEvent } from '@/types/chat'

export function useVoiceInput(onTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  const toggleVoice = useCallback(() => {
    if (typeof window === 'undefined') return
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor
      webkitSpeechRecognition?: SpeechRecognitionCtor
    }
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!Ctor) {
      toast.error('Reconnaissance vocale non supportee par ce navigateur (essaie Chrome, Edge ou Safari)')
      return
    }
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop()
      return
    }
    const recog = new Ctor()
    recog.lang = 'fr-FR'
    recog.continuous = false
    recog.interimResults = true
    recog.onresult = (e: SpeechRecognitionEvent) => {
      let interim = ''
      let final = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) final += r[0].transcript
        else interim += r[0].transcript
      }
      if (final) onTranscript(final.trim())
      else if (interim) onTranscript(interim.trim())
    }
    recog.onerror = () => {
      setListening(false)
      toast.error('Erreur reconnaissance vocale')
    }
    recog.onend = () => {
      setListening(false)
      recognitionRef.current = null
    }
    recognitionRef.current = recog
    try {
      recog.start()
      setListening(true)
      toast.success('Parle maintenant — clique a nouveau pour arreter')
    } catch {
      setListening(false)
      toast.error('Impossible de demarrer le micro')
    }
  }, [listening, onTranscript])

  return { listening, toggleVoice }
}
