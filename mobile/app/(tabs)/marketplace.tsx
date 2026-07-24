import { useEffect, useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, FlatList, RefreshControl } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { COLORS } from '@/lib/constants'
import { hapticLight, formatPrice } from '@/lib/utils'
import type { Agent } from '@/lib/types'

export default function MarketplaceScreen() {
  const router = useRouter()
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)

  const fetch_ = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('agents')
      .select('*')
      .eq('is_public', true)
      .gt('price', 0)
      .order('rating', { ascending: false })
      .limit(30)
    setAgents((data as Agent[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch_() }, [fetch_])

  return (
    <SafeAreaView className="flex-1 bg-void" edges={['top']}>
      <View className="px-5 pt-4 pb-3">
        <TouchableOpacity onPress={() => router.back()} className="mb-2">
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text className="text-white text-2xl" style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
          Marketplace
        </Text>
        <Text className="text-gray-400 text-sm" style={{ fontFamily: 'DMSans_400Regular' }}>
          Agents IA premium de la communaute
        </Text>
      </View>

      <FlatList
        data={agents}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, paddingTop: 12 }}
        columnWrapperStyle={{ gap: 12 }}
        ItemSeparatorComponent={() => <View className="h-3" />}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetch_} tintColor={COLORS.cyan} />}
        renderItem={({ item }) => (
          <TouchableOpacity
            testID={`marketplace-${item.id}`}
            onPress={() => hapticLight()}
            className="flex-1 bg-white/5 rounded-2xl p-4 border border-white/[0.06]"
            activeOpacity={0.7}
          >
            <View className="w-10 h-10 rounded-xl items-center justify-center mb-3" style={{ backgroundColor: (item.color ?? COLORS.purple) + '15' }}>
              <Text className="text-lg">{item.icon ?? '🤖'}</Text>
            </View>
            <Text className="text-white text-sm mb-1" style={{ fontFamily: 'DMSans_700Bold' }} numberOfLines={1}>
              {item.name}
            </Text>
            <Text className="text-gray-500 text-xs mb-2" style={{ fontFamily: 'DMSans_400Regular' }} numberOfLines={2}>
              {item.description}
            </Text>
            <View className="flex-row items-center justify-between">
              <Text className="text-cyan text-xs" style={{ fontFamily: 'DMSans_700Bold' }}>
                {formatPrice(item.price)}
              </Text>
              <View className="flex-row items-center">
                <Ionicons name="star" size={10} color={COLORS.gold} />
                <Text className="text-gray-400 text-xs ml-1" style={{ fontFamily: 'DMSans_400Regular' }}>
                  {item.rating.toFixed(1)}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !loading ? (
            <View className="items-center py-16">
              <Ionicons name="storefront" size={48} color={COLORS.gray[600]} />
              <Text className="text-gray-500 mt-4" style={{ fontFamily: 'DMSans_400Regular' }}>
                Le marketplace arrive bientot.
              </Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  )
}
