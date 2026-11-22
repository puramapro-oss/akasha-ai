import { before, after, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture } from './fixture.mjs';

const migration = 'supabase/migrations/20261123010300_social_share_tracking_atomic.sql';
let f;
before(async () => { f = await fixture('share', [
  'profiles', 'point_transactions', 'social_shares', 'purama_points', 'email_sequences', 'notification_preferences',
  'point_shop_items', 'point_purchases', 'lottery_draws', 'lottery_tickets', 'streaks', 'daily_gifts', 'user_coupons', 'contact_messages',
], ['20261122165000_delivery_consistency.sql', '20261122165100_daily_gift_delivery.sql',
  '20261122165200_points_redemption_authority.sql', '20261122165300_profile_write_boundary.sql',
  '20261123010200_email_sequence_delivery.sql'].map(name => 'supabase/migrations/' + name).concat(migration)); });
after(async () => { if (f) await f.close(); });
afterEach(async () => { if (f) await f.releaseClients(); });
const call = async (client, actor, operation, platform = 'native', code = actor.code) =>
  (await client.query('SELECT akasha_ai.record_social_share_checked($1,$2,$3,$4) AS receipt',
    [operation, code, platform, actor.id])).rows[0].receipt;
const counts = async actor => (await f.owner.query(`SELECT
  (SELECT count(*)::int FROM akasha_ai.social_shares WHERE user_id=$1) AS shares,
  (SELECT count(*)::int FROM akasha_ai.point_transactions WHERE user_id=$1 AND type='partage') AS transactions,
  (SELECT coalesce(sum(amount),0)::int FROM akasha_ai.point_transactions WHERE user_id=$1 AND type='partage') AS points,
  (SELECT coalesce(sum(balance),0)::int FROM akasha_ai.purama_points WHERE user_id=$1) AS balance,
  (SELECT coalesce(sum(lifetime_earned),0)::int FROM akasha_ai.purama_points WHERE user_id=$1) AS lifetime`,
[actor.id])).rows[0];

test('only authenticated actors can execute the share RPC', async () => {
  const actor = await f.createUser();
  for (const role of ['anon', 'service_role']) {
    const client = await f.connect(role, actor.id);
    await assert.rejects(call(client, actor, randomUUID()), { code: '42501' });
    await assert.rejects(client.query('SELECT akasha_ai.get_social_share_stats()'), { code: '42501' });
  }
  const signedOut = await f.connect('authenticated');
  await assert.rejects(call(signedOut, actor, randomUUID()), { code: '42501' });
  await assert.rejects(signedOut.query('SELECT akasha_ai.get_social_share_stats()'), { code: '42501' });
  assert.deepEqual(await counts(actor), { shares: 0, transactions: 0, points: 0, balance: 0, lifetime: 0 });
});

test('actor mismatch refuses an otherwise valid operation without any effects', async () => {
  const a = await f.createUser(), b = await f.createUser();
  const client = await f.connect('authenticated', a.id);
  await assert.rejects(call(client, b, randomUUID()), { code: '42501' });
  assert.deepEqual(await counts(b), { shares: 0, transactions: 0, points: 0, balance: 0, lifetime: 0 });
});

test('two native sessions with the same operation wait and return one identical receipt', async () => {
  const actor = await f.createUser(), operation = randomUUID();
  const a = await f.connect('authenticated', actor.id), b = await f.connect('authenticated', actor.id);
  await a.query('BEGIN');
  const first = await call(a, actor, operation);
  const pending = call(b, actor, operation);
  await f.observeLock(b, a, 'share: same actor and operation');
  await a.query('COMMIT');
  const replay = await pending;
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(replay.share_id, first.share_id);
  assert.equal(replay.transaction_id, first.transaction_id);
  const canonicalReplay = (await b.query('SELECT akasha_ai.record_social_share($1,$2,$3) AS receipt',
    [operation, actor.code, 'native'])).rows[0].receipt;
  assert.deepEqual(canonicalReplay, replay);
  assert.deepEqual(await counts(actor), { shares: 1, transactions: 1, points: 400, balance: 400, lifetime: 400 });
  assert.deepEqual((await b.query('SELECT akasha_ai.get_social_share_stats() AS stats')).rows[0].stats,
    { version: 1, user_id: actor.id, total_shares: 1, points_earned: 400, today_shares: 1 });
  assert.equal((await b.query("SELECT to_regprocedure('akasha_ai.get_social_share_stats(uuid)') IS NULL AS absent")).rows[0].absent, true);
});

test('four concurrent different operations serialize at the daily quota', async () => {
  const actor = await f.createUser();
  const clients = await Promise.all(Array.from({ length: 4 }, () => f.connect('authenticated', actor.id)));
  await clients[0].query('BEGIN');
  await call(clients[0], actor, randomUUID());
  const pending = clients.slice(1).map(client => call(client, actor, randomUUID()).then(
    value => ({ value }), error => ({ error })));
  await f.observeLock(clients[1], clients[0], 'share: independent operations for the same actor');
  await clients[0].query('COMMIT');
  const results = await Promise.all(pending);
  assert.equal(results.filter(row => row.value).length, 2);
  const failures = results.filter(row => row.error);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].error.code, 'P0001');
  assert.match(failures[0].error.message, /maximum 3/);
  assert.deepEqual(await counts(actor), { shares: 3, transactions: 3, points: 1000, balance: 1000, lifetime: 1000 });
});

test('the same UUID belongs independently to each authenticated user', async () => {
  const a = await f.createUser(), b = await f.createUser(), operation = randomUUID();
  const ca = await f.connect('authenticated', a.id), cb = await f.connect('authenticated', b.id);
  const [one, two] = await Promise.all([call(ca, a, operation), call(cb, b, operation)]);
  assert.notEqual(one.share_id, two.share_id);
  assert.deepEqual(await counts(a), { shares: 1, transactions: 1, points: 400, balance: 400, lifetime: 400 });
  assert.deepEqual(await counts(b), { shares: 1, transactions: 1, points: 400, balance: 400, lifetime: 400 });
});

test('reusing a key with changed platform or referral code cannot create another credit', async () => {
  const actor = await f.createUser(), operation = randomUUID();
  const client = await f.connect('authenticated', actor.id);
  await call(client, actor, operation);
  await assert.rejects(call(client, actor, operation, 'twitter'), { code: '22023' });
  await assert.rejects(call(client, actor, operation, 'native', 'a-different-code'), { code: '22023' });
  assert.deepEqual(await counts(actor), { shares: 1, transactions: 1, points: 400, balance: 400, lifetime: 400 });
});

test('failure of the second write rolls back the share, ledger and balance', async () => {
  const actor = await f.createUser(), operation = randomUUID();
  const client = await f.connect('authenticated', actor.id);
  await f.owner.query(`CREATE FUNCTION public.fixture_reject_share() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'synthetic share insert failure'; END $$;
    CREATE TRIGGER fixture_reject_share BEFORE INSERT ON akasha_ai.social_shares
    FOR EACH ROW EXECUTE FUNCTION public.fixture_reject_share()`);
  try {
    await assert.rejects(call(client, actor, operation), /synthetic share insert failure/);
    assert.deepEqual(await counts(actor), { shares: 0, transactions: 0, points: 0, balance: 0, lifetime: 0 });
  } finally {
    await f.owner.query('DROP TRIGGER fixture_reject_share ON akasha_ai.social_shares; DROP FUNCTION public.fixture_reject_share()');
  }
  const retry = await call(client, actor, operation);
  assert.equal(retry.replayed, false);
  assert.deepEqual(await counts(actor), { shares: 1, transactions: 1, points: 400, balance: 400, lifetime: 400 });
});

test('authenticated direct writes cannot forge, edit or delete tracked shares', async () => {
  const actor = await f.createUser(), client = await f.connect('authenticated');
  await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [actor.id]);
  const receipt = await call(client, actor, randomUUID());
  await assert.rejects(client.query('INSERT INTO akasha_ai.social_shares(user_id,share_code,points_given) VALUES($1,$2,99999)',
    [actor.id, actor.code]), { code: '42501' });
  await assert.rejects(client.query("INSERT INTO akasha_ai.point_transactions(user_id,amount,type) VALUES($1,99999,'partage')",
    [actor.id]), { code: '42501' });
  await assert.rejects(client.query('UPDATE akasha_ai.social_shares SET points_given=99999 WHERE id=$1', [receipt.share_id]), { code: '42501' });
  await assert.rejects(client.query('DELETE FROM akasha_ai.social_shares WHERE id=$1', [receipt.share_id]), { code: '42501' });
  await assert.rejects(client.query('DELETE FROM akasha_ai.point_transactions WHERE id=$1', [receipt.transaction_id]), { code: '42501' });
  await assert.rejects(client.query('UPDATE akasha_ai.purama_points SET balance=99999 WHERE user_id=$1', [actor.id]), { code: '42501' });
  await assert.rejects(client.query("INSERT INTO akasha_ai.point_transactions(user_id,amount,type) VALUES($1,5,'fixture_other')", [actor.id]), { code: '42501' });
  assert.deepEqual(await counts(actor), { shares: 1, transactions: 1, points: 400, balance: 400, lifetime: 400 });

});

test('legacy rows count toward the limit and remain unchanged on migration reapplication', async () => {
  const actor = await f.createUser();
  await f.owner.query('INSERT INTO akasha_ai.social_shares(user_id,share_code,points_given) VALUES($1,$2,400),($1,$2,300),($1,$2,300)',
    [actor.id, actor.code]);
  const before = (await f.owner.query('SELECT * FROM akasha_ai.social_shares WHERE user_id=$1 ORDER BY id', [actor.id])).rows;
  await f.apply(migration);
  const after = (await f.owner.query('SELECT * FROM akasha_ai.social_shares WHERE user_id=$1 ORDER BY id', [actor.id])).rows;
  assert.deepEqual(after, before);
  const client = await f.connect('authenticated', actor.id);
  await assert.rejects(call(client, actor, randomUUID()), /maximum 3/);
});

test('a prior-day replay retains its receipt and does not consume the new day bonus', async () => {
  const actor = await f.createUser(), operation = randomUUID();
  const client = await f.connect('authenticated', actor.id);
  const first = await call(client, actor, operation);
  await f.owner.query("UPDATE akasha_ai.social_shares SET shared_at=now()-interval '2 days' WHERE id=$1", [first.share_id]);
  const replay = await call(client, actor, operation);
  assert.equal(replay.replayed, true);
  assert.equal(replay.share_id, first.share_id);
  const next = await call(client, actor, randomUUID());
  assert.equal(next.points, 400);
  assert.deepEqual(await counts(actor), { shares: 2, transactions: 2, points: 800, balance: 800, lifetime: 800 });
});

for (const [timing, body] of [
  ['BEFORE', 'RETURN NULL;'],
  ['AFTER', 'DELETE FROM akasha_ai.social_shares WHERE user_id=NEW.user_id; RETURN NEW;'],
]) {
  test(timing + ' balance trigger cannot acknowledge a partial share reward', async () => {
    const actor = await f.createUser(), client = await f.connect('authenticated', actor.id);
    await f.owner.query(`CREATE FUNCTION public.fixture_reject_balance() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN ${body} END $$;
      CREATE TRIGGER fixture_reject_balance ${timing} INSERT ON akasha_ai.purama_points
      FOR EACH ROW EXECUTE FUNCTION public.fixture_reject_balance()`);
    try {
      await assert.rejects(call(client, actor, randomUUID()), { code: '55000' });
      assert.deepEqual(await counts(actor), { shares: 0, transactions: 0, points: 0, balance: 0, lifetime: 0 });
    } finally {
      await f.owner.query('DROP TRIGGER fixture_reject_balance ON akasha_ai.purama_points; DROP FUNCTION public.fixture_reject_balance()');
    }
  });
}

test('an incoming request-id receipt without the new FK replays its original credit', async () => {
  const actor = await f.createUser(), request = randomUUID(), shareId = randomUUID(), transaction = randomUUID();
  await f.owner.query(`INSERT INTO akasha_ai.social_shares(id,user_id,request_id,share_code,platform_hint,points_given)
    VALUES($1,$2,$3,$4,'native',400)`, [shareId, actor.id, request, actor.code]);
  await f.owner.query(`INSERT INTO akasha_ai.point_transactions(id,user_id,amount,type,source)
    VALUES($1,$2,400,'partage',$3)`, [transaction, actor.id, 'share/' + shareId]);
  await f.owner.query('INSERT INTO akasha_ai.purama_points(user_id,balance,lifetime_earned) VALUES($1,20,400)', [actor.id]);
  const before = await counts(actor), client = await f.connect('authenticated', actor.id);
  const receipt = await call(client, actor, request);
  assert.equal(receipt.replayed, true);
  assert.equal(receipt.transaction_id, transaction);
  assert.equal(receipt.share_id, shareId);
  assert.deepEqual(await counts(actor), before);
  assert.equal((await client.query('SELECT tracking_transaction_id FROM akasha_ai.social_shares WHERE id=$1', [shareId])).rows[0].tracking_transaction_id, null);
  assert.equal((await client.query("SELECT to_regprocedure('akasha_ai.track_social_share(uuid,uuid,text,text)') IS NULL AS absent")).rows[0].absent, true);
});
