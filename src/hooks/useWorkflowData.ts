import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAsyncResource } from './useAsyncResource'
import type { Workflow, WorkflowStep } from '@/types/automation'

export function useWorkflowData() {
  const { user } = useAuth()
  const userId = user?.id
  const [supabase] = useState(createClient)
  const load = useCallback(async (signal: AbortSignal): Promise<Workflow[]> => {
    const { data, error } = await supabase.from('workflows').select('*')
      .eq('user_id', userId!).order('created_at', { ascending: false }).abortSignal(signal)
    if (error) throw new Error('Impossible de charger les workflows.')
    return ((data ?? []) as Array<Omit<Workflow, 'steps'> & { steps: unknown }>).map(workflow => ({
      ...workflow, steps: Array.isArray(workflow.steps) ? workflow.steps as WorkflowStep[] : [],
    }))
  }, [userId, supabase])
  const resource = useAsyncResource(userId ?? null, load, [] as Workflow[])
  const { isCurrent, refetch } = resource
  const mutate = async (operation: () => PromiseLike<{ error: unknown }>, success: string, failure: string) => {
    if (!userId || !isCurrent()) return false
    try {
      const { error } = await operation()
      if (!isCurrent()) return false
      if (error) throw new Error(failure)
      toast.success(success)
      await refetch()
      return isCurrent()
    } catch {
      if (isCurrent()) toast.error(failure)
      return false
    }
  }
  const createWorkflow = async (name: string): Promise<boolean> => {
    if (!name.trim()) return false
    return mutate(() => supabase.from('workflows').insert({
      user_id: userId, name: name.trim(), status: 'draft', steps: [],
    }), 'Workflow cree !', 'Erreur lors de la creation')
  }
  const createFromTemplate = async (templateId: string, templateName: string, templateSteps: string): Promise<boolean> => {
    if (!userId) { toast.error('Connecte-toi pour utiliser ce modele'); return false }
    return mutate(() => supabase.from('workflows').insert({
      user_id: userId, name: templateName, status: 'draft',
      steps: [{ type: 'template', template_id: templateId, description: templateSteps }],
    }), 'Workflow "' + templateName + '" cree ! Retrouve-le dans "Mes workflows".', 'Erreur lors de la creation')
  }
  const updateWorkflow = (id: string, name: string, steps: WorkflowStep[]) =>
    mutate(() => supabase.from('workflows').update({ name, steps }).eq('id', id).eq('user_id', userId!),
      'Workflow sauvegarde', 'Erreur sauvegarde')
  const deleteWorkflow = (id: string) =>
    mutate(() => supabase.from('workflows').delete().eq('id', id).eq('user_id', userId!),
      'Workflow supprime', 'Erreur suppression')
  const toggleWorkflowStatus = async (workflow: Workflow): Promise<void> => {
    const status = workflow.status === 'active' ? 'paused' : 'active'
    await mutate(() => supabase.from('workflows').update({ status }).eq('id', workflow.id).eq('user_id', userId!),
      status === 'active' ? 'Workflow active' : 'Workflow mis en pause', 'Erreur')
  }
  return { workflows: resource.data, loading: resource.loading, error: resource.error, createWorkflow, createFromTemplate, updateWorkflow, deleteWorkflow, toggleWorkflowStatus }
}
