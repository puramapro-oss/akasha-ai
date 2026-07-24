import { useEffect } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuthStore } from '@/store/auth'
import { COLORS } from '@/lib/constants'

export default function Index() {
  const router = useRouter()
  const { session, loading, initialized } = useAuthStore()

  useEffect(() => {
    if (!initialized) return

    if (session) {
      router.replace('/(tabs)/home')
    } else {
      router.replace('/auth/login')
    }
  }, [session, initialized, router])

  return (
    <View className="flex-1 items-center justify-center bg-void">
      <ActivityIndicator size="large" color={COLORS.cyan} />
    </View>
  )
}
