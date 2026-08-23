'use client'

import { Copy } from 'lucide-react'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import { ENDPOINTS } from '@/lib/api/endpoints'

interface ApiDocumentationProps {
  apiKey: string | null
  onCopy: (text: string) => void
}

export default function ApiDocumentation({ apiKey, onCopy }: ApiDocumentationProps) {
  return (
    <section data-testid="api-docs">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        Documentation
      </h2>
      <div className="flex flex-col gap-4">
        {ENDPOINTS.map((ep) => {
          const keyValue = apiKey ?? 'YOUR_API_KEY'
          const curlCmd = ep.curl(keyValue)

          return (
            <Card key={ep.path} className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Badge variant="cyan">{ep.method}</Badge>
                <code className="font-mono text-sm text-[var(--text-primary)]">{ep.path}</code>
              </div>
              <p className="text-sm text-[var(--text-secondary)] mb-3">{ep.desc}</p>
              <div className="relative">
                <pre className="overflow-x-auto rounded-xl bg-white/5 p-4 text-xs font-mono text-[var(--text-secondary)] leading-relaxed">
                  <code>{curlCmd}</code>
                </pre>
                <button
                  onClick={() => onCopy(curlCmd)}
                  className="absolute right-3 top-3 rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-white/10 hover:text-[var(--text-primary)]"
                  data-testid={`copy-curl-${ep.path.replace(/\//g, '-')}`}
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </Card>
          )
        })}
      </div>
    </section>
  )
}
