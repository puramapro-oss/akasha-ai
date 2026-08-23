import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import type { TEMPLATES } from '@/lib/automation-constants'

type Template = (typeof TEMPLATES)[number]

interface WorkflowTemplateCardProps {
  template: Template
  onUse: (template: Template) => void
}

export default function WorkflowTemplateCard({ template, onUse }: WorkflowTemplateCardProps) {
  return (
    <Card
      key={template.id}
      className="flex flex-col gap-4 p-5"
      data-testid={`template-card-${template.id}`}
    >
      <div className="flex items-center gap-3">
        <div className="text-2xl">{template.icon}</div>
        <div>
          <p className="font-semibold text-[var(--text-primary)]">{template.name}</p>
          <Badge variant={template.color} className="mt-0.5">
            {template.steps}
          </Badge>
        </div>
      </div>
      <p className="text-sm text-[var(--text-secondary)]">{template.description}</p>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => onUse(template)}
        data-testid={`use-template-${template.id}`}
        className="mt-auto w-full"
      >
        Utiliser ce modele
      </Button>
    </Card>
  )
}
