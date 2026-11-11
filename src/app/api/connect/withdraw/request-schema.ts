import { z } from 'zod';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const bodySchema = z.object({
  amount_eur: z
    .number()
    .positive('Le montant doit être positif')
    .max(100_000, 'Montant maximum par retrait : 100 000€')
    .optional(),
  idempotency_key: z.string().regex(uuidRegex, 'Clé invalide'),
});
