import { Clock, Pause, Play, ChevronRight } from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { formatDate } from '@/lib/utils'
import { STATUS_CONFIG } from '@/lib/automation-constants'
import type { Workflow } from '@/types/automation'

interface WorkflowCardProps {
  workflow: Workflow
  onToggleStatus: (workflow: Workflow) => void
  onEdit: (workflow: Workflow) => void
}

export default function WorkflowCard({ workflow, onToggleStatus, onEdit }: WorkflowCardProps) {
  const status = STATUS_CONFIG[workflow.status] ?? STATUS_CONFIG.draft

  return (
    <Card
      key={workflow.id}
      className="flex flex-col gap-4 p-5"
      data-testid={`workflow-card-${workflow.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className={`h-2.5 w-2.5 rounded-full ${status.dot} shadow-[0_0_6px_currentColor]`}
          />
          <p className="font-semibold text-[var(--text-primary)] truncate">{workflow.name}</p>
        </div>
        <Badge variant={status.color}>{status.label}</Badge>
      </div>

      {workflow.last_run && (
        <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
          <Clock className="h-3.5 w-3.5" />
          Derniere exec. {formatDate(workflow.last_run)}
        </div>
      )}

      <div className="flex gap-2 mt-auto">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onToggleStatus(workflow)}
          icon={
            workflow.status === 'active' ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )
          }
          data-testid={`toggle-workflow-${workflow.id}`}
        >
          {workflow.status === 'active' ? 'Pause' : 'Activer'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onEdit(workflow)}
          icon={<ChevronRight className="h-3.5 w-3.5" />}
          data-testid={`edit-workflow-${workflow.id}`}
        >
          Editer
        </Button>
      </div>
    </Card>
  )
}
