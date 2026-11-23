import { before, after, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture } from './fixture.mjs';

let f;
const hash = 'a'.repeat(64);
before(async () => { f = await fixture('email', [
  'profiles', 'point_transactions', 'social_shares', 'purama_points', 'notification_preferences', 'email_sequences', 'contact_messages',
], ['supabase/migrations/20261122165000_delivery_consistency.sql',
  'supabase/migrations/20261123010200_email_sequence_delivery.sql']); });
after(async () => { if (f) await f.close(); });
afterEach(async () => { if (f) await f.releaseClients(); });
const claim = async (client, actor, token, type = 'welcome') =>
  (await client.query('SELECT akasha_ai.claim_email_sequence_delivery($1,$2,$3,$4,$5) AS receipt',
    [actor.id, type, token, hash, actor.email])).rows[0].receipt;
const complete = async (client, actor, token, provider, type = 'welcome') =>
  (await client.query('SELECT akasha_ai.complete_email_sequence_delivery($1,$2,$3,$4,$5) AS receipt',
    [actor.id, type, token, hash, provider])).rows[0].receipt;
const subscribe = async actor => f.owner.query(
  "INSERT INTO akasha_ai.notification_preferences(user_id,types) VALUES($1,'{\"newsletter\":true}')", [actor.id]);
const historyCount = async actor => (await f.owner.query(
  'SELECT count(*)::int AS count FROM akasha_ai.email_sequences WHERE user_id=$1', [actor.id])).rows[0].count;

test('only the service role can admit, confirm or reconcile a sequence', async () => {
  const actor = await f.createUser(), token = randomUUID();
  for (const role of ['anon', 'authenticated']) {
    const client = await f.connect(role, actor.id);
    await assert.rejects(claim(client, actor, token), { code: '42501' });
    await assert.rejects(complete(client, actor, token, 'synthetic-provider'), { code: '42501' });
    await assert.rejects(client.query('SELECT * FROM akasha_ai.email_sequence_deliveries'), { code: '42501' });
  }
  const service = await f.connect('service_role');
  await assert.rejects(service.query("SELECT akasha_ai.record_email_sequence_delivery($1,'welcome')", [actor.id]), { code: '42501' });
  assert.equal(await historyCount(actor), 0);
});

test('absence, false and string true never opt a recipient into promotional sequences', async () => {
  const actor = await f.createUser(), service = await f.connect('service_role');
  assert.equal((await claim(service, actor, randomUUID())).status, 'not_subscribed');
  await f.owner.query("INSERT INTO akasha_ai.notification_preferences(user_id,types) VALUES($1,'{\"newsletter\":false}')", [actor.id]);
  assert.equal((await claim(service, actor, randomUUID())).status, 'not_subscribed');
  await f.owner.query("UPDATE akasha_ai.notification_preferences SET types='{\"newsletter\":\"true\"}' WHERE user_id=$1", [actor.id]);
  assert.equal((await claim(service, actor, randomUUID())).status, 'not_subscribed');
  assert.equal((await f.owner.query('SELECT count(*)::int AS count FROM akasha_ai.email_sequence_deliveries WHERE user_id=$1', [actor.id])).rows[0].count, 0);
});

test('a stored pause and a changed recipient prevent admission without creating a claim', async () => {
  const actor = await f.createUser(), service = await f.connect('service_role');
  await subscribe(actor);
  await f.owner.query("UPDATE akasha_ai.notification_preferences SET paused_until=now()+interval '1 day' WHERE user_id=$1", [actor.id]);
  assert.equal((await claim(service, actor, randomUUID())).status, 'paused');
  await assert.rejects(claim(service, { ...actor, email: 'changed@example.invalid' }, randomUUID()), { code: '22023' });
  assert.equal(await historyCount(actor), 0);
});

test('concurrent cron sessions admit exactly one provider attempt', async () => {
  const actor = await f.createUser(), a = await f.connect('service_role'), b = await f.connect('service_role');
  await subscribe(actor);
  await a.query('BEGIN');
  const first = await claim(a, actor, randomUUID());
  const pending = claim(b, actor, randomUUID());
  await f.observeLock(b, a, 'email: same recipient and sequence unique claim');
  await a.query('COMMIT');
  const second = await pending;
  assert.equal(first.status, 'claimed');
  assert.equal(second.status, 'reconciliation_required');
  const result = await f.owner.query('SELECT state,count(*)::int AS count FROM akasha_ai.email_sequence_deliveries WHERE user_id=$1 GROUP BY state', [actor.id]);
  assert.deepEqual(result.rows, [{ state: 'sending', count: 1 }]);
});

test('concurrent matching confirmations record one history row and one provider receipt', async () => {
  const actor = await f.createUser(), token = randomUUID(), provider = 'provider-' + randomUUID();
  const a = await f.connect('service_role'), b = await f.connect('service_role');
  await subscribe(actor); await claim(a, actor, token);
  await a.query('BEGIN');
  const first = await complete(a, actor, token, provider);
  const pending = complete(b, actor, token, provider);
  await f.observeLock(b, a, 'email: confirmation retains a single journal/history pair');
  await a.query('COMMIT');
  const second = await pending;
  assert.deepEqual(second, first);
  assert.equal(second.status, 'sent');
  assert.equal(await historyCount(actor), 1);
});

test('a durable uncertain attempt never expires into a new send and cannot be stolen', async () => {
  const actor = await f.createUser(), token = randomUUID(), service = await f.connect('service_role');
  await subscribe(actor); await claim(service, actor, token);
  await f.owner.query("UPDATE akasha_ai.email_sequence_deliveries SET created_at=now()-interval '30 days' WHERE user_id=$1", [actor.id]);
  assert.equal((await claim(service, actor, randomUUID())).status, 'reconciliation_required');
  await assert.rejects(complete(service, actor, randomUUID(), 'provider-' + randomUUID()), { code: '55000' });
  assert.equal(await historyCount(actor), 0);
});

test('a failing history write rolls back completion and leaves the attempt non-replayable', async () => {
  const actor = await f.createUser(), token = randomUUID(), service = await f.connect('service_role');
  const provider = 'provider-' + randomUUID();
  await subscribe(actor); await claim(service, actor, token);
  await f.owner.query(`CREATE FUNCTION public.fixture_reject_email_history() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'synthetic history failure'; END $$;
    CREATE TRIGGER fixture_reject_email_history BEFORE INSERT ON akasha_ai.email_sequences
    FOR EACH ROW EXECUTE FUNCTION public.fixture_reject_email_history()`);
  try {
    await assert.rejects(complete(service, actor, token, provider), /synthetic history failure/);
    assert.equal(await historyCount(actor), 0);
    assert.equal((await claim(service, actor, randomUUID())).status, 'reconciliation_required');
  } finally {
    await f.owner.query('DROP TRIGGER fixture_reject_email_history ON akasha_ai.email_sequences; DROP FUNCTION public.fixture_reject_email_history()');
  }
  // Reconcile the same provider acceptance; no second provider request exists in this test.
  assert.equal((await complete(service, actor, token, provider)).status, 'sent');
  assert.equal(await historyCount(actor), 1);
});

test('legacy histories remain unchanged and are never silently promoted to confirmed sends', async () => {
  const actor = await f.createUser(), token = randomUUID(), service = await f.connect('service_role');
  await subscribe(actor);
  await f.owner.query("INSERT INTO akasha_ai.email_sequences(user_id,email_type) VALUES($1,'welcome'),($1,'welcome')", [actor.id]);
  const before = (await f.owner.query('SELECT * FROM akasha_ai.email_sequences WHERE user_id=$1 ORDER BY id', [actor.id])).rows;
  assert.equal((await claim(service, actor, token)).status, 'reconciliation_required');
  await assert.rejects(complete(service, actor, token, 'provider-' + randomUUID()), { code: '55000' });
  assert.deepEqual((await f.owner.query('SELECT * FROM akasha_ai.email_sequences WHERE user_id=$1 ORDER BY id', [actor.id])).rows, before);
});

test('late reconciliation never downgrades a completed receipt', async () => {
  const actor = await f.createUser(), token = randomUUID(), service = await f.connect('service_role');
  const provider = 'provider-' + randomUUID();
  await subscribe(actor); await claim(service, actor, token); await complete(service, actor, token, provider);
  const result = await service.query('SELECT akasha_ai.reconcile_email_sequence_delivery($1,$2,$3,$4,$5,$6) AS receipt',
    [actor.id, 'welcome', token, hash, null, 'provider_unconfirmed']);
  assert.equal(result.rows[0].receipt.status, 'sent');
  assert.equal(await historyCount(actor), 1);
  assert.equal((await claim(service, actor, randomUUID())).status, 'already_sent');
});

test('a provider identifier cannot confirm two different recipients', async () => {
  const a = await f.createUser(), b = await f.createUser(), service = await f.connect('service_role');
  const at = randomUUID(), bt = randomUUID(), provider = 'provider-' + randomUUID();
  await subscribe(a); await subscribe(b);
  await claim(service, a, at); await claim(service, b, bt);
  await complete(service, a, at, provider);
  await assert.rejects(complete(service, b, bt, provider), { code: '23505' });
  assert.equal(await historyCount(b), 0);
  assert.equal((await claim(service, b, randomUUID())).status, 'reconciliation_required');
});
