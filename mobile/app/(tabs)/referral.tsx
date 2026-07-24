import { View, Text, TouchableOpacity, ScrollView, Share } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Clipboard from 'expo-clipboard'
import { useAuthStore } from '@/store/auth'
import { COLORS } from '@/lib/constants'
import { hapticLight, hapticSuccess } from '@/lib/utils'

const TIERS = [
  { name: 'Bronze', min: 5, color: '#cd7f32' },
  { name: 'Argent', min: 10, color: '#c0c0c0' },
  { name: 'Or', min: 25, color: '#ffd700' },
  { name: 'Platine', min: 50, color: '#e5e4e2' },
  { name: 'Diamant', min: 75, color: '#b9f2ff' },
  { name: 'Legende', min: 100, color: '#ff6b9d' },
]

export default function ReferralScreen() {
  const router = useRouter()
  const { profile } = useAuthStore()
  const referralCode = profile?.referral_code ?? ''
  const referralLink = `https://akasha.purama.dev/go/${referralCode}`

  const copyLink = async () => {
    hapticLight()
    await Clipboard.setStringAsync(referralLink)
    hapticSuccess()
  }

  const shareLink = async () => {
    hapticLight()
    await Share.share({
      message: `Rejoins AKASHA AI — 47 outils IA en 1 seul abonnement ! Utilise mon lien : ${referralLink}`,
      url: referralLink,
    })
  }

  return (
    <SafeAreaView className="flex-1 bg-void" edges={['top']}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-5 pt-4 pb-6">
          <TouchableOpacity onPress={() => router.back()} className="mb-2">
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text className="text-white text-2xl" style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
            Parrainage
          </Text>
          <Text className="text-gray-400 text-sm mt-1" style={{ fontFamily: 'DMSans_400Regular' }}>
            Invite tes amis et gagne des commissions a vie.
          </Text>
        </View>

        {/* Referral Link Card */}
        <View className="mx-5 mb-6">
          <LinearGradient
            colors={['rgba(255,215,0,0.1)', 'rgba(255,107,53,0.1)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            className="rounded-2xl p-5 border border-white/[0.06]"
          >
            <Text className="text-gray-400 text-xs mb-2" style={{ fontFamily: 'DMSans_400Regular' }}>
              Ton lien de parrainage
            </Text>
            <Text className="text-white text-sm mb-4" style={{ fontFamily: 'JetBrainsMono_400Regular' }} numberOfLines={1}>
              {referralLink}
            </Text>
            <View className="flex-row gap-3">
              <TouchableOpacity
                testID="copy-referral"
                onPress={copyLink}
                className="flex-1 bg-white/10 rounded-xl py-3 items-center flex-row justify-center"
              >
                <Ionicons name="copy" size={16} color="#fff" />
                <Text className="text-white text-sm ml-2" style={{ fontFamily: 'DMSans_700Bold' }}>
                  Copier
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="share-referral"
                onPress={shareLink}
                className="flex-1 bg-gold/20 rounded-xl py-3 items-center flex-row justify-center"
              >
                <Ionicons name="share-social" size={16} color={COLORS.gold} />
                <Text className="text-gold text-sm ml-2" style={{ fontFamily: 'DMSans_700Bold' }}>
                  Partager
                </Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>

        {/* Commissions info */}
        <View className="px-5 mb-6">
          <Text className="text-white text-lg mb-3" style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
            Tes commissions
          </Text>
          <View className="bg-white/5 rounded-2xl p-4 border border-white/[0.06]">
            <View className="flex-row justify-between mb-3">
              <Text className="text-gray-400 text-sm" style={{ fontFamily: 'DMSans_400Regular' }}>1er paiement</Text>
              <Text className="text-neon text-sm" style={{ fontFamily: 'DMSans_700Bold' }}>50%</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-gray-400 text-sm" style={{ fontFamily: 'DMSans_400Regular' }}>Recurrent a vie</Text>
              <Text className="text-cyan text-sm" style={{ fontFamily: 'DMSans_700Bold' }}>10%</Text>
            </View>
          </View>
        </View>

        {/* Tier Progress */}
        <View className="px-5">
          <Text className="text-white text-lg mb-3" style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
            Paliers
          </Text>
          {TIERS.map((tier) => (
            <View key={tier.name} className="flex-row items-center mb-3">
              <View className="w-3 h-3 rounded-full mr-3" style={{ backgroundColor: tier.color }} />
              <Text className="text-white text-sm flex-1" style={{ fontFamily: 'DMSans_500Medium' }}>
                {tier.name}
              </Text>
              <Text className="text-gray-400 text-sm" style={{ fontFamily: 'DMSans_400Regular' }}>
                {tier.min} filleuls
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
