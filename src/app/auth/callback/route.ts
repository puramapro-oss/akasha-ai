import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// `next` vient de la query string : new URL('//evil.com', origin) résout vers un autre host
// (protocole-relatif) — on rejette tout ce qui ne reste pas sur l'origine de cette app.
function safeRedirectUrl(next: string, origin: string): URL {
  try {
    const target = new URL(next, origin)
    if (target.origin !== origin) return new URL('/dashboard', origin)
    return target
  } catch {
    return new URL('/dashboard', origin)
  }
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createServerSupabaseClient()

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(safeRedirectUrl(next, origin))
    }
  }

  return NextResponse.redirect(new URL('/login?error=auth_failed', origin))
}
