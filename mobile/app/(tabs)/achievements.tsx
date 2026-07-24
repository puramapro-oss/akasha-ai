import { useEffect, useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, FlatList, RefreshControl } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { COLORS } from '@/lib/constants'
import type { Achievement } from '@/lib/types'

export default function AchievementsScreen() {
  const router = useRouter()
  const { profile } = useAuthStore()
  const [achievements, setAchievements] = useState<(Achievement & { earned: boolean })[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    if (!profile) return
    setLoading(true)

    const [allRes, earnedRes] = await Promise.all([
      supabase.from('achievements').select('*').order('category'),
      supabase.from('user_achievements').select('achievement_id').eq('user_id', profile.id),
    ])

    const earnedIds = new Set((earnedRes.data ?? []).map((e: { achievement_id: string }) => e.achievement_id))
    const merged = ((allRes.data ?? []) as Achievement[]).map((a) => ({
      ...a,
      earned: earnedIds.has(a.id),
    }))
    setAchievements(merged)
    setLoading(false)
  }, [profile])

  useEffect(() => { fetchData() }, [fetchData])

  const earned = achievements.filter((a) => a.earned).length

  return (
    <SafeAreaView className="flex-1 bg-void" edges={['top']}>
      <View className="px-5 pt-4 pb-3">
        <TouchableOpacity onPress={() => router.back()} className="mb-2">
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View className="flex-row items-center justify-between">
          <Text className="text-white text-2xl" style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
            Achievements
          </Text>
          <View className="bg-orange/20 px-3 py-1 rounded-full">
            <Text className="text-orange text-sm" style={{ fontFamily: 'DMSans_700Bold' }}>
              {earned}/{achievements.length}
            </Text>
          </View>
        </View>
      </View>

      <FlatList
        data={achievements}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, paddingTop: 8 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} tintColor={COLORS.cyan} />}
        renderItem={({ item }) => (
          <View
            className={`flex-row items-center p-4 mb-3 rounded-xl border ${
              item.earned ? 'bg-white/5 border-gold/20' : 'bg-white/[0.02] border-white/[0.04]'
            }`}
          >
            <View
              className="w-12 h-12 rounded-xl items-center justify-center mr-4"
              style={{ backgroundColor: item.earned ? COLORS.gold + '20' : 'rgba(255,255,255,0.03)' }}
            >
              <Text className="text-xl">{item.icon ?? '🏆'}</Text>
            </View>
            <View className="flex-1">
              <Text
                className={`text-base ${item.earned ? 'text-white' : 'text-gray-500'}`}
                style={{ fontFamily: 'DMSans_700Bold' }}
              >
                {item.name}
              </Text>
              <Text className="text-gray-500 text-xs mt-1" style={{ fontFamily: 'DMSans_400Regular' }}>
                {item.description}
              </Text>
            </View>
            {item.earned && <Ionicons name="checkmark-circle" size={20} color={COLORS.gold} />}
          </View>
        )}
      />
    </SafeAreaView>
  )
}
