// Generates the current referral URL's QR code; obsolete generations are ignored.
import { useCallback } from 'react'
import QRCode from 'qrcode'
import { useAsyncResource } from '@/hooks/useAsyncResource'

export function useQRCode(url: string) {
  const load = useCallback(async () => QRCode.toDataURL(url, {
    margin: 1, width: 280, color: { dark: '#ffffff', light: '#00000000' },
  }), [url])
  const resource = useAsyncResource<string | null>(url || null, load, null)
  return resource.data
}
