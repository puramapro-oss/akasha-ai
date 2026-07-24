import { useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView, Switch } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthStore } from '@/store/auth'
import { COLORS } from '@/lib/constants'
import { hapticLight } from '@/lib/utils'

const LANGUAGES = [
  { code: 'fr', label: 'Francais' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Espanol' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Portugues' },
  { code: 'ar', label: 'العربية' },
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'ru', label: 'Русский' },
  { code: 'tr', label: 'Turkce' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'pl', label: 'Polski' },
  { code: 'sv', label: 'Svenska' },
]

export default function SettingsScreen() {
  const router = useRouter()
  const { profile } = useAuthStore()
  const [darkMode, setDarkMode] = useState(true)
  const [pushEnabled, setPushEnabled] = useState(true)
  const [selectedLang, setSelectedLang] = useState(profile?.preferred_language ?? 'fr')
  const [showLangs, setShowLangs] = useState(false)

  return (
    <SafeAreaView className="flex-1 bg-void" edges={['top']}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-5 pt-4 pb-6">
          <TouchableOpacity onPress={() => router.back()} className="mb-2">
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text className="text-white text-2xl" style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
            Parametres
          </Text>
        </View>

        {/* Appearance */}
        <View className="px-5 mb-6">
          <Text className="text-gray-400 text-xs uppercase mb-3 tracking-wider" style={{ fontFamily: 'DMSans_700Bold' }}>
            Apparence
          </Text>
          <View className="bg-white/5 rounded-xl border border-white/[0.06] overflow-hidden">
            <View className="flex-row items-center justify-between p-4">
              <View className="flex-row items-center">
                <Ionicons name="moon" size={18} color={COLORS.purple} />
                <Text className="text-white text-base ml-3" style={{ fontFamily: 'DMSans_500Medium' }}>
                  Mode sombre
                </Text>
              </View>
              <Switch
                testID="dark-mode-toggle"
                value={darkMode}
                onValueChange={(v) => { hapticLight(); setDarkMode(v) }}
                trackColor={{ false: COLORS.gray[700], true: COLORS.cyan + '40' }}
                thumbColor={darkMode ? COLORS.cyan : COLORS.gray[400]}
              />
            </View>
          </View>
        </View>

        {/* Notifications */}
        <View className="px-5 mb-6">
          <Text className="text-gray-400 text-xs uppercase mb-3 tracking-wider" style={{ fontFamily: 'DMSans_700Bold' }}>
            Notifications
          </Text>
          <View className="bg-white/5 rounded-xl border border-white/[0.06] overflow-hidden">
            <View className="flex-row items-center justify-between p-4">
              <View className="flex-row items-center">
                <Ionicons name="notifications" size={18} color={COLORS.cyan} />
                <Text className="text-white text-base ml-3" style={{ fontFamily: 'DMSans_500Medium' }}>
                  Notifications push
                </Text>
              </View>
              <Switch
                testID="push-toggle"
                value={pushEnabled}
                onValueChange={(v) => { hapticLight(); setPushEnabled(v) }}
                trackColor={{ false: COLORS.gray[700], true: COLORS.cyan + '40' }}
                thumbColor={pushEnabled ? COLORS.cyan : COLORS.gray[400]}
              />
            </View>
          </View>
        </View>

        {/* Language */}
        <View className="px-5 mb-6">
          <Text className="text-gray-400 text-xs uppercase mb-3 tracking-wider" style={{ fontFamily: 'DMSans_700Bold' }}>
            Langue
          </Text>
          <TouchableOpacity
            testID="lang-selector"
            onPress={() => { hapticLight(); setShowLangs(!showLangs) }}
            className="bg-white/5 rounded-xl border border-white/[0.06] p-4 flex-row items-center justify-between"
          >
            <View className="flex-row items-center">
              <Ionicons name="language" size={18} color={COLORS.gold} />
              <Text className="text-white text-base ml-3" style={{ fontFamily: 'DMSans_500Medium' }}>
                {LANGUAGES.find((l) => l.code === selectedLang)?.label ?? 'Francais'}
              </Text>
            </View>
            <Ionicons name={showLangs ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.gray[400]} />
          </TouchableOpacity>
          {showLangs && (
            <View className="bg-white/5 rounded-xl border border-white/[0.06] mt-2 overflow-hidden">
              {LANGUAGES.map((lang) => (
                <TouchableOpacity
                  key={lang.code}
                  testID={`lang-${lang.code}`}
                  onPress={() => { hapticLight(); setSelectedLang(lang.code); setShowLangs(false) }}
                  className={`flex-row items-center justify-between p-4 border-b border-white/[0.04] ${
                    selectedLang === lang.code ? 'bg-cyan/5' : ''
                  }`}
                >
                  <Text
                    className="text-base"
                    style={{
                      fontFamily: 'DMSans_500Medium',
                      color: selectedLang === lang.code ? COLORS.cyan : '#fff',
                    }}
                  >
                    {lang.label}
                  </Text>
                  {selectedLang === lang.code && (
                    <Ionicons name="checkmark" size={18} color={COLORS.cyan} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* About */}
        <View className="px-5">
          <Text className="text-gray-400 text-xs uppercase mb-3 tracking-wider" style={{ fontFamily: 'DMSans_700Bold' }}>
            A propos
          </Text>
          <View className="bg-white/5 rounded-xl border border-white/[0.06] overflow-hidden">
            {[
              { label: 'Version', value: '1.0.0' },
              { label: 'Mentions legales', route: 'https://akasha.purama.dev/mentions-legales' },
              { label: 'Confidentialite', route: 'https://akasha.purama.dev/politique-confidentialite' },
              { label: 'CGU', route: 'https://akasha.purama.dev/cgu' },
            ].map((item, i) => (
              <View key={item.label} className={`flex-row items-center justify-between p-4 ${i < 3 ? 'border-b border-white/[0.04]' : ''}`}>
                <Text className="text-white text-base" style={{ fontFamily: 'DMSans_500Medium' }}>
                  {item.label}
                </Text>
                <Text className="text-gray-500 text-sm" style={{ fontFamily: 'DMSans_400Regular' }}>
                  {item.value ?? ''}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
