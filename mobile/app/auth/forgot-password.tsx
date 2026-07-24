import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native'
import { useRouter } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { COLORS } from '@/lib/constants'
import { hapticLight, hapticSuccess } from '@/lib/utils'

export default function ForgotPasswordScreen() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleReset = async () => {
    if (!email.trim()) {
      Alert.alert('Erreur', 'Entre ton email pour recevoir le lien de reinitialisation.')
      return
    }
    hapticLight()
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: 'https://akasha.purama.dev/auth/callback',
    })
    setLoading(false)
    if (error) {
      Alert.alert('Erreur', error.message)
    } else {
      hapticSuccess()
      setSent(true)
    }
  }

  if (sent) {
    return (
      <View className="flex-1 bg-void items-center justify-center px-6">
        <View className="w-20 h-20 rounded-full bg-neon/10 items-center justify-center mb-6">
          <Ionicons name="mail" size={36} color="#39ff14" />
        </View>
        <Text className="text-2xl text-white text-center mb-3" style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
          Email envoye !
        </Text>
        <Text className="text-gray-400 text-base text-center mb-8" style={{ fontFamily: 'DMSans_400Regular' }}>
          Verifie ta boite mail et clique sur le lien pour reinitialiser ton mot de passe.
        </Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-cyan text-base" style={{ fontFamily: 'DMSans_700Bold' }}>
            Retour a la connexion
          </Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-void"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View className="flex-1 justify-center px-6">
        <TouchableOpacity onPress={() => router.back()} className="mb-8">
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        <Text className="text-2xl text-white mb-2" style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
          Mot de passe oublie ?
        </Text>
        <Text className="text-gray-400 text-base mb-8" style={{ fontFamily: 'DMSans_400Regular' }}>
          Entre ton email, on t'envoie un lien de reinitialisation.
        </Text>

        <View className="mb-6">
          <TextInput
            testID="reset-email-input"
            value={email}
            onChangeText={setEmail}
            placeholder="ton@email.com"
            placeholderTextColor={COLORS.gray[500]}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white text-base"
            style={{ fontFamily: 'DMSans_400Regular' }}
          />
        </View>

        <TouchableOpacity testID="reset-btn" onPress={handleReset} disabled={loading} activeOpacity={0.8}>
          <LinearGradient
            colors={['#00d4ff', '#0099cc']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            className="rounded-xl py-4 items-center"
          >
            <Text className="text-white text-base" style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
              {loading ? 'Envoi...' : 'Envoyer le lien'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}
