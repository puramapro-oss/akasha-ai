/**
 * AKASHA AI — Tests unitaires computeKarmaSplit V7.1/V4.1 Axe 2
 * Répartition des abonnements décrite dans STRIPE_CONNECT_KARMA_V4.md. Fonction pure, sans I/O.
 */

import { test, expect } from '@playwright/test';
import { computeKarmaSplit } from '../src/lib/karma/split';
import { KARMA_SPLIT_RATES } from '../src/types/karma';

test.describe('computeKarmaSplit — cas nominaux', () => {
  test('abo 9,99 € (plan free→complete essentiel) → 5,00 / 0 / 3,00 / 1,99', () => {
    const b = computeKarmaSplit(999);
    expect(b.reward_eur).toBe(5.0); // 999*0.5 = 499.5 → round → 500 → 5.00
    expect(b.adya_eur).toBe(0);
    expect(b.asso_eur).toBe(3.0);
    expect(b.sasu_eur).toBe(1.99); // 999 - 500 - 300 = 199 centimes
    expect(b.total_eur).toBe(9.99);
  });

  test('abo 39 € → 19,50 / 0 / 11,70 / 7,80', () => {
    const b = computeKarmaSplit(3900);
    expect(b.reward_eur).toBe(19.5);
    expect(b.adya_eur).toBe(0);
    expect(b.asso_eur).toBe(11.7);
    expect(b.sasu_eur).toBe(7.8);
    expect(b.total_eur).toBe(39.0);
  });

  test('abo 79 € → 39,50 / 0 / 23,70 / 15,80', () => {
    const b = computeKarmaSplit(7900);
    expect(b.reward_eur).toBe(39.5);
    expect(b.adya_eur).toBe(0);
    expect(b.asso_eur).toBe(23.7);
    expect(b.sasu_eur).toBe(15.8);
    expect(b.total_eur).toBe(79.0);
  });

  test('annuel 390 € → 195 / 0 / 117 / 78', () => {
    const b = computeKarmaSplit(39000);
    expect(b.reward_eur).toBe(195);
    expect(b.adya_eur).toBe(0);
    expect(b.asso_eur).toBe(117);
    expect(b.sasu_eur).toBe(78);
    expect(b.total_eur).toBe(390);
  });
});

test.describe('computeKarmaSplit — bornes', () => {
  test('0 cent → tous zéro', () => {
    const b = computeKarmaSplit(0);
    expect(b.reward_eur).toBe(0);
    expect(b.adya_eur).toBe(0);
    expect(b.asso_eur).toBe(0);
    expect(b.sasu_eur).toBe(0);
    expect(b.total_eur).toBe(0);
  });

  test('1 cent → 1 cent aux membres après arrondi', () => {
    const b = computeKarmaSplit(1);
    expect(b.total_eur).toBe(0.01);
    expect(b.reward_eur).toBe(0.01);
    expect(b.adya_eur).toBe(0);
    expect(b.asso_eur).toBe(0);
    expect(b.sasu_eur).toBe(0);
  });

  test('100 cents → 0,50 / 0 / 0,30 / 0,20', () => {
    const b = computeKarmaSplit(100);
    expect(b.reward_eur).toBe(0.5);
    expect(b.adya_eur).toBe(0);
    expect(b.asso_eur).toBe(0.3);
    expect(b.sasu_eur).toBe(0.2);
  });

  test('100 000 € → split correct', () => {
    const b = computeKarmaSplit(10_000_000);
    expect(b.reward_eur).toBe(50_000);
    expect(b.adya_eur).toBe(0);
    expect(b.asso_eur).toBe(30_000);
    expect(b.sasu_eur).toBe(20_000);
    expect(b.total_eur).toBe(100_000);
  });
});

test.describe('computeKarmaSplit — invariants', () => {
  test('somme = total pour 1000 montants random', () => {
    for (let i = 0; i < 1000; i++) {
      const cents = Math.floor(Math.random() * 10_000_000);
      const b = computeKarmaSplit(cents);
      const sum = b.reward_eur + b.adya_eur + b.asso_eur + b.sasu_eur;
      expect(Math.round(sum * 100)).toBe(cents);
    }
  });

  test('KARMA_SPLIT_RATES somme à 1.00 pile', () => {
    const sum =
      KARMA_SPLIT_RATES.reward +
      KARMA_SPLIT_RATES.adya +
      KARMA_SPLIT_RATES.asso +
      KARMA_SPLIT_RATES.sasu;
    expect(sum).toBeCloseTo(1.0, 10);
  });
});

test.describe('computeKarmaSplit — entrées invalides', () => {
  test('négatif → throw', () => {
    expect(() => computeKarmaSplit(-100)).toThrow('amountCents must be >= 0');
  });

  test('NaN → throw', () => {
    expect(() => computeKarmaSplit(NaN)).toThrow('amountCents must be finite');
  });

  test('Infinity → throw', () => {
    expect(() => computeKarmaSplit(Infinity)).toThrow('amountCents must be finite');
  });

  test('non-entier 999.7 → arrondi à 1000', () => {
    const b = computeKarmaSplit(999.7);
    expect(b.total_eur).toBe(10.0);
  });
});
