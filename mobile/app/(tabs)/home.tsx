import { useEffect, useState, useCallback } from 'react'
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useAuthStore } from '@/store/auth'
import { supabase } from '@/lib/supabase'
import { COLORS, XP_TITLES } from '@/lib/constants'
import { hapticLight } from '@/lib/utils'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function HomeScreen() {
  const router = useRouter()
  const { profile, fetchProfile } = useAuthStore()
  const [refreshing, setRefreshing] = useState(false)
  const [notifCount, setNotifCount] = useState(0)

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchProfile()
    setRefreshing(false)
  }, [fetchProfile])

  useEffect(() => {
    if (!profile) return
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', profile.id)
      .eq('is_read', false)
      .then(({ count }) => setNotifCount(count ?? 0))
  }, [profile])

  const xpTitle = XP_TITLES.find((t) => profile?.level && profile.level >= t.min && profile.level <= t.max)?.title ?? 'Explorateur'
  const xpPercent = profile ? Math.min(((profile.xp % 100) / 100) * 100, 100) : 0

  const quickActions = [
    { icon: 'chatbubble', label: 'Chat IA', color: COLORS.cyan, route: '/(tabs)/chat' },
    { icon: 'color-palette', label: 'Studio', color: COLORS.pink, route: '/(tabs)/studio' },
    { icon: 'grid', label: 'Outils', color: COLORS.neon, route: '/(tabs)/tools' },
    { icon: 'people', label: 'Agents', color: COLORS.purple, route: '/(tabs)/agents' },
  ] as const

  return (
    <SafeAreaView className="flex-1 bg-void" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.cyan} />}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 pt-4 pb-6">
          <View>
            <Text className="text-gray-400 text-sm" style={{ fontFamily: 'DMSans_400Regular' }}>
              Bienvenue,
            </Text>
            <Text className="text-white text-2xl" style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
              {profile?.display_name ?? 'Explorateur'}
            </Text>
          </View>
          <View className="flex-row gap-3">
            <TouchableOpacity
              testID="daily-gift-btn"
              onPress={() => { hapticLight(); router.push('/(tabs)/daily-gift') }}
              className="w-10 h-10 rounded-full bg-gold/10 items-center justify-center"
            >
              <Ionicons name="gift" size={20} color={COLORS.gold} />
            </TouchableOpacity>
            <TouchableOpacity
              testID="notif-btn"
              onPress={() => { hapticLight(); router.push('/(tabs)/notifications') }}
              className="w-10 h-10 rounded-full bg-white/5 items-center justify-center"
            >
              <Ionicons name="notifications" size={20} color="#fff" />
              {notifCount > 0 && (
                <View className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-pink items-center justify-center">
                  <Text className="text-white text-xs" style={{ fontFamily: 'DMSans_700Bold' }}>
                    {notifCount > 9 ? '9+' : notifCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* XP Card */}
        <View className="mx-5 mb-6">
          <LinearGradient
            colors={['rgba(0,212,255,0.1)', 'rgba(168,85,247,0.1)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            className="rounded-2xl p-5 border border-white/[0.06]"
          >
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center">
                <Text className="text-cyan text-lg mr-2" style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
                  Niv. {profile?.level ?? 1}
                </Text>
                <Text className="text-gray-400 text-sm" style={{ fontFamily: 'DMSans_400Regular' }}>
                  {xpTitle}
                </Text>
              </View>
              <View className="flex-row items-center">
                <Ionicons name="flame" size={16} color={COLORS.orange} />
                <Text className="text-orange ml-1 text-sm" style={{ fontFamily: 'DMSans_700Bold' }}>
                  {profile?.streak_count ?? 0}j
                </Text>
              </View>
            </View>
            <View className="h-2 bg-white/5 rounded-full overflow-hidden">
              <View className="h-full bg-cyan rounded-full" style={{ width: `${xpPercent}%` }} />
            </View>
            <Text className="text-gray-500 text-xs mt-2" style={{ fontFamily: 'DMSans_400Regular' }}>
              {profile?.xp ?? 0} XP — {100 - (profile?.xp ?? 0) % 100} XP avant le prochain niveau
            </Text>
          </LinearGradient>
        </View>

        {/* Quick Actions */}
        <View className="flex-row px-5 gap-3 mb-6">
          {quickActions.map((action) => (
            <TouchableOpacity
              key={action.label}
              testID={`quick-${action.label.toLowerCase().replace(' ', '-')}`}
              onPress={() => { hapticLight(); router.push(action.route as never) }}
              className="flex-1 bg-white/5 rounded-2xl p-4 items-center border border-white/[0.06]"
              activeOpacity={0.7}
            >
              <View
                className="w-12 h-12 rounded-xl items-center justify-center mb-2"
                style={{ backgroundColor: action.color + '15' }}
              >
                <Ionicons name={action.icon as never} size={24} color={action.color} />
              </View>
              <Text className="text-white text-xs text-center" style={{ fontFamily: 'DMSans_500Medium' }}>
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Plan + Stats */}
        <View className="px-5 mb-6">
          <TouchableOpacity
            onPress={() => { hapticLight(); router.push('/(tabs)/pricing') }}
            className="bg-white/5 rounded-2xl p-5 border border-white/[0.06]"
            activeOpacity={0.7}
          >
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-gray-400 text-xs mb-1" style={{ fontFamily: 'DMSans_400Regular' }}>
                  Mon plan
                </Text>
                <Text className="text-white text-lg" style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
                  {(profile?.plan ?? 'free').toUpperCase()}
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-gray-400 text-xs mb-1" style={{ fontFamily: 'DMSans_400Regular' }}>
                  Questions restantes
                </Text>
                <Text className="text-cyan text-lg" style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
                  {profile?.daily_questions ?? 10}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {/* More Features */}
        <View className="px-5">
          <Text className="text-white text-lg mb-4" style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
            Explorer
          </Text>
          {[
            { icon: 'storefront', label: 'Marketplace', desc: 'Agents IA de la communaute', color: COLORS.purple, route: '/(tabs)/marketplace' },
            { icon: 'wallet', label: 'Wallet', desc: 'Solde et retraits', color: COLORS.neon, route: '/(tabs)/wallet' },
            { icon: 'share-social', label: 'Parrainage', desc: 'Invite tes amis, gagne des commissions', color: COLORS.gold, route: '/(tabs)/referral' },
            { icon: 'trophy', label: 'Achievements', desc: '15 badges a debloquer', color: COLORS.orange, route: '/(tabs)/achievements' },
          ].map((item) => (
            <TouchableOpacity
              key={item.label}
              testID={`explore-${item.label.toLowerCase()}`}
              onPress={() => { hapticLight(); router.push(item.route as never) }}
              className="flex-row items-center bg-white/5 rounded-xl p-4 mb-3 border border-white/[0.06]"
              activeOpacity={0.7}
            >
              <View
                className="w-10 h-10 rounded-xl items-center justify-center mr-4"
                style={{ backgroundColor: item.color + '15' }}
              >
                <Ionicons name={item.icon as never} size={20} color={item.color} />
              </View>
              <View className="flex-1">
                <Text className="text-white text-base" style={{ fontFamily: 'DMSans_700Bold' }}>
                  {item.label}
                </Text>
                <Text className="text-gray-500 text-sm" style={{ fontFamily: 'DMSans_400Regular' }}>
                  {item.desc}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={COLORS.gray[500]} />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
