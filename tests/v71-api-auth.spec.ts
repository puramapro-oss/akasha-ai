/**
 * AKASHA AI — Tests E2E V7.1/V4.1
 * Auth-guards + méthodes HTTP des nouvelles routes API.
 * Cible : URL Playwright baseURL (prod ou preview).
 */

import { test, expect } from '@playwright/test';

test.describe('V4.1 — Stripe Connect API auth-guards', () => {
  test('POST /api/connect/onboard sans auth → 401 FR', async ({ request }) => {
    const r = await request.post('/api/connect/onboard');
    expect(r.status()).toBe(401);
    const body = await r.json();
    expect(body.error).toMatch(/non autorisé/i);
  });

  test('GET /api/connect/onboard → 405', async ({ request }) => {
    const r = await request.get('/api/connect/onboard');
    expect(r.status()).toBe(405);
  });

  test('POST /api/connect/account-session sans auth → 401 FR', async ({ request }) => {
    const r = await request.post('/api/connect/account-session');
    expect(r.status()).toBe(401);
  });

  test('GET /api/connect/account-session → 405', async ({ request }) => {
    const r = await request.get('/api/connect/account-session');
    expect(r.status()).toBe(405);
  });

  test('GET /api/connect/status sans auth → 401 FR', async ({ request }) => {
    const r = await request.get('/api/connect/status');
    expect(r.status()).toBe(401);
  });

  test('POST /api/connect/status → 405', async ({ request }) => {
    const r = await request.post('/api/connect/status');
    expect(r.status()).toBe(405);
  });
});

test.describe('V4.1 — Withdrawals API auth-guards', () => {
  test('POST /api/connect/withdraw sans auth → 401 FR', async ({ request }) => {
    const r = await request.post('/api/connect/withdraw');
    expect(r.status()).toBe(401);
    const body = await r.json();
    expect(body.error).toMatch(/non autorisé/i);
  });

  test('GET/PUT/DELETE /api/connect/withdraw → 405', async ({ request }) => {
    for (const method of ['get', 'put', 'delete'] as const) {
      const r = await request[method]('/api/connect/withdraw');
      expect(r.status()).toBe(405);
    }
  });

  test('POST avec amount négatif sans auth → 401 (auth first)', async ({ request }) => {
    const r = await request.post('/api/connect/withdraw', {
      data: { amount_eur: -50 },
    });
    expect(r.status()).toBe(401);
  });

  test('GET /api/wallet/balance sans auth → 401 FR', async ({ request }) => {
    const r = await request.get('/api/wallet/balance');
    expect(r.status()).toBe(401);
  });

  test('POST /api/wallet/balance → 405', async ({ request }) => {
    const r = await request.post('/api/wallet/balance');
    expect(r.status()).toBe(405);
  });
});

test.describe('V7.1 — INSEE SIRET API', () => {
  test('POST /api/insee/verify sans auth → 401 FR', async ({ request }) => {
    const r = await request.post('/api/insee/verify', {
      data: { siret: '73282932000074' },
    });
    expect(r.status()).toBe(401);
  });

  test('GET /api/insee/verify → 405', async ({ request }) => {
    const r = await request.get('/api/insee/verify');
    expect(r.status()).toBe(405);
  });
});

test.describe('V4.1 — Pages /compte/* auth redirect', () => {
  const paths = [
    '/compte/connect',
    '/compte/configuration',
    '/compte/gestion',
    '/compte/virements',
    '/compte/paiements',
    '/compte/soldes',
    '/compte/documents',
    '/compte/notifications',
  ];

  for (const path of paths) {
    test(`${path} non-auth → redirect /login?next=${path}`, async ({ request }) => {
      const r = await request.get(path, { maxRedirects: 0 });
      expect(r.status()).toBe(307);
      const location = r.headers()['location'] ?? '';
      expect(location).toContain('/login');
      expect(location).toContain(encodeURIComponent(path));
    });
  }
});
