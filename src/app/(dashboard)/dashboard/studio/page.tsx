'use client'

import { useState } from 'react'
import { TabPill } from '@/components/studio/StudioUtils'
import ImageTab from '@/components/studio/ImageTab'
import VideoTab from '@/components/studio/VideoTab'
import AudioTab from '@/components/studio/AudioTab'
import CodeTab from '@/components/studio/CodeTab'
import { TABS, type StudioTab } from '@/components/studio/types'

export default function StudioPage() {
  const [activeTab, setActiveTab] = useState<StudioTab>('image')

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">
          Studio{' '}
          <span className="gradient-text font-[family-name:var(--font-display)]">Creatif</span>
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Genere des images, videos, audios et du code avec l&apos;IA
        </p>
      </div>

      {/* Tab navigation */}
      <div className="flex flex-wrap gap-2 rounded-2xl border border-[var(--border)] bg-white/[0.02] p-2">
        {TABS.map(tab => (
          <TabPill
            key={tab.id}
            active={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            icon={tab.icon}
            label={tab.label}
          />
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'image' && <ImageTab />}
      {activeTab === 'video' && <VideoTab />}
      {activeTab === 'audio' && <AudioTab />}
      {activeTab === 'code' && <CodeTab />}
    </div>
  )
}
