import { View, Text, TouchableOpacity, ScrollView, Linking } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { SafeAreaView } from 'react-native-safe-area-context'
import { COLORS } from '@/lib/constants'
import { hapticLight } from '@/lib/utils'

const PLANS = [
  {
    name: 'FREE',
    price: '0€',
    period: '',
    color: COLORS.gray[400],
    features: ['10 questions/jour', '3 modeles IA', 'Outils de base'],
    cta: null,
  },
  {
    name: 'AUTOMATE',
    price: '7€',
    period: '/mois',
    color: COLORS.cyan,
    features: ['100 questions/jour', 'Automatisations', 'API acces', 'Workflows n8n/Make'],
    cta: 'automate',
  },
  {
    name: 'CREATE',
    price: '7€',
    period: '/mois',
    color: COLORS.pink,
    popular: false,
    features: ['100 questions/jour', 'Generation images HD', 'Videos + musique', 'Studio creatif complet'],
    cta: 'create',
  },
  {
    name: 'BUILD',
    price: '7€',
    period: '/mois',
    color: COLORS.neon,
    features: ['100 questions/jour', 'Generation de code', 'Agents personnalises', 'Marketplace'],
    cta: 'build',
  },
  {
    name: 'COMPLET',
    price: '22€',
    period: '/mois',
    color: COLORS.gold,
    popular: true,
    features: ['300 questions/jour', 'TOUS les outils', 'Support prioritaire', 'API illimitee', '14 jours d\'essai'],
    cta: 'complete',
  },
]

export default function PricingScreen() {
  const router = useRouter()

  const handleSubscribe = (plan: string) => {
    hapticLight()
    Linking.openURL(`https://akasha.purama.dev/api/stripe/checkout?plan=${plan}`)
  }

  return (
    <SafeAreaView className="flex-1 bg-void" edges={['top']}>
      <View className="px-5 pt-4 pb-3">
        <TouchableOpacity onPress={() => router.back()} className="mb-2">
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text className="text-white text-2xl" style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
          Abonnements
        </Text>
        <Text className="text-gray-400 text-sm mt-1" style={{ fontFamily: 'DMSans_400Regular' }}>
          -33% sur l'abonnement annuel. 14 jours d'essai gratuit.
        </Text>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}>
        {PLANS.map((plan) => (
          <View
            key={plan.name}
            className={`rounded-2xl p-5 mb-4 border ${
              plan.popular ? 'border-gold/30 bg-gold/5' : 'border-white/[0.06] bg-white/5'
            }`}
          >
            {plan.popular && (
              <View className="self-start bg-gold/20 px-3 py-1 rounded-full mb-3">
                <Text className="text-gold text-xs" style={{ fontFamily: 'DMSans_700Bold' }}>
                  POPULAIRE
                </Text>
              </View>
            )}
            <View className="flex-row items-baseline mb-3">
              <Text className="text-2xl" style={{ fontFamily: 'SpaceGrotesk_700Bold', color: plan.color }}>
                {plan.name}
              </Text>
            </View>
            <View className="flex-row items-baseline mb-4">
              <Text className="text-white text-3xl" style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
                {plan.price}
              </Text>
              {plan.period ? (
                <Text className="text-gray-400 text-sm ml-1" style={{ fontFamily: 'DMSans_400Regular' }}>
                  {plan.period}
                </Text>
              ) : null}
            </View>
            {plan.features.map((f) => (
              <View key={f} className="flex-row items-center mb-2">
                <Ionicons name="checkmark-circle" size={16} color={plan.color} />
                <Text className="text-gray-300 text-sm ml-3" style={{ fontFamily: 'DMSans_400Regular' }}>
                  {f}
                </Text>
              </View>
            ))}
            {plan.cta && (
              <TouchableOpacity
                testID={`subscribe-${plan.cta}`}
                onPress={() => handleSubscribe(plan.cta!)}
                activeOpacity={0.8}
                className="mt-4"
              >
                <LinearGradient
                  colors={[plan.color, plan.color + 'aa']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  className="rounded-xl py-3 items-center"
                >
                  <Text className="text-white text-sm" style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
                    Commencer
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  )
}
