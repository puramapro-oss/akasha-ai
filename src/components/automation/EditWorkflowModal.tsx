import { useState } from 'react'
import { Settings, X, Trash2, ArrowDown } from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { STEP_TYPES } from '@/lib/automation-constants'
import type { Workflow, WorkflowStep } from '@/types/automation'

interface EditWorkflowModalProps {
  workflow: Workflow
  onClose: () => void
  onSave: (id: string, name: string, steps: WorkflowStep[]) => Promise<boolean>
  onDelete: (id: string) => Promise<boolean>
}

export default function EditWorkflowModal({
  workflow: initial,
  onClose,
  onSave,
  onDelete,
}: EditWorkflowModalProps) {
  const [editing, setEditing] = useState<Workflow>(initial)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    const success = await onSave(editing.id, editing.name, editing.steps)
    setSaving(false)
    if (success) onClose()
  }

  const handleDelete = async () => {
    await onDelete(editing.id)
    onClose()
  }

  const addStep = (type: WorkflowStep['type'], label: string) => {
    const newStep: WorkflowStep = {
      id: `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type,
      label,
      config: {},
    }
    setEditing({ ...editing, steps: [...editing.steps, newStep] })
  }

  const updateStep = (idx: number, updates: Partial<WorkflowStep>) => {
    const next = [...editing.steps]
    next[idx] = { ...next[idx], ...updates }
    setEditing({ ...editing, steps: next })
  }

  const removeStep = (idx: number) => {
    const next = editing.steps.filter((_, i) => i !== idx)
    setEditing({ ...editing, steps: next })
  }

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      data-testid="workflow-editor"
    >
      <Card className="w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-[var(--cyan)]" />
            <h2 className="text-lg font-bold text-[var(--text-primary)]">Editeur de workflow</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Nom</label>
            <input
              type="text"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              className="w-full rounded-xl border border-[var(--border)] bg-white/5 px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--cyan)] focus:outline-none"
              data-testid="editor-name-input"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-[var(--text-secondary)]">
                Etapes ({editing.steps.length})
              </label>
            </div>
            <div className="flex flex-col gap-2">
              {editing.steps.length === 0 && (
                <p className="rounded-xl border border-dashed border-[var(--border)] py-6 text-center text-xs text-[var(--text-muted)]">
                  Aucune etape — ajoute-en une ci-dessous
                </p>
              )}
              {editing.steps.map((step, idx) => {
                const def = STEP_TYPES.find((t) => t.type === step.type)
                return (
                  <div
                    key={step.id}
                    className="rounded-xl border border-[var(--border)] bg-white/5 p-3"
                    data-testid={`step-${idx}`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-xl">{def?.icon ?? '⚙️'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                          {def?.label ?? step.type}
                        </p>
                        <input
                          type="text"
                          value={step.label}
                          onChange={(e) => updateStep(idx, { label: e.target.value })}
                          placeholder="Description de l'etape"
                          className="mt-1 w-full bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
                        />
                        {step.type === 'ai' && (
                          <textarea
                            value={step.config.prompt ?? ''}
                            onChange={(e) =>
                              updateStep(idx, { config: { ...step.config, prompt: e.target.value } })
                            }
                            placeholder="Prompt envoye a AKASHA"
                            rows={2}
                            className="mt-2 w-full resize-none rounded-lg border border-[var(--border)] bg-black/20 px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--cyan)]"
                          />
                        )}
                        {step.type === 'http' && (
                          <input
                            type="url"
                            value={step.config.url ?? ''}
                            onChange={(e) =>
                              updateStep(idx, { config: { ...step.config, url: e.target.value } })
                            }
                            placeholder="https://api.exemple.com/endpoint"
                            className="mt-2 w-full rounded-lg border border-[var(--border)] bg-black/20 px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--cyan)]"
                          />
                        )}
                        {step.type === 'email' && (
                          <input
                            type="email"
                            value={step.config.to ?? ''}
                            onChange={(e) =>
                              updateStep(idx, { config: { ...step.config, to: e.target.value } })
                            }
                            placeholder="destinataire@email.com"
                            className="mt-2 w-full rounded-lg border border-[var(--border)] bg-black/20 px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--cyan)]"
                          />
                        )}
                        {step.type === 'delay' && (
                          <input
                            type="number"
                            min={1}
                            value={step.config.minutes ?? '5'}
                            onChange={(e) =>
                              updateStep(idx, { config: { ...step.config, minutes: e.target.value } })
                            }
                            placeholder="Minutes"
                            className="mt-2 w-32 rounded-lg border border-[var(--border)] bg-black/20 px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--cyan)]"
                          />
                        )}
                      </div>
                      <button
                        onClick={() => removeStep(idx)}
                        className="rounded-lg p-1.5 text-red-400 hover:bg-red-500/10"
                        aria-label="Supprimer l'etape"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {idx < editing.steps.length - 1 && (
                      <div className="mt-2 flex justify-center">
                        <ArrowDown className="h-3 w-3 text-[var(--text-muted)]" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="mt-3">
              <p className="mb-2 text-xs uppercase tracking-wider text-[var(--text-muted)]">
                Ajouter une etape
              </p>
              <div className="flex flex-wrap gap-2">
                {STEP_TYPES.map((t) => (
                  <button
                    key={t.type}
                    onClick={() => addStep(t.type, t.label)}
                    className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white/5 px-3 py-1.5 text-xs text-[var(--text-primary)] hover:border-[var(--cyan)] hover:bg-[var(--cyan)]/10"
                    data-testid={`add-step-${t.type}`}
                  >
                    <span>{t.icon}</span>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-[var(--border)] pt-4">
            <Button
              variant="danger"
              size="sm"
              onClick={handleDelete}
              icon={<Trash2 className="h-3.5 w-3.5" />}
              data-testid="delete-workflow-btn"
            >
              Supprimer
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>
                Annuler
              </Button>
              <Button onClick={handleSave} loading={saving} data-testid="save-workflow-btn">
                Sauvegarder
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
