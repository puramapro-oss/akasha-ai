// =============================================================================
// AKASHA AI — INSEE Sirene API (V7.1 §36.1)
// Vérification SIRET live via api.insee.fr V3.11.
// 1 clé API couvre toutes les apps Purama (portail-api.insee.fr).
// =============================================================================

export interface SiretVerificationResult {
  valid: boolean;
  siret: string;
  siren: string | null;
  denomination: string | null;
  naf_code: string | null;
  naf_label: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  active: boolean;
  creation_date: string | null;
  last_update: string | null;
  error?: string;
}

const INSEE_BASE = 'https://api.insee.fr/entreprises/sirene/V3.11';

/** Valide le format SIRET : 14 chiffres + algo Luhn. */
export function isValidSiretFormat(input: string): boolean {
  const digits = input.replace(/\s/g, '');
  if (!/^\d{14}$/.test(digits)) return false;

  // Algorithme Luhn adapté SIRET
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let n = Number(digits[i]);
    // Position paire (0-indexed) = multiplier par 2
    if (i % 2 === 0) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

/**
 * Vérifie un SIRET auprès de l'INSEE Sirene API V3.11.
 * Retourne un résultat structuré — ne throw jamais, renvoie valid=false sur erreur.
 */
export async function verifySiret(
  siretRaw: string,
): Promise<SiretVerificationResult> {
  const siret = siretRaw.replace(/\s/g, '');

  const empty: SiretVerificationResult = {
    valid: false,
    siret,
    siren: null,
    denomination: null,
    naf_code: null,
    naf_label: null,
    address: null,
    city: null,
    postal_code: null,
    active: false,
    creation_date: null,
    last_update: null,
  };

  if (!isValidSiretFormat(siret)) {
    return { ...empty, error: 'Format SIRET invalide (14 chiffres + Luhn)' };
  }

  const apiKey = process.env.INSEE_API_KEY;
  if (!apiKey) {
    return { ...empty, error: 'INSEE_API_KEY manquante côté serveur' };
  }

  try {
    const res = await fetch(`${INSEE_BASE}/siret/${siret}`, {
      method: 'GET',
      headers: {
        'X-INSEE-Api-Key-Integration': apiKey,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (res.status === 404) {
      return { ...empty, error: 'SIRET introuvable chez INSEE' };
    }

    if (!res.ok) {
      return {
        ...empty,
        error: `INSEE API erreur ${res.status}`,
      };
    }

    const body = (await res.json()) as {
      etablissement?: {
        siret?: string;
        siren?: string;
        dateCreationEtablissement?: string;
        dateDernierTraitementEtablissement?: string;
        etatAdministratifEtablissement?: string;
        uniteLegale?: {
          denominationUniteLegale?: string | null;
          prenomUsuelUniteLegale?: string | null;
          nomUniteLegale?: string | null;
          activitePrincipaleUniteLegale?: string | null;
          etatAdministratifUniteLegale?: string;
        };
        periodesEtablissement?: Array<{
          activitePrincipaleEtablissement?: string;
          etatAdministratifEtablissement?: string;
        }>;
        adresseEtablissement?: {
          numeroVoieEtablissement?: string | null;
          typeVoieEtablissement?: string | null;
          libelleVoieEtablissement?: string | null;
          codePostalEtablissement?: string | null;
          libelleCommuneEtablissement?: string | null;
        };
      };
    };

    const etab = body.etablissement;
    if (!etab) {
      return { ...empty, error: 'Réponse INSEE malformée (pas d\'etablissement)' };
    }

    const uniteLegale = etab.uniteLegale ?? {};
    const adresse = etab.adresseEtablissement ?? {};
    const periode = etab.periodesEtablissement?.[0];

    const denomination =
      uniteLegale.denominationUniteLegale ??
      [uniteLegale.prenomUsuelUniteLegale, uniteLegale.nomUniteLegale]
        .filter(Boolean)
        .join(' ') ??
      null;

    const address = [
      adresse.numeroVoieEtablissement,
      adresse.typeVoieEtablissement,
      adresse.libelleVoieEtablissement,
    ]
      .filter(Boolean)
      .join(' ') || null;

    const nafCode =
      periode?.activitePrincipaleEtablissement ??
      uniteLegale.activitePrincipaleUniteLegale ??
      null;

    const active =
      (periode?.etatAdministratifEtablissement ??
        etab.etatAdministratifEtablissement ??
        'A') === 'A';

    return {
      valid: true,
      siret: etab.siret ?? siret,
      siren: etab.siren ?? null,
      denomination: denomination?.trim() || null,
      naf_code: nafCode,
      naf_label: null, // INSEE V3.11 ne renvoie pas le libellé NAF, à enrichir via table NAF si besoin
      address,
      city: adresse.libelleCommuneEtablissement ?? null,
      postal_code: adresse.codePostalEtablissement ?? null,
      active,
      creation_date: etab.dateCreationEtablissement ?? null,
      last_update: etab.dateDernierTraitementEtablissement ?? null,
    };
  } catch (e) {
    return {
      ...empty,
      error: e instanceof Error ? e.message : 'Erreur réseau INSEE',
    };
  }
}
