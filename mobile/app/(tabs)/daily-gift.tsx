import { useState } from 'react'
import { View, Text, TouchableOpacity, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthStore } from '@/store/auth'
import { COLORS } from '@/lib/constants'
import { hapticLight, hapticSuccess } from '@/lib/utils'

export default function DailyGiftScreen() {
  const router = useRouter()
  const { profile } = useAuthStore()
  const [opened, setOpened] = useState(false)
  const [gift, setGift] = useState<{ type: string; value: string } | null>(null)
  const [loading, setLoading] = useState(false)

  const openGift = async () => {
    hapticLight()
    setLoading(true)
    try {
      const res = await fetch(`${process.env.EXPO_PUBLIC_APP_URL}/api/daily-gift`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: profile?.id }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Erreur serveur')
      }
      const data = await res.json()
      setGift(data)
      setOpened(true)
      hapticSuccess()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Impossible d\'ouvrir le coffre.'
      Alert.alert('Oups', msg)
    } finally {
      setLoading(false)
    }
  }

  const giftEmoji = gift?.type === 'points' ? '✨' : gift?.type === 'coupon' ? '🎫' : gift?.type === 'ticket' ? '🎟️' : gift?.type === 'credits' ? '💎' : '🎁'

  return (
    <SafeAreaView className="flex-1 bg-void" edges={['top']}>
      <View className="px-5 pt-4">
        <TouchableOpacity onPress={() => router.back()} className="mb-2">
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <View className="flex-1 items-center justify-center px-8">
        {!opened ? (
          <>
            <View className="w-32 h-32 rounded-3xl bg-gold/10 items-center justify-center mb-8 border-2 border-gold/30">
              <Text className="text-6xl">🎁</Text>
            </View>
            <Text className="text-white text-2xl text-center mb-2" style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
              Coffre quotidien
            </Text>
            <Text className="text-gray-400 text-base text-center mb-2" style={{ fontFamily: 'DMSans_400Regular' }}>
              Ouvre ton cadeau du jour et decouvre ta recompense !
            </Text>
            <View className="flex-row items-center mb-8">
              <Ionicons name="flame" size={16} color={COLORS.orange} />
              <Text className="text-orange text-sm ml-1" style={{ fontFamily: 'DMSans_700Bold' }}>
                Streak : {profile?.streak_count ?? 0} jours
              </Text>
            </View>
            <TouchableOpacity testID="open-gift-btn" onPress={openGift} disabled={loading} activeOpacity={0.8}>
              <LinearGradient
                colors={['#ffd700', '#ff6b35']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                className="rounded-2xl px-12 py-5 items-center"
              >
                <Text className="text-white text-lg" style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
                  {loading ? 'Ouverture...' : 'Ouvrir le coffre'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text className="text-7xl mb-6">{giftEmoji}</Text>
            <Text className="text-white text-2xl text-center mb-2" style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
              Felicitations !
            </Text>
            <Text className="text-cyan text-lg text-center mb-6" style={{ fontFamily: 'DMSans_700Bold' }}>
              {gift?.value}
            </Text>
            <TouchableOpacity
              onPress={() => { hapticLight(); router.back() }}
              className="bg-white/5 rounded-xl px-8 py-3 border border-white/10"
            >
              <Text className="text-white text-base" style={{ fontFamily: 'DMSans_500Medium' }}>
                Retour
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  )
}
