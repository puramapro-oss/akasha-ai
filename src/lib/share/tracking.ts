export interface ShareStats {
  total_shares: number
  points_earned: number
  today_shares: number
}

export async function trackShare(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  referralCode: string,
  platformId: string,
  points: number,
  platformName: string
) {
  await supabase.from('social_shares').insert({
    user_id: userId,
    share_code: referralCode,
    platform_hint: platformId,
    points_given: points,
  })

  await supabase.from('point_transactions').insert({
    user_id: userId,
    amount: points,
    type: 'partage',
    description: `Partage ${platformName} : +${points} points`,
  })
}

export function calculateSharePoints(todayShares: number): number {
  return todayShares === 0 ? 400 : 300
}
