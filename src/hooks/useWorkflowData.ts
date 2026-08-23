import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Workflow, WorkflowStep } from '@/types/automation'

export function useWorkflowData() {
  const { user } = useAuth()
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  const fetchWorkflows = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data, error } = await supabase
      .from('workflows')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (!error && data) {
      setWorkflows(
        (
          data as {
            id: string
            name: string
            status: Workflow['status']
            last_run: string | null
            created_at: string
            steps: unknown
          }[]
        ).map((w) => ({
          ...w,
          steps: Array.isArray(w.steps) ? (w.steps as WorkflowStep[]) : [],
        }))
      )
    }
    setLoading(false)
  }, [user, supabase])

  useEffect(() => {
    fetchWorkflows()
  }, [fetchWorkflows])

  const createWorkflow = async (name: string): Promise<boolean> => {
    if (!user || !name.trim()) return false
    const { error } = await supabase.from('workflows').insert({
      user_id: user.id,
      name: name.trim(),
      status: 'draft',
      steps: [],
    })
    if (error) {
      toast.error('Erreur lors de la creation')
      return false
    }
    toast.success('Workflow cree !')
    fetchWorkflows()
    return true
  }

  const createFromTemplate = async (templateId: string, templateName: string, templateSteps: string): Promise<boolean> => {
    if (!user) {
      toast.error('Connecte-toi pour utiliser ce modele')
      return false
    }
    const { error } = await supabase.from('workflows').insert({
      user_id: user.id,
      name: templateName,
      status: 'draft',
      steps: [{ type: 'template', template_id: templateId, description: templateSteps }],
    })
    if (error) {
      toast.error('Erreur lors de la creation')
      return false
    }
    toast.success(`Workflow "${templateName}" cree ! Retrouve-le dans "Mes workflows".`)
    fetchWorkflows()
    return true
  }

  const updateWorkflow = async (id: string, name: string, steps: WorkflowStep[]): Promise<boolean> => {
    const { error } = await supabase.from('workflows').update({ name, steps }).eq('id', id)
    if (error) {
      toast.error('Erreur sauvegarde')
      return false
    }
    toast.success('Workflow sauvegarde')
    fetchWorkflows()
    return true
  }

  const deleteWorkflow = async (id: string): Promise<boolean> => {
    const { error } = await supabase.from('workflows').delete().eq('id', id)
    if (error) {
      toast.error('Erreur suppression')
      return false
    }
    toast.success('Workflow supprime')
    fetchWorkflows()
    return true
  }

  const toggleWorkflowStatus = async (workflow: Workflow): Promise<void> => {
    const newStatus = workflow.status === 'active' ? 'paused' : 'active'
    const { error } = await supabase.from('workflows').update({ status: newStatus }).eq('id', workflow.id)
    if (error) {
      toast.error('Erreur')
      return
    }
    toast.success(newStatus === 'active' ? 'Workflow active' : 'Workflow mis en pause')
    fetchWorkflows()
  }

  return {
    workflows,
    loading,
    createWorkflow,
    createFromTemplate,
    updateWorkflow,
    deleteWorkflow,
    toggleWorkflowStatus,
  }
}
