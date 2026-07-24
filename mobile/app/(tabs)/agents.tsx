import { useEffect, useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, FlatList, RefreshControl } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { COLORS } from '@/lib/constants'
import type { Agent } from '@/lib/types'

export default function AgentsScreen() {
  const router = useRouter()
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAgents = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('agents')
      .select('*')
      .eq('is_public', true)
      .eq('is_active', true)
      .order('installs', { ascending: false })
      .limit(20)
    setAgents((data as Agent[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAgents() }, [fetchAgents])

  return (
    <SafeAreaView className="flex-1 bg-void" edges={['top']}>
      <View className="px-5 pt-4 pb-3 flex-row items-center justify-between">
        <View>
          <TouchableOpacity onPress={() => router.back()} className="mb-2">
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text className="text-white text-2xl" style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
            Agents IA
          </Text>
        </View>
      </View>

      <FlatList
        data={agents}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchAgents} tintColor={COLORS.cyan} />}
        renderItem={({ item }) => (
          <TouchableOpacity
            testID={`agent-${item.id}`}
            className="bg-white/5 rounded-2xl p-4 mb-3 border border-white/[0.06]"
            activeOpacity={0.7}
          >
            <View className="flex-row items-center mb-2">
              <View
                className="w-10 h-10 rounded-xl items-center justify-center mr-3"
                style={{ backgroundColor: (item.color ?? COLORS.cyan) + '15' }}
              >
                <Text className="text-lg">{item.icon ?? '🤖'}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-white text-base" style={{ fontFamily: 'DMSans_700Bold' }}>
                  {item.name}
                </Text>
                <View className="flex-row items-center mt-1">
                  <Ionicons name="star" size={12} color={COLORS.gold} />
                  <Text className="text-gray-400 text-xs ml-1" style={{ fontFamily: 'DMSans_400Regular' }}>
                    {item.rating.toFixed(1)} · {item.installs} installations
                  </Text>
                </View>
              </View>
              {item.is_verified && (
                <Ionicons name="checkmark-circle" size={18} color={COLORS.cyan} />
              )}
            </View>
            <Text className="text-gray-400 text-sm" style={{ fontFamily: 'DMSans_400Regular' }} numberOfLines={2}>
              {item.description}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !loading ? (
            <View className="items-center py-16">
              <Ionicons name="people" size={48} color={COLORS.gray[600]} />
              <Text className="text-gray-500 mt-4" style={{ fontFamily: 'DMSans_400Regular' }}>
                Aucun agent disponible pour le moment.
              </Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  )
}
