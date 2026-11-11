import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'akasha_ai' } }
)

export async function GET() {
  const supabaseAuth = await createServerSupabaseClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Non authentifie' }, { status: 401 })
  }
  const userId = user.id

  const { data: wallet } = await supabase.from('wallets').select('*').eq('user_id', userId).single()

  const [{ data: transactions }, { data: withdrawals }] = await Promise.all([
    wallet
      ? supabase.from('wallet_transactions').select('*').eq('wallet_id', wallet.id).order('created_at', { ascending: false }).limit(50)
      : Promise.resolve({ data: [] as unknown[] }),
    supabase.from('withdrawals').select('*').eq('user_id', userId).order('requested_at', { ascending: false }),
  ])

  return NextResponse.json({
    balance: wallet?.balance ?? 0,
    total_earned: wallet?.total_earned ?? 0,
    transactions: transactions ?? [],
    withdrawals: withdrawals ?? [],
  })
}

export async function POST(request: NextRequest) {
  try {
    const supabaseAuth = await createServerSupabaseClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 })
    }
    const user_id = user.id

    const { amount, iban } = await request.json()
    if (!amount || !iban) {
      return NextResponse.json({ error: 'Parametres manquants' }, { status: 400 })
    }

    if (amount < 5) {
      return NextResponse.json({ error: 'Montant minimum : 5 EUR' }, { status: 400 })
    }

    // Check balance
    const { data: wallet } = await supabase.from('wallets').select('balance').eq('user_id', user_id).single()
    if (!wallet || Number(wallet.balance) < amount) {
      return NextResponse.json({ error: 'Solde insuffisant' }, { status: 400 })
    }

    // Create withdrawal
    const { error } = await supabase.from('withdrawals').insert({
      user_id,
      amount,
      iban,
      status: 'pending',
    })

    if (error) {
      return NextResponse.json({ error: 'Erreur lors de la demande' }, { status: 500 })
    }

    // Debit wallet
    await supabase.from('wallets').update({
      balance: Number(wallet.balance) - amount,
    }).eq('user_id', user_id)

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Requete invalide' }, { status: 400 })
  }
}
