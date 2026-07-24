import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { COLORS } from '@/lib/constants'
import { Platform } from 'react-native'

type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

const TAB_ITEMS: { name: string; title: string; icon: IoniconsName; iconFocused: IoniconsName }[] = [
  { name: 'home', title: 'Accueil', icon: 'home-outline', iconFocused: 'home' },
  { name: 'chat', title: 'Chat', icon: 'chatbubble-outline', iconFocused: 'chatbubble' },
  { name: 'studio', title: 'Studio', icon: 'color-palette-outline', iconFocused: 'color-palette' },
  { name: 'tools', title: 'Outils', icon: 'grid-outline', iconFocused: 'grid' },
  { name: 'profile', title: 'Profil', icon: 'person-outline', iconFocused: 'person' },
]

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.void,
          borderTopColor: 'rgba(255,255,255,0.06)',
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingBottom: Platform.OS === 'ios' ? 28 : 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: COLORS.cyan,
        tabBarInactiveTintColor: COLORS.gray[500],
        tabBarLabelStyle: {
          fontFamily: 'DMSans_500Medium',
          fontSize: 11,
        },
      }}
    >
      {TAB_ITEMS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons name={focused ? tab.iconFocused : tab.icon} size={size} color={color} />
            ),
          }}
        />
      ))}
      <Tabs.Screen name="agents" options={{ href: null }} />
      <Tabs.Screen name="marketplace" options={{ href: null }} />
      <Tabs.Screen name="wallet" options={{ href: null }} />
      <Tabs.Screen name="referral" options={{ href: null }} />
      <Tabs.Screen name="achievements" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="daily-gift" options={{ href: null }} />
      <Tabs.Screen name="pricing" options={{ href: null }} />
    </Tabs>
  )
}
