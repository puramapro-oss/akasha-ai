import { useState, useRef, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthStore } from '@/store/auth'
import { COLORS, AI_MODELS } from '@/lib/constants'
import { hapticLight } from '@/lib/utils'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export default function ChatScreen() {
  const { profile } = useAuthStore()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedModel, setSelectedModel] = useState<string>(AI_MODELS[0].id)
  const flatListRef = useRef<FlatList>(null)

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return
    hapticLight()

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: text }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch(`${process.env.EXPO_PUBLIC_APP_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
          model: selectedModel,
          userId: profile?.id,
        }),
      })

      if (!res.ok) throw new Error('Erreur serveur')

      const data = await res.json()
      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.content ?? data.message ?? 'Reponse indisponible.',
      }
      setMessages((prev) => [...prev, assistantMsg])
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: 'assistant', content: 'Erreur de connexion. Reessaie dans un instant.' },
      ])
    } finally {
      setLoading(false)
    }
  }, [input, loading, messages, selectedModel, profile?.id])

  const renderMessage = useCallback(({ item }: { item: ChatMessage }) => (
    <View
      className={`mx-4 mb-3 p-4 rounded-2xl max-w-[85%] ${
        item.role === 'user' ? 'self-end bg-cyan/10 border border-cyan/20' : 'self-start bg-white/5 border border-white/[0.06]'
      }`}
    >
      <Text
        className={`text-base ${item.role === 'user' ? 'text-cyan' : 'text-white'}`}
        style={{ fontFamily: 'DMSans_400Regular' }}
        selectable
      >
        {item.content}
      </Text>
    </View>
  ), [])

  return (
    <SafeAreaView className="flex-1 bg-void" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 py-3 border-b border-white/[0.06]">
        <Text className="text-white text-xl" style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
          Chat IA
        </Text>
        <View className="flex-row bg-white/5 rounded-lg overflow-hidden">
          {AI_MODELS.map((m) => (
            <TouchableOpacity
              key={m.id}
              onPress={() => { hapticLight(); setSelectedModel(m.id) }}
              className={`px-3 py-2 ${selectedModel === m.id ? 'bg-white/10' : ''}`}
            >
              <Text
                className="text-xs"
                style={{
                  fontFamily: 'DMSans_700Bold',
                  color: selectedModel === m.id ? m.color : COLORS.gray[500],
                }}
              >
                {m.badge}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {messages.length === 0 ? (
          <View className="flex-1 items-center justify-center px-10">
            <Ionicons name="sparkles" size={48} color={COLORS.cyan} />
            <Text className="text-white text-xl text-center mt-4 mb-2" style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
              Comment puis-je t'aider ?
            </Text>
            <Text className="text-gray-400 text-center text-sm" style={{ fontFamily: 'DMSans_400Regular' }}>
              Pose-moi n'importe quelle question. Je suis AKASHA, ton assistant multi-expert.
            </Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingVertical: 16 }}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          />
        )}

        {/* Input */}
        <View className="flex-row items-end px-4 py-3 border-t border-white/[0.06] bg-void">
          <TextInput
            testID="chat-input"
            value={input}
            onChangeText={setInput}
            placeholder="Ecris ton message..."
            placeholderTextColor={COLORS.gray[500]}
            multiline
            maxLength={4000}
            className="flex-1 bg-white/5 rounded-2xl px-4 py-3 text-white text-base mr-3 max-h-32 border border-white/[0.06]"
            style={{ fontFamily: 'DMSans_400Regular' }}
          />
          <TouchableOpacity
            testID="send-btn"
            onPress={sendMessage}
            disabled={!input.trim() || loading}
            className="w-12 h-12 rounded-full items-center justify-center"
            style={{ backgroundColor: input.trim() ? COLORS.cyan : 'rgba(255,255,255,0.05)' }}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="arrow-up" size={20} color={input.trim() ? '#fff' : COLORS.gray[500]} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
