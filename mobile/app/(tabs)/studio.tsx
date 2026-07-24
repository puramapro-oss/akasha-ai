import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { Image } from 'expo-image'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthStore } from '@/store/auth'
import { COLORS } from '@/lib/constants'
import { hapticLight, hapticSuccess } from '@/lib/utils'

type StudioMode = 'image' | 'video' | 'audio' | 'code'

const MODES: { id: StudioMode; label: string; icon: string; color: string }[] = [
  { id: 'image', label: 'Image', icon: 'image', color: COLORS.cyan },
  { id: 'video', label: 'Video', icon: 'videocam', color: COLORS.pink },
  { id: 'audio', label: 'Audio', icon: 'musical-notes', color: COLORS.gold },
  { id: 'code', label: 'Code', icon: 'code-slash', color: COLORS.neon },
]

export default function StudioScreen() {
  const { profile } = useAuthStore()
  const [mode, setMode] = useState<StudioMode>('image')
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      Alert.alert('Erreur', 'Decris ce que tu veux generer.')
      return
    }
    hapticLight()
    setLoading(true)
    setResult(null)

    try {
      const res = await fetch(`${process.env.EXPO_PUBLIC_APP_URL}/api/generate/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), userId: profile?.id }),
      })
      if (!res.ok) throw new Error('Erreur serveur')
      const data = await res.json()
      setResult(data.url ?? data.result ?? data.content)
      hapticSuccess()
    } catch {
      Alert.alert('Erreur', 'Generation impossible. Reessaie dans un instant.')
    } finally {
      setLoading(false)
    }
  }

  const currentMode = MODES.find((m) => m.id === mode)!

  return (
    <SafeAreaView className="flex-1 bg-void" edges={['top']}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-5 pt-4 pb-6">
          <Text className="text-white text-2xl mb-1" style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
            Studio Creatif
          </Text>
          <Text className="text-gray-400 text-sm" style={{ fontFamily: 'DMSans_400Regular' }}>
            Genere des images, videos, musiques et du code avec l'IA.
          </Text>
        </View>

        {/* Mode selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-5 mb-6">
          {MODES.map((m) => (
            <TouchableOpacity
              key={m.id}
              testID={`studio-mode-${m.id}`}
              onPress={() => { hapticLight(); setMode(m.id); setResult(null) }}
              className={`flex-row items-center px-5 py-3 mr-3 rounded-xl border ${
                mode === m.id ? 'border-white/20 bg-white/10' : 'border-white/[0.06] bg-white/5'
              }`}
            >
              <Ionicons name={m.icon as never} size={18} color={mode === m.id ? m.color : COLORS.gray[500]} />
              <Text
                className="ml-2 text-sm"
                style={{
                  fontFamily: 'DMSans_700Bold',
                  color: mode === m.id ? '#fff' : COLORS.gray[500],
                }}
              >
                {m.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Prompt input */}
        <View className="px-5 mb-6">
          <TextInput
            testID="studio-prompt"
            value={prompt}
            onChangeText={setPrompt}
            placeholder={`Decris ${mode === 'image' ? 'ton image' : mode === 'video' ? 'ta video' : mode === 'audio' ? 'ta musique' : 'ton code'}...`}
            placeholderTextColor={COLORS.gray[500]}
            multiline
            numberOfLines={4}
            maxLength={2000}
            className="bg-white/5 border border-white/10 rounded-2xl px-4 py-4 text-white text-base min-h-[120px]"
            style={{ fontFamily: 'DMSans_400Regular', textAlignVertical: 'top' }}
          />
        </View>

        <View className="px-5 mb-6">
          <TouchableOpacity testID="generate-btn" onPress={handleGenerate} disabled={loading} activeOpacity={0.8}>
            <LinearGradient
              colors={[currentMode.color, currentMode.color + 'aa']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              className="rounded-xl py-4 items-center flex-row justify-center"
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="sparkles" size={18} color="#fff" />
                  <Text className="text-white text-base ml-2" style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
                    Generer
                  </Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Result */}
        {result && (
          <View className="px-5">
            <Text className="text-white text-lg mb-3" style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
              Resultat
            </Text>
            {mode === 'image' && result.startsWith('http') ? (
              <Image
                source={{ uri: result }}
                className="w-full aspect-square rounded-2xl"
                contentFit="cover"
              />
            ) : (
              <View className="bg-white/5 rounded-2xl p-4 border border-white/[0.06]">
                <Text className="text-white text-sm" style={{ fontFamily: mode === 'code' ? 'JetBrainsMono_400Regular' : 'DMSans_400Regular' }} selectable>
                  {result}
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
