import { before, after, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture } from './fixture.mjs';

let f;
before(async () => { f = await fixture('withdrawal', ['profiles'], [
  'tests/withdrawal-idempotency/fixtures/connect_withdrawals.sql',
  'supabase/migrations/20261123010100_akasha_withdrawal_idempotency.sql',
]); });
after(async () => { if (f) await f.close(); });
afterEach(async () => { if (f) await f.releaseClients(); });

const receipt = async (client, sql, values) => (await client.query(sql, values)).rows[0].receipt;
const reserve = (client, actor, key, amount = 20, cap = 50) => receipt(client,
  'SELECT public.reserve_akasha_withdrawal($1,$2,$3,$3,$4,$5,$6,$7) AS receipt',
  [actor.id, key, amount, 'acct_synthetic', 'test', {}, cap]);
const claim = (client, actor, key, token) => receipt(client,
  'SELECT public.claim_akasha_withdrawal($1,$2,$3) AS receipt', [actor.id, key, token]);
const complete = (client, actor, key, token, transfer, amount = 20, destination = 'acct_synthetic', mode = 'test') => receipt(client,
  'SELECT public.complete_akasha_withdrawal($1,$2,$3,$4,$5,$6,$7) AS receipt',
  [actor.id, key, token, transfer, amount, destination, mode]);
const reject = (client, actor, key, token) => receipt(client,
  'SELECT public.reject_akasha_withdrawal($1,$2,$3,$4) AS receipt',
  [actor.id, key, token, 'balance_insufficient']);
const cancel = (client, actor, key) => receipt(client,
  'SELECT public.cancel_akasha_withdrawal($1,$2) AS receipt', [actor.id, key]);
const cancellationCount = async actor => (await f.owner.query(
  'SELECT count(*)::int AS count FROM akasha_ai.withdrawal_cancellations WHERE user_id=$1', [actor.id])).rows[0].count;
const snapshot = async actor => (await f.owner.query(`SELECT
  (SELECT wallet_balance::text FROM akasha_ai.profiles WHERE id=$1) AS balance,
  (SELECT count(*)::int FROM akasha_ai.withdrawal_requests WHERE user_id=$1) AS requests,
  (SELECT count(*)::int FROM public.connect_withdrawals WHERE user_id=$1) AS receipts`, [actor.id])).rows[0];

// The database must witness a real blocking relationship, not just two resolved promises.
async function raceLocked(a, b, firstCall, secondCall, label) {
  await a.query('BEGIN');
  let pending;
  try {
    const first = await firstCall();
    pending = secondCall().then(value => ({ value }), error => ({ error }));
    await f.observeLock(b, a, label);
    await a.query('COMMIT');
    return [first, await pending];
  } catch (error) {
    await a.query('ROLLBACK');
    if (pending) await pending;
    throw error;
  }
}

test('service RPCs and the private journal reject anonymous and authenticated callers', async () => {
  const actor = await f.createUser(), key = randomUUID(), token = randomUUID();
  for (const role of ['anon', 'authenticated']) {
    const client = await f.connect(role, actor.id);
    await assert.rejects(reserve(client, actor, key), { code: '42501' });
    await assert.rejects(claim(client, actor, key, token), { code: '42501' });
    await assert.rejects(cancel(client, actor, key), { code: '42501' });
    await assert.rejects(client.query('SELECT public.get_akasha_withdrawal($1,$2)', [actor.id, key]), { code: '42501' });
    await assert.rejects(client.query('SELECT * FROM akasha_ai.withdrawal_requests'), { code: '42501' });
  }
  assert.deepEqual(await snapshot(actor), { balance: '100.00', requests: 0, receipts: 0 });
});

test('simultaneous reservations of the same key debit once and return the same receipt', async () => {
  const actor = await f.createUser(), key = randomUUID();
  const a = await f.connect('service_role'), b = await f.connect('service_role');
  const [first, second] = await raceLocked(a, b, () => reserve(a, actor, key),
    () => reserve(b, actor, key), 'withdrawal: one key and one debit');
  assert.ifError(second.error); assert.deepEqual(second.value, first);
  assert.deepEqual(await snapshot(actor), { balance: '80.00', requests: 1, receipts: 0 });
});

test('simultaneous different keys cannot bypass the single unresolved withdrawal', async () => {
  const actor = await f.createUser(), a = await f.connect('service_role'), b = await f.connect('service_role');
  const [first, second] = await raceLocked(a, b, () => reserve(a, actor, randomUUID()),
    () => reserve(b, actor, randomUUID()), 'withdrawal: independent keys for one owner');
  assert.equal(first.state, 'reserved'); assert.match(second.error?.message ?? '', /withdrawal_in_progress/);
  assert.deepEqual(await snapshot(actor), { balance: '80.00', requests: 1, receipts: 0 });
});

test('two workers consume exactly one transfer authorization, including same-token retries', async () => {
  const actor = await f.createUser(), key = randomUUID(), token = randomUUID();
  const a = await f.connect('service_role'), b = await f.connect('service_role');
  await reserve(a, actor, key);
  const [first, second] = await raceLocked(a, b, () => claim(a, actor, key, token),
    () => claim(b, actor, key, token), 'withdrawal: one provider attempt authorization');
  assert.ifError(second.error); assert.equal(first.send_authorized, true);
  assert.equal(second.value.send_authorized, false); assert.equal(second.value.attempt_token, token);
  assert.deepEqual(await snapshot(actor), { balance: '80.00', requests: 1, receipts: 0 });
});

test('simultaneous matching completions create one shared receipt', async () => {
  const actor = await f.createUser(), key = randomUUID(), token = randomUUID();
  const transfer = 'tr_' + randomUUID().replaceAll('-', '');
  const a = await f.connect('service_role'), b = await f.connect('service_role');
  await reserve(a, actor, key); await claim(a, actor, key, token);
  const [first, second] = await raceLocked(a, b, () => complete(a, actor, key, token, transfer),
    () => complete(b, actor, key, token, transfer), 'withdrawal: one final shared receipt');
  assert.ifError(second.error); assert.deepEqual(second.value, first); assert.equal(first.state, 'completed');
  assert.deepEqual(await snapshot(actor), { balance: '80.00', requests: 1, receipts: 1 });
});

test('simultaneous definitive rejections restore the balance exactly once', async () => {
  const actor = await f.createUser(), key = randomUUID(), token = randomUUID();
  const a = await f.connect('service_role'), b = await f.connect('service_role');
  await reserve(a, actor, key); await claim(a, actor, key, token);
  const [first, second] = await raceLocked(a, b, () => reject(a, actor, key, token),
    () => reject(b, actor, key, token), 'withdrawal: one compensation after a proven rejection');
  assert.ifError(second.error); assert.deepEqual(second.value, first); assert.equal(first.state, 'rejected');
  assert.deepEqual(await snapshot(actor), { balance: '100.00', requests: 1, receipts: 1 });
});

test('an ignored journal insertion rolls the debit back instead of reporting a reservation', async () => {
  const actor = await f.createUser(), service = await f.connect('service_role');
  await f.owner.query(`CREATE FUNCTION public.fixture_ignore_withdrawal() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RETURN NULL; END $$;
    CREATE TRIGGER fixture_ignore_withdrawal BEFORE INSERT ON akasha_ai.withdrawal_requests
    FOR EACH ROW EXECUTE FUNCTION public.fixture_ignore_withdrawal()`);
  try {
    await assert.rejects(reserve(service, actor, randomUUID()), /withdrawal_admission_unconfirmed/);
    assert.deepEqual(await snapshot(actor), { balance: '100.00', requests: 0, receipts: 0 });
  } finally {
    await f.owner.query('DROP TRIGGER fixture_ignore_withdrawal ON akasha_ai.withdrawal_requests; DROP FUNCTION public.fixture_ignore_withdrawal()');
  }
});

test('daily admission includes completed requests once and refuses the excess amount', async () => {
  const actor = await f.createUser(), service = await f.connect('service_role');
  for (let i = 0; i < 2; i++) {
    const key = randomUUID(), token = randomUUID(), transfer = 'tr_' + randomUUID().replaceAll('-', '');
    await reserve(service, actor, key); await claim(service, actor, key, token);
    await complete(service, actor, key, token, transfer);
  }
  await assert.rejects(reserve(service, actor, randomUUID()), /withdrawal_daily_cap_exceeded/);
  assert.deepEqual(await snapshot(actor), { balance: '60.00', requests: 2, receipts: 2 });
});

test('a prior-day unsubmitted reservation expires without authorization and restores once', async () => {
  const actor = await f.createUser(), service = await f.connect('service_role');
  const key = randomUUID(), token = randomUUID();
  await reserve(service, actor, key);
  await f.owner.query("UPDATE akasha_ai.withdrawal_requests SET created_at=now()-interval '2 days' WHERE user_id=$1", [actor.id]);
  const first = await claim(service, actor, key, token), second = await claim(service, actor, key, token);
  assert.equal(first.send_authorized, false); assert.equal(first.state, 'rejected');
  assert.equal(first.failure_code, 'reservation_expired_unsubmitted'); assert.deepEqual(second, first);
  assert.deepEqual(await snapshot(actor), { balance: '100.00', requests: 1, receipts: 1 });
});

test('completion rejects the wrong token, amount, destination and provider mode', async () => {
  const actor = await f.createUser(), service = await f.connect('service_role');
  const key = randomUUID(), token = randomUUID();
  await reserve(service, actor, key); await claim(service, actor, key, token);
  await assert.rejects(complete(service, actor, key, randomUUID(), 'tr_synthetic'), /withdrawal_receipt_conflict/);
  await assert.rejects(complete(service, actor, key, token, 'tr_synthetic', 21), /withdrawal_receipt_conflict/);
  await assert.rejects(complete(service, actor, key, token, 'tr_synthetic', 20, 'acct_other'), /withdrawal_receipt_conflict/);
  await assert.rejects(complete(service, actor, key, token, 'tr_synthetic', 20, 'acct_synthetic', 'live'), /withdrawal_receipt_conflict/);
  assert.deepEqual(await snapshot(actor), { balance: '80.00', requests: 1, receipts: 0 });
});

test('unattributed legacy history blocks admission instead of counting as zero', async () => {
  const actor = await f.createUser(), service = await f.connect('service_role');
  await f.owner.query("INSERT INTO public.connect_withdrawals(user_id,stripe_account_id,amount_eur,status) VALUES($1,'acct_synthetic',20,'paid')", [actor.id]);
  await assert.rejects(reserve(service, actor, randomUUID()), /withdrawal_history_ambiguous/);
  assert.deepEqual(await snapshot(actor), { balance: '100.00', requests: 0, receipts: 1 });
});

test('an uncertain attempt cannot be resent, refunded without proof, or bypassed by a new key', async () => {
  const actor = await f.createUser(), service = await f.connect('service_role');
  const key = randomUUID(), token = randomUUID();
  await reserve(service, actor, key); await claim(service, actor, key, token);
  const state = await receipt(service, 'SELECT public.reconcile_akasha_withdrawal($1,$2,$3) AS receipt', [actor.id, key, token]);
  assert.equal(state.state, 'reconciliation');
  assert.equal((await cancel(service, actor, key)).cancelled, false);
  assert.equal(await cancellationCount(actor), 0);
  await f.owner.query("UPDATE akasha_ai.withdrawal_requests SET created_at=now()-interval '30 days' WHERE user_id=$1", [actor.id]);
  assert.equal((await claim(service, actor, key, randomUUID())).send_authorized, false);
  await assert.rejects(reject(service, actor, key, token), /withdrawal_rejection_unproven/);
  await assert.rejects(reserve(service, actor, randomUUID()), /withdrawal_in_progress/);
  assert.deepEqual(await snapshot(actor), { balance: '80.00', requests: 1, receipts: 0 });
});

test('a refused amount can be cancelled durably before a new smaller intention is admitted', async () => {
  const actor = await f.createUser(), service = await f.connect('service_role'), oldKey = randomUUID();
  await assert.rejects(reserve(service, actor, oldKey, 100), /withdrawal_daily_cap_exceeded/);
  const cancelled = await cancel(service, actor, oldKey);
  assert.equal(cancelled.cancelled, true); assert.equal(cancelled.user_id, actor.id);
  await assert.rejects(reserve(service, actor, oldKey, 100, 500), /withdrawal_request_cancelled/);
  assert.equal((await reserve(service, actor, randomUUID())).state, 'reserved');
  assert.equal(await cancellationCount(actor), 1);
  assert.deepEqual(await snapshot(actor), { balance: '80.00', requests: 1, receipts: 0 });
});

test('cancellation winning the profile lock prevents a late reservation from debiting', async () => {
  const actor = await f.createUser(), key = randomUUID();
  const a = await f.connect('service_role'), b = await f.connect('service_role');
  const [first, second] = await raceLocked(a, b, () => cancel(a, actor, key),
    () => reserve(b, actor, key), 'withdrawal: cancellation before a late reservation');
  assert.equal(first.cancelled, true); assert.match(second.error?.message ?? '', /withdrawal_request_cancelled/);
  assert.equal(await cancellationCount(actor), 1);
  assert.deepEqual(await snapshot(actor), { balance: '100.00', requests: 0, receipts: 0 });
});

test('reservation winning the profile lock cannot be erased by cancellation', async () => {
  const actor = await f.createUser(), key = randomUUID();
  const a = await f.connect('service_role'), b = await f.connect('service_role');
  const [first, second] = await raceLocked(a, b, () => reserve(a, actor, key),
    () => cancel(b, actor, key), 'withdrawal: admission before cancellation');
  assert.ifError(second.error); assert.equal(second.value.cancelled, false);
  assert.equal(second.value.receipt.request_id, first.request_id);
  assert.equal(await cancellationCount(actor), 0);
  assert.deepEqual(await snapshot(actor), { balance: '80.00', requests: 1, receipts: 0 });
});

test('two concurrent cancellation acknowledgements refer to one durable tombstone', async () => {
  const actor = await f.createUser(), key = randomUUID();
  const a = await f.connect('service_role'), b = await f.connect('service_role');
  const [first, second] = await raceLocked(a, b, () => cancel(a, actor, key),
    () => cancel(b, actor, key), 'withdrawal: a single cancellation receipt');
  assert.ifError(second.error); assert.equal(first.cancelled, true); assert.deepEqual(second.value, first);
  assert.equal(await cancellationCount(actor), 1);
  assert.deepEqual(await snapshot(actor), { balance: '100.00', requests: 0, receipts: 0 });
});
