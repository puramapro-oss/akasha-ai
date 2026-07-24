import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native'
import { useRouter, Link } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '@/store/auth'
import { COLORS } from '@/lib/constants'
import { hapticLight, hapticSuccess } from '@/lib/utils'

export default function SignupScreen() {
  const router = useRouter()
  const signUpWithEmail = useAuthStore((s) => s.signUpWithEmail)
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSignup = async () => {
    if (!displayName.trim() || !email.trim() || !password.trim()) {
      Alert.alert('Erreur', 'Remplis tous les champs pour continuer.')
      return
    }
    if (password.length < 6) {
      Alert.alert('Erreur', 'Le mot de passe doit faire au moins 6 caracteres.')
      return
    }
    hapticLight()
    setLoading(true)
    const { error } = await signUpWithEmail(email.trim(), password, displayName.trim())
    setLoading(false)
    if (error) {
      Alert.alert('Inscription impossible', error)
    } else {
      hapticSuccess()
      router.replace('/(tabs)/home')
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        className="flex-1 bg-void"
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="items-center mb-10">
          <View className="w-20 h-20 rounded-2xl bg-cyan/10 items-center justify-center mb-4">
            <Ionicons name="rocket" size={40} color={COLORS.cyan} />
          </View>
          <Text className="text-3xl text-white mb-2" style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
            Creer ton compte
          </Text>
          <Text className="text-gray-400 text-base text-center" style={{ fontFamily: 'DMSans_400Regular' }}>
            Rejoins AKASHA et accede a 47 outils IA
          </Text>
        </View>

        <View className="mb-4">
          <Text className="text-gray-400 text-sm mb-2" style={{ fontFamily: 'DMSans_500Medium' }}>
            Prenom ou pseudo
          </Text>
          <TextInput
            testID="name-input"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Comment on t'appelle ?"
            placeholderTextColor={COLORS.gray[500]}
            autoCapitalize="words"
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white text-base"
            style={{ fontFamily: 'DMSans_400Regular' }}
          />
        </View>

        <View className="mb-4">
          <Text className="text-gray-400 text-sm mb-2" style={{ fontFamily: 'DMSans_500Medium' }}>
            Email
          </Text>
          <TextInput
            testID="email-input"
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

        <View className="mb-6">
          <Text className="text-gray-400 text-sm mb-2" style={{ fontFamily: 'DMSans_500Medium' }}>
            Mot de passe
          </Text>
          <TextInput
            testID="password-input"
            value={password}
            onChangeText={setPassword}
            placeholder="Minimum 6 caracteres"
            placeholderTextColor={COLORS.gray[500]}
            secureTextEntry
            autoCapitalize="none"
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white text-base"
            style={{ fontFamily: 'DMSans_400Regular' }}
          />
        </View>

        <TouchableOpacity testID="signup-btn" onPress={handleSignup} disabled={loading} activeOpacity={0.8}>
          <LinearGradient
            colors={['#00d4ff', '#0099cc']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            className="rounded-xl py-4 items-center"
          >
            <Text className="text-white text-base" style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
              {loading ? 'Creation...' : 'Creer mon compte'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        <Text className="text-gray-500 text-xs text-center mt-4" style={{ fontFamily: 'DMSans_400Regular' }}>
          En creant ton compte, tu acceptes nos conditions d'utilisation et notre politique de confidentialite.
        </Text>

        <View className="flex-row justify-center mt-6">
          <Text className="text-gray-400" style={{ fontFamily: 'DMSans_400Regular' }}>
            Deja un compte ?{' '}
          </Text>
          <Link href="/auth/login" asChild>
            <TouchableOpacity>
              <Text className="text-cyan" style={{ fontFamily: 'DMSans_700Bold' }}>
                Se connecter
              </Text>
            </TouchableOpacity>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
