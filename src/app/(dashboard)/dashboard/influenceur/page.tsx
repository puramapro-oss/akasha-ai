import { redirect, permanentRedirect } from 'next/navigation'

// V7 SUPREME : "Influenceur" est interdit dans l'UI. Redirection permanente vers /dashboard/ambassadeur.
export default function Page() {
  // permanentRedirect emits a 308 (permanent) in Next.js 14+
  try {
    permanentRedirect('/dashboard/ambassadeur')
  } catch {
    redirect('/dashboard/ambassadeur')
  }
}
