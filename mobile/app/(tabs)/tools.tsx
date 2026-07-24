import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, FlatList } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { COLORS } from '@/lib/constants'
import { hapticLight } from '@/lib/utils'

interface Tool {
  id: string
  name: string
  description: string
  icon: string
  category: string
  color: string
}

const TOOLS: Tool[] = [
  { id: '1', name: 'Chat IA', description: 'Conversation avancee multi-modeles', icon: 'chatbubble', category: 'Texte', color: COLORS.cyan },
  { id: '2', name: 'Generateur d\'images', description: 'Cree des images avec FLUX et Midjourney', icon: 'image', category: 'Image', color: COLORS.pink },
  { id: '3', name: 'Generateur de videos', description: 'Clips video avec Runway et LTX', icon: 'videocam', category: 'Video', color: COLORS.gold },
  { id: '4', name: 'Generateur de musique', description: 'Musique originale avec Suno', icon: 'musical-notes', category: 'Audio', color: COLORS.purple },
  { id: '5', name: 'Generateur de code', description: 'Code dans tous les langages', icon: 'code-slash', category: 'Code', color: COLORS.neon },
  { id: '6', name: 'Traducteur IA', description: 'Traduction instantanee 100+ langues', icon: 'language', category: 'Texte', color: COLORS.cyan },
  { id: '7', name: 'Resume de documents', description: 'Resume n\'importe quel document', icon: 'document-text', category: 'Texte', color: COLORS.cyan },
  { id: '8', name: 'Analyse de donnees', description: 'Insights et graphiques automatiques', icon: 'analytics', category: 'Data', color: COLORS.orange },
  { id: '9', name: 'Redacteur SEO', description: 'Contenu optimise pour Google', icon: 'search', category: 'Texte', color: COLORS.cyan },
  { id: '10', name: 'Email Writer', description: 'Emails professionnels en 1 clic', icon: 'mail', category: 'Texte', color: COLORS.cyan },
  { id: '11', name: 'Voix off IA', description: 'Narration avec ElevenLabs', icon: 'mic', category: 'Audio', color: COLORS.purple },
  { id: '12', name: 'Correcteur de texte', description: 'Grammaire et style en francais', icon: 'create', category: 'Texte', color: COLORS.cyan },
]

const CATEGORIES = ['Tous', 'Texte', 'Image', 'Video', 'Audio', 'Code', 'Data']

export default function ToolsScreen() {
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('Tous')

  const filtered = TOOLS.filter((t) => {
    const matchSearch = t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase())
    const matchCategory = selectedCategory === 'Tous' || t.category === selectedCategory
    return matchSearch && matchCategory
  })

  return (
    <SafeAreaView className="flex-1 bg-void" edges={['top']}>
      <View className="px-5 pt-4 pb-3">
        <Text className="text-white text-2xl mb-4" style={{ fontFamily: 'SpaceGrotesk_700Bold' }}>
          47 Outils IA
        </Text>
        <View className="flex-row items-center bg-white/5 border border-white/10 rounded-xl px-4">
          <Ionicons name="search" size={18} color={COLORS.gray[400]} />
          <TextInput
            testID="tools-search"
            value={search}
            onChangeText={setSearch}
            placeholder="Rechercher un outil..."
            placeholderTextColor={COLORS.gray[500]}
            className="flex-1 py-3 ml-3 text-white text-base"
            style={{ fontFamily: 'DMSans_400Regular' }}
          />
        </View>
      </View>

      <FlatList
        horizontal
        data={CATEGORIES}
        keyExtractor={(item) => item}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 12 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => { hapticLight(); setSelectedCategory(item) }}
            className={`px-4 py-2 mr-2 rounded-lg ${
              selectedCategory === item ? 'bg-cyan/20' : 'bg-white/5'
            }`}
          >
            <Text
              className="text-sm"
              style={{
                fontFamily: 'DMSans_500Medium',
                color: selectedCategory === item ? COLORS.cyan : COLORS.gray[400],
              }}
            >
              {item}
            </Text>
          </TouchableOpacity>
        )}
      />

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        columnWrapperStyle={{ gap: 12 }}
        ItemSeparatorComponent={() => <View className="h-3" />}
        renderItem={({ item }) => (
          <TouchableOpacity
            testID={`tool-${item.id}`}
            className="flex-1 bg-white/5 rounded-2xl p-4 border border-white/[0.06]"
            activeOpacity={0.7}
          >
            <View
              className="w-10 h-10 rounded-xl items-center justify-center mb-3"
              style={{ backgroundColor: item.color + '15' }}
            >
              <Ionicons name={item.icon as never} size={20} color={item.color} />
            </View>
            <Text className="text-white text-sm mb-1" style={{ fontFamily: 'DMSans_700Bold' }}>
              {item.name}
            </Text>
            <Text className="text-gray-500 text-xs" style={{ fontFamily: 'DMSans_400Regular' }} numberOfLines={2}>
              {item.description}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View className="items-center py-16">
            <Ionicons name="search" size={48} color={COLORS.gray[600]} />
            <Text className="text-gray-500 mt-4" style={{ fontFamily: 'DMSans_400Regular' }}>
              Aucun outil trouve.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  )
}
