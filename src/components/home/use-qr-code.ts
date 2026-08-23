// =============================================================================
// AKASHA AI — useQRCode Hook
// Génère le QR code du lien de parrainage
// =============================================================================

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function useQRCode(url: string) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!url) {
      setDataUrl(null);
      return;
    }

    QRCode
      .toDataURL(url, {
        margin: 1,
        width: 280,
        color: { dark: '#ffffff', light: '#00000000' },
      })
      .then(setDataUrl)
      .catch(() => setDataUrl(null));
  }, [url]);

  return dataUrl;
}
