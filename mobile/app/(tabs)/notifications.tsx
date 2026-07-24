import { useEffect, useState, useCallback } from 'react'
import { View, Text, TouchableOpacity, FlatList, RefreshControl } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { COLORS } from '@/lib/constants'
import { hapticLight, formatDate } from '@/lib/utils'
import type { Notification } from '@/lib/types'

const ICON_MAP: Record<string, { icon: string; color: string }> = {
  agent: { icon: 'people', color: COLORS.purple },
  marketplace: { icon: 'storefront', color: COLORS.pink },
  quota: { icon: 'alert-circle', color: COLORS.orange },
  xp: { icon: 'star', color: COLORS.gold },
  system: { icon: 'information-circle', color: COLORS.cyan },
}

export default function NotificationsScreen() {
  const router = useRouter()
  const { profile } = useAuthStore()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  const fetchNotifs = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(50)
    setNotifications((data as Notification[]) ?? [])
    setLoading(false)
  }, [profile])

  useEffect(() => { fetchNotifs() }, [fetchNotifs])

  const markAllRead = async () => {
    if (!profile) return
    hapticLight()
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', profile.id)
      .eq('is_read', false)
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
  }

  return (
    <SafeAreaView className="flex-1 bg-void" edges={['top']}>
      <View className="px-5 pt-4 pb-3 flex-row items-center justify-between">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-3">
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text className="text-white text-2xl" style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
            Notifications
          </Text>
        </View>
        {notifications.some((n) => !n.is_read) && (
          <TouchableOpacity testID="mark-all-read" onPress={markAllRead}>
            <Text className="text-cyan text-sm" style={{ fontFamily: 'DMSans_700Bold' }}>
              Tout lire
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchNotifs} tintColor={COLORS.cyan} />}
        renderItem={({ item }) => {
          const iconInfo = ICON_MAP[item.type] ?? ICON_MAP.system
          return (
            <View
              className={`flex-row p-4 mb-2 rounded-xl border ${
                item.is_read ? 'bg-white/[0.02] border-white/[0.04]' : 'bg-white/5 border-cyan/10'
              }`}
            >
              <View
                className="w-10 h-10 rounded-xl items-center justify-center mr-4"
                style={{ backgroundColor: iconInfo.color + '15' }}
              >
                <Ionicons name={iconInfo.icon as never} size={18} color={iconInfo.color} />
              </View>
              <View className="flex-1">
                <Text className="text-white text-sm" style={{ fontFamily: 'DMSans_700Bold' }}>
                  {item.title}
                </Text>
                {item.body && (
                  <Text className="text-gray-400 text-xs mt-1" style={{ fontFamily: 'DMSans_400Regular' }} numberOfLines={2}>
                    {item.body}
                  </Text>
                )}
                <Text className="text-gray-600 text-xs mt-2" style={{ fontFamily: 'DMSans_400Regular' }}>
                  {formatDate(item.created_at)}
                </Text>
              </View>
              {!item.is_read && <View className="w-2 h-2 rounded-full bg-cyan mt-2" />}
            </View>
          )
        }}
        ListEmptyComponent={
          !loading ? (
            <View className="items-center py-20">
              <Ionicons name="notifications-off" size={48} color={COLORS.gray[600]} />
              <Text className="text-gray-500 mt-4" style={{ fontFamily: 'DMSans_400Regular' }}>
                Aucune notification pour le moment.
              </Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  )
}
