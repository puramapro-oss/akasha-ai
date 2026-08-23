export interface WorkflowStep {
  id: string
  type: 'trigger' | 'ai' | 'http' | 'email' | 'delay' | 'condition'
  label: string
  config: Record<string, string>
}

export interface Workflow {
  id: string
  name: string
  status: 'active' | 'paused' | 'error' | 'draft'
  last_run: string | null
  created_at: string
  steps: WorkflowStep[]
}

export type WorkflowStatus = Workflow['status']
export type StepType = WorkflowStep['type']
