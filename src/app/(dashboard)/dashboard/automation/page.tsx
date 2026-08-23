'use client'

import { useState } from 'react'
import { Zap, Plus } from 'lucide-react'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import Skeleton from '@/components/ui/Skeleton'
import { useWorkflowData } from '@/hooks/useWorkflowData'
import { TEMPLATES } from '@/lib/automation-constants'
import WorkflowCard from '@/components/automation/WorkflowCard'
import WorkflowTemplateCard from '@/components/automation/WorkflowTemplateCard'
import CreateWorkflowModal from '@/components/automation/CreateWorkflowModal'
import EditWorkflowModal from '@/components/automation/EditWorkflowModal'
import type { Workflow } from '@/types/automation'

export default function AutomationPage() {
  const {
    workflows,
    loading,
    createWorkflow,
    createFromTemplate,
    updateWorkflow,
    deleteWorkflow,
    toggleWorkflowStatus,
  } = useWorkflowData()

  const [activeTab, setActiveTab] = useState<'my' | 'templates'>('my')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editing, setEditing] = useState<Workflow | null>(null)

  return (
    <div className="flex flex-col gap-6" data-testid="automation-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] font-[family-name:var(--font-display)]">
            Automatisation
          </h1>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
            Automatise tes taches repetitives avec des workflows IA
          </p>
        </div>
        <Button
          icon={<Plus className="h-4 w-4" />}
          onClick={() => setShowCreateModal(true)}
          data-testid="new-workflow-btn"
        >
          Nouveau workflow
        </Button>
      </div>

      <div className="flex gap-1 rounded-xl bg-white/5 p-1 w-fit">
        {(['my', 'Mes workflows'] as const as [typeof activeTab, string]).concat([
          'templates' as const,
          'Templates',
        ] as unknown as any)}
        {([
          ['my', 'Mes workflows'],
          ['templates', 'Templates'],
        ] as const).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            data-testid={`tab-${tab}`}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              activeTab === tab
                ? 'bg-[var(--cyan)] text-black shadow'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'my' && (
        <div data-testid="my-workflows-tab">
          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-36 rounded-2xl" />
              ))}
            </div>
          ) : workflows.length === 0 ? (
            <EmptyState
              icon={<Zap className="h-10 w-10" />}
              title="Aucun workflow"
              description="Cree ton premier workflow ou utilise un template pour commencer."
              action={
                <Button onClick={() => setShowCreateModal(true)} icon={<Plus className="h-4 w-4" />}>
                  Creer un workflow
                </Button>
              }
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {workflows.map((w) => (
                <WorkflowCard
                  key={w.id}
                  workflow={w}
                  onToggleStatus={toggleWorkflowStatus}
                  onEdit={setEditing}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'templates' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="templates-tab">
          {TEMPLATES.map((t) => (
            <WorkflowTemplateCard
              key={t.id}
              template={t}
              onUse={async (template) => {
                const success = await createFromTemplate(template.id, template.name, template.steps)
                if (success) setActiveTab('my')
              }}
            />
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateWorkflowModal onClose={() => setShowCreateModal(false)} onCreate={createWorkflow} />
      )}

      {editing && (
        <EditWorkflowModal
          workflow={editing}
          onClose={() => setEditing(null)}
          onSave={updateWorkflow}
          onDelete={deleteWorkflow}
        />
      )}
    </div>
  )
}
