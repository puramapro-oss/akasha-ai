import { View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthStore } from '@/store/auth'
import { COLORS } from '@/lib/constants'
import { hapticLight } from '@/lib/utils'

export default function ProfileScreen() {
  const router = useRouter()
  const { profile, signOut } = useAuthStore()

  const handleSignOut = () => {
    Alert.alert('Deconnexion', 'Tu veux vraiment te deconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Se deconnecter',
        style: 'destructive',
        onPress: async () => {
          await signOut()
          router.replace('/auth/login')
        },
      },
    ])
  }

  const menuItems = [
    { icon: 'settings', label: 'Parametres', route: '/(tabs)/settings', color: COLORS.gray[400] },
    { icon: 'wallet', label: 'Wallet', route: '/(tabs)/wallet', color: COLORS.neon },
    { icon: 'share-social', label: 'Parrainage', route: '/(tabs)/referral', color: COLORS.gold },
    { icon: 'trophy', label: 'Achievements', route: '/(tabs)/achievements', color: COLORS.orange },
    { icon: 'notifications', label: 'Notifications', route: '/(tabs)/notifications', color: COLORS.cyan },
    { icon: 'card', label: 'Pricing', route: '/(tabs)/pricing', color: COLORS.purple },
  ] as const

  return (
    <SafeAreaView className="flex-1 bg-void" edges={['top']}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Profile Header */}
        <View className="items-center px-5 pt-6 pb-8">
          <View className="w-20 h-20 rounded-full bg-cyan/10 items-center justify-center mb-4">
            <Text className="text-cyan text-3xl" style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
              {(profile?.display_name ?? 'A')[0].toUpperCase()}
            </Text>
          </View>
          <Text className="text-white text-xl mb-1" style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
            {profile?.display_name ?? 'Utilisateur'}
          </Text>
          <Text className="text-gray-400 text-sm mb-2" style={{ fontFamily: 'DMSans_400Regular' }}>
            {profile?.email}
          </Text>
          <View className="flex-row items-center">
            <View className="bg-cyan/20 px-3 py-1 rounded-full mr-2">
              <Text className="text-cyan text-xs" style={{ fontFamily: 'DMSans_700Bold' }}>
                {(profile?.plan ?? 'free').toUpperCase()}
              </Text>
            </View>
            <View className="bg-purple/20 px-3 py-1 rounded-full">
              <Text className="text-purple text-xs" style={{ fontFamily: 'DMSans_700Bold' }}>
                Niv. {profile?.level ?? 1}
              </Text>
            </View>
          </View>
        </View>

        {/* Stats Row */}
        <View className="flex-row px-5 gap-3 mb-6">
          {[
            { label: 'XP', value: profile?.xp ?? 0, color: COLORS.cyan },
            { label: 'Streak', value: `${profile?.streak_count ?? 0}j`, color: COLORS.orange },
            { label: 'Wallet', value: `${(profile?.wallet_balance ?? 0).toFixed(2)}€`, color: COLORS.neon },
          ].map((stat) => (
            <View key={stat.label} className="flex-1 bg-white/5 rounded-xl p-4 items-center border border-white/[0.06]">
              <Text className="text-lg" style={{ fontFamily: 'SpaceGrotesk_700Bold', color: stat.color }}>
                {stat.value}
              </Text>
              <Text className="text-gray-500 text-xs mt-1" style={{ fontFamily: 'DMSans_400Regular' }}>
                {stat.label}
              </Text>
            </View>
          ))}
        </View>

        {/* Menu */}
        <View className="px-5">
          {menuItems.map((item) => (
            <TouchableOpacity
              key={item.label}
              testID={`profile-${item.label.toLowerCase()}`}
              onPress={() => { hapticLight(); router.push(item.route as never) }}
              className="flex-row items-center bg-white/5 rounded-xl p-4 mb-3 border border-white/[0.06]"
              activeOpacity={0.7}
            >
              <Ionicons name={item.icon as never} size={20} color={item.color} />
              <Text className="text-white text-base ml-4 flex-1" style={{ fontFamily: 'DMSans_500Medium' }}>
                {item.label}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={COLORS.gray[500]} />
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            testID="signout-btn"
            onPress={handleSignOut}
            className="flex-row items-center bg-red-500/10 rounded-xl p-4 mt-4 border border-red-500/20"
            activeOpacity={0.7}
          >
            <Ionicons name="log-out" size={20} color="#ef4444" />
            <Text className="text-red-400 text-base ml-4" style={{ fontFamily: 'DMSans_500Medium' }}>
              Se deconnecter
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
