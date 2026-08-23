'use client';

import { useCallback, useEffect, useState } from 'react';

export interface CookieConsent {
  necessaire: true;
  mesure: boolean;
  marketing: boolean;
  updatedAt: string;
}

const STORAGE_KEY = 'purama_cookie_consent_v1';

function readStoredConsent(): CookieConsent | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CookieConsent;
  } catch {
    return null;
  }
}

/**
 * Consentement cookies fonctionnel (RGPD/ePrivacy) : persisté en localStorage (fonctionne
 * pour un visiteur anonyme, avant toute connexion) et, si `onConsent` est fourni par l'app,
 * synchronisé en base via `POST /api/legal/cookie-consent` (cf `api/cookie-consent.ts`) une
 * fois l'utilisateur authentifié — pour garder une preuve du consentement indépendante du
 * navigateur de l'utilisateur.
 */
export function useCookieConsent(onConsent?: (consent: CookieConsent) => void) {
  const [consent, setConsent] = useState<CookieConsent | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setConsent(readStoredConsent());
    setHydrated(true);
  }, []);

  const save = useCallback(
    (mesure: boolean, marketing: boolean) => {
      const next: CookieConsent = { necessaire: true, mesure, marketing, updatedAt: new Date().toISOString() };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setConsent(next);
      onConsent?.(next);
    },
    [onConsent]
  );

  const acceptAll = useCallback(() => save(true, true), [save]);
  const refuseAll = useCallback(() => save(false, false), [save]);

  return {
    /** null tant que la préférence n'est pas connue OU pas encore hydratée côté client. */
    consent,
    /** true une fois le rendu client effectué — évite un flash SSR/CSR incohérent. */
    hydrated,
    /** true si le bandeau doit être affiché (aucun choix enregistré). */
    needsChoice: hydrated && consent === null,
    acceptAll,
    refuseAll,
    save,
  };
}
