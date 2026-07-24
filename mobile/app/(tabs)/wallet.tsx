import { useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView, TextInput, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthStore } from '@/store/auth'
import { COLORS, WALLET_MIN_WITHDRAWAL } from '@/lib/constants'
import { hapticLight, hapticSuccess } from '@/lib/utils'

export default function WalletScreen() {
  const router = useRouter()
  const { profile } = useAuthStore()
  const [iban, setIban] = useState('')
  const [amount, setAmount] = useState('')

  const balance = profile?.wallet_balance ?? 0

  const handleWithdraw = async () => {
    const amountNum = parseFloat(amount)
    if (!iban.trim() || iban.length < 15) {
      Alert.alert('Erreur', 'Entre un IBAN valide.')
      return
    }
    if (isNaN(amountNum) || amountNum < WALLET_MIN_WITHDRAWAL) {
      Alert.alert('Erreur', `Le montant minimum est de ${WALLET_MIN_WITHDRAWAL}€.`)
      return
    }
    if (amountNum > balance) {
      Alert.alert('Erreur', 'Solde insuffisant.')
      return
    }
    hapticLight()
    try {
      const res = await fetch(`${process.env.EXPO_PUBLIC_APP_URL}/api/wallet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: profile?.id, amount: amountNum, iban: iban.trim() }),
      })
      if (!res.ok) throw new Error()
      hapticSuccess()
      Alert.alert('Retrait demande', `${amountNum.toFixed(2)}€ seront transferes sur ton IBAN sous 3 a 5 jours.`)
      setAmount('')
      setIban('')
    } catch {
      Alert.alert('Erreur', 'Impossible de traiter le retrait. Reessaie plus tard.')
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-void" edges={['top']}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-5 pt-4 pb-6">
          <TouchableOpacity onPress={() => router.back()} className="mb-2">
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text className="text-white text-2xl" style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
            Wallet
          </Text>
        </View>

        {/* Balance Card */}
        <View className="mx-5 mb-6">
          <LinearGradient
            colors={['rgba(57,255,20,0.15)', 'rgba(0,212,255,0.1)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            className="rounded-2xl p-6 border border-white/[0.06]"
          >
            <Text className="text-gray-400 text-sm mb-1" style={{ fontFamily: 'DMSans_400Regular' }}>
              Solde disponible
            </Text>
            <Text className="text-white text-4xl mb-2" style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
              {balance.toFixed(2)}€
            </Text>
            <Text className="text-gray-500 text-xs" style={{ fontFamily: 'DMSans_400Regular' }}>
              Retrait minimum : {WALLET_MIN_WITHDRAWAL}€ via IBAN
            </Text>
          </LinearGradient>
        </View>

        {/* Withdrawal Form */}
        {balance >= WALLET_MIN_WITHDRAWAL && (
          <View className="px-5">
            <Text className="text-white text-lg mb-4" style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
              Demander un retrait
            </Text>

            <View className="mb-4">
              <Text className="text-gray-400 text-sm mb-2" style={{ fontFamily: 'DMSans_500Medium' }}>
                IBAN
              </Text>
              <TextInput
                testID="wallet-iban"
                value={iban}
                onChangeText={setIban}
                placeholder="FR76 XXXX XXXX XXXX XXXX XXXX XXX"
                placeholderTextColor={COLORS.gray[500]}
                autoCapitalize="characters"
                className="bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white text-base"
                style={{ fontFamily: 'JetBrainsMono_400Regular' }}
              />
            </View>

            <View className="mb-6">
              <Text className="text-gray-400 text-sm mb-2" style={{ fontFamily: 'DMSans_500Medium' }}>
                Montant (€)
              </Text>
              <TextInput
                testID="wallet-amount"
                value={amount}
                onChangeText={setAmount}
                placeholder={`Min. ${WALLET_MIN_WITHDRAWAL}€`}
                placeholderTextColor={COLORS.gray[500]}
                keyboardType="decimal-pad"
                className="bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white text-base"
                style={{ fontFamily: 'DMSans_400Regular' }}
              />
            </View>

            <TouchableOpacity testID="withdraw-btn" onPress={handleWithdraw} activeOpacity={0.8}>
              <LinearGradient
                colors={['#39ff14', '#10b981']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                className="rounded-xl py-4 items-center"
              >
                <Text className="text-white text-base" style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
                  Retirer mes gains
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
