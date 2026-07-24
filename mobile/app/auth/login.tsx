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
import { supabase } from '@/lib/supabase'
import { COLORS } from '@/lib/constants'
import { hapticLight, hapticSuccess } from '@/lib/utils'
import * as Linking from 'expo-linking'

export default function LoginScreen() {
  const router = useRouter()
  const signInWithEmail = useAuthStore((s) => s.signInWithEmail)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleEmailLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Erreur', 'Remplis tous les champs pour continuer.')
      return
    }
    hapticLight()
    setLoading(true)
    const { error } = await signInWithEmail(email.trim(), password)
    setLoading(false)
    if (error) {
      Alert.alert('Connexion impossible', error)
    } else {
      hapticSuccess()
      router.replace('/(tabs)/home')
    }
  }

  const handleGoogleLogin = async () => {
    hapticLight()
    const redirectUrl = Linking.createURL('auth/callback')
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectUrl },
    })
    if (error) {
      Alert.alert('Erreur', error.message)
      return
    }
    if (data.url) {
      await Linking.openURL(data.url)
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
            <Ionicons name="sparkles" size={40} color={COLORS.cyan} />
          </View>
          <Text
            className="text-3xl text-white mb-2"
            style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
          >
            AKASHA AI
          </Text>
          <Text className="text-gray-400 text-base" style={{ fontFamily: 'DMSans_400Regular' }}>
            47 outils IA, un seul abonnement
          </Text>
        </View>

        <TouchableOpacity
          testID="google-login-btn"
          onPress={handleGoogleLogin}
          className="flex-row items-center justify-center bg-white/5 border border-white/10 rounded-xl py-4 mb-6"
          activeOpacity={0.7}
        >
          <Ionicons name="logo-google" size={20} color="#fff" />
          <Text className="text-white ml-3 text-base" style={{ fontFamily: 'DMSans_500Medium' }}>
            Continuer avec Google
          </Text>
        </TouchableOpacity>

        <View className="flex-row items-center mb-6">
          <View className="flex-1 h-px bg-white/10" />
          <Text className="text-gray-500 mx-4 text-sm" style={{ fontFamily: 'DMSans_400Regular' }}>
            ou
          </Text>
          <View className="flex-1 h-px bg-white/10" />
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

        <View className="mb-2">
          <Text className="text-gray-400 text-sm mb-2" style={{ fontFamily: 'DMSans_500Medium' }}>
            Mot de passe
          </Text>
          <View className="relative">
            <TextInput
              testID="password-input"
              value={password}
              onChangeText={setPassword}
              placeholder="Ton mot de passe"
              placeholderTextColor={COLORS.gray[500]}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white text-base pr-12"
              style={{ fontFamily: 'DMSans_400Regular' }}
            />
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-4"
            >
              <Ionicons
                name={showPassword ? 'eye-off' : 'eye'}
                size={20}
                color={COLORS.gray[400]}
              />
            </TouchableOpacity>
          </View>
        </View>

        <Link href="/auth/forgot-password" asChild>
          <TouchableOpacity className="self-end mb-6">
            <Text className="text-cyan text-sm" style={{ fontFamily: 'DMSans_500Medium' }}>
              Mot de passe oublie ?
            </Text>
          </TouchableOpacity>
        </Link>

        <TouchableOpacity
          testID="login-btn"
          onPress={handleEmailLogin}
          disabled={loading}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['#00d4ff', '#0099cc']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            className="rounded-xl py-4 items-center"
          >
            <Text
              className="text-white text-base"
              style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
            >
              {loading ? 'Connexion...' : 'Se connecter'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        <View className="flex-row justify-center mt-6">
          <Text className="text-gray-400" style={{ fontFamily: 'DMSans_400Regular' }}>
            Pas encore de compte ?{' '}
          </Text>
          <Link href="/auth/signup" asChild>
            <TouchableOpacity>
              <Text className="text-cyan" style={{ fontFamily: 'DMSans_700Bold' }}>
                Creer un compte
              </Text>
            </TouchableOpacity>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
