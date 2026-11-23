import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import {
  A, B, ids, admin, connect, share, snapshot, waitForBlocked, seedPoints, reward,
  setupDeliveryFixture, resetDeliveryFixture, closeDeliveryFixture,
  closeClients, releaseDeliveryClients, rollbackAndClose, historicalEmail,
} from './native-fixture.mjs'

before(setupDeliveryFixture)
beforeEach(resetDeliveryFixture)
afterEach(releaseDeliveryClients)
after(closeDeliveryFixture)

test('transaction commits the share, ledger and balance', async () => {
  const c = await connect()
  try { assert.equal((await share(c)).points, 400) }
  finally { await closeClients(c) }
  assert.deepEqual(await snapshot(), { shares: 1, transactions: 1, ledger: 400, balance: 400 })
})
test('a blocked independent connection replays one request without double credit', async () => {
  const c1 = await connect(), c2 = await connect()
  try {
    await c1.query('BEGIN')
    const first = await share(c1)
    const pid = (await c2.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    const second = share(c2)
    await waitForBlocked(pid, c1.processID)
    await c1.query('COMMIT')
    assert.deepEqual(await second, { ...first, replayed: true })
  } finally { await rollbackAndClose(c1, c2) }
  assert.deepEqual(await snapshot(), { shares: 1, transactions: 1, ledger: 400, balance: 400 })
})
test('two waiting connections cannot both receive the first-share bonus', async () => {
  const c1 = await connect(), c2 = await connect()
  try {
    await c1.query('BEGIN')
    assert.equal((await share(c1, ids[0])).points, 400)
    const pid = (await c2.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    const second = share(c2, ids[1])
    await waitForBlocked(pid, c1.processID)
    await c1.query('COMMIT')
    assert.equal((await second).points, 300)
  } finally { await rollbackAndClose(c1, c2) }
  assert.deepEqual(await snapshot(), { shares: 2, transactions: 2, ledger: 700, balance: 700 })
})
test('concurrent fourth share is refused after the third commits', async () => {
  const c1 = await connect(), c2 = await connect()
  try {
    await share(c1, ids[0]); await share(c1, ids[1]); await c1.query('BEGIN'); await share(c1, ids[2])
    const pid = (await c2.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    const fourth = share(c2, ids[3]).then(value => ({ value }), error => ({ error }))
    await waitForBlocked(pid, c1.processID)
    await c1.query('COMMIT')
    assert.match((await fourth).error.message, /maximum 3/)
  } finally { await rollbackAndClose(c1, c2) }
  assert.deepEqual(await snapshot(), { shares: 3, transactions: 3, ledger: 1000, balance: 1000 })
})
for (const table of ['point_transactions', 'purama_points']) {
  test('failure in ' + table + ' rolls back every side effect', async () => {
    await admin.query(`CREATE FUNCTION akasha_ai.synthetic_delivery_failure() RETURNS trigger LANGUAGE plpgsql AS
      $$ BEGIN RAISE EXCEPTION 'synthetic downstream failure'; END $$;
      CREATE TRIGGER synthetic_failure BEFORE INSERT ON akasha_ai.${table}
        FOR EACH ROW EXECUTE FUNCTION akasha_ai.synthetic_delivery_failure();`)
    const c = await connect()
    try {
      await assert.rejects(share(c), /synthetic downstream failure/)
      assert.deepEqual(await snapshot(), { shares: 0, transactions: 0, ledger: 0, balance: 0 })
    } finally {
      try {
        await admin.query(`DROP TRIGGER synthetic_failure ON akasha_ai.${table}; DROP FUNCTION akasha_ai.synthetic_delivery_failure()`)
      } finally { await closeClients(c) }
    }
  })
}
test('client privileges cannot forge points, share records or email history', async () => {
  const c = await connect()
  try {
    await assert.rejects(c.query("INSERT INTO akasha_ai.social_shares(user_id,share_code) VALUES($1,'ref-a')", [A]), /permission denied/)
    await assert.rejects(c.query('INSERT INTO akasha_ai.purama_points(user_id,balance) VALUES($1,99999)', [A]), /permission denied/)
    await assert.rejects(c.query("INSERT INTO akasha_ai.point_transactions(user_id,amount,type) VALUES($1,99999,'partage')", [A]), /permission denied/)
    await assert.rejects(c.query("SELECT akasha_ai.record_email_sequence_delivery($1,'welcome')", [A]), /permission denied/)
    await assert.rejects(c.query("SELECT akasha_ai.record_social_share($1,'ref-b','whatsapp')", [ids[0]]), /profile mismatch/)
  } finally { await closeClients(c) }
})
test('the retired email recorder stays forbidden while the canonical claim admits one witnessed attempt', async () => {
  const c1 = await connect(A, true), c2 = await connect(A, true)
  const recipient = 'synthetic-delivery@example.invalid'
  const query = 'SELECT akasha_ai.claim_email_sequence_delivery($1,$2,$3,$4,$5) AS receipt'
  const args = [A, 'welcome', ids[0], 'a'.repeat(64), recipient]
  try {
    await assert.rejects(c1.query("SELECT akasha_ai.record_email_sequence_delivery($1,'welcome')", [A]), { code: '42501' })
    await admin.query('UPDATE akasha_ai.profiles SET email=$2 WHERE id=$1', [A, recipient])
    await admin.query("INSERT INTO akasha_ai.notification_preferences(user_id,types) VALUES($1,'{\"newsletter\":true}')", [A])
    await c1.query('BEGIN')
    assert.equal((await c1.query(query, args)).rows[0].receipt.status, 'claimed')
    const pid = (await c2.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    const second = c2.query(query, [A, 'welcome', ids[1], args[3], recipient])
    await waitForBlocked(pid, c1.processID)
    await c1.query('COMMIT')
    assert.equal((await second).rows[0].receipt.status, 'reconciliation_required')
    assert.deepEqual((await admin.query('SELECT state,count(*)::int AS n FROM akasha_ai.email_sequence_deliveries GROUP BY state')).rows,
      [{ state: 'sending', n: 1 }])
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM akasha_ai.email_sequences')).rows[0].n, 0)
  } finally { await rollbackAndClose(c1, c2) }
})
test('the composed migrations preserve old email logs without inventing provider acceptance', () => {
  assert.equal(historicalEmail.before.length, 2)
  assert.deepEqual(historicalEmail.after, historicalEmail.before)
  assert.equal(historicalEmail.deliveries, 0)
})

test('legacy debit-only and direct browser reward calls are denied', async () => {
  const user = await connect(), service = await connect(A, true)
  try {
    await seedPoints()
    await assert.rejects(user.query("SELECT * FROM akasha_ai.redeem_points($1,1,'cash-1000')", [A]), /permission denied/)
    await assert.rejects(service.query("SELECT * FROM akasha_ai.redeem_points($1,1,'cash-1000')", [A]), /permission denied/)
    await assert.rejects(reward(user), /permission denied/)
    assert.equal((await reward(service)).new_balance, 8000)
    assert.equal((await admin.query('SELECT credits FROM akasha_ai.profiles WHERE id=$1', [A])).rows[0].credits, 10)
    assert.deepEqual(await snapshot(), { shares: 0, transactions: 2, ledger: 8000, balance: 8000 })
  } finally { await closeClients(user, service) }
})
test('two connections replay the same purchase with one debit and one delivered reward', async () => {
  const c1 = await connect(A, true), c2 = await connect(A, true)
  try {
    await seedPoints(); await c1.query('BEGIN')
    const first = await reward(c1)
    const pid = (await c2.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    const second = reward(c2)
    await waitForBlocked(pid, c1.processID); await c1.query('COMMIT')
    assert.deepEqual(await second, { ...first, replayed: true })
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM akasha_ai.point_purchases')).rows[0].n, 1)
    assert.equal((await admin.query('SELECT credits FROM akasha_ai.profiles WHERE id=$1', [A])).rows[0].credits, 10)
    assert.deepEqual(await snapshot(), { shares: 0, transactions: 2, ledger: 8000, balance: 8000 })
  } finally { await rollbackAndClose(c1, c2) }
})
test('two competing rewards cannot overdraw the same points balance', async () => {
  const c1 = await connect(A, true), c2 = await connect(A, true)
  try {
    await seedPoints(); await c1.query('BEGIN')
    assert.equal((await reward(c1, ids[0], 'credits-50', 8000)).new_balance, 2000)
    const pid = (await c2.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    const second = reward(c2, ids[1], 'credits-50', 8000)
    await waitForBlocked(pid, c1.processID); await c1.query('COMMIT')
    assert.deepEqual(await second, { success: false, reason: 'insufficient_points' })
    assert.deepEqual(await snapshot(), { shares: 0, transactions: 2, ledger: 2000, balance: 2000 })
  } finally { await rollbackAndClose(c1, c2) }
})
test('a share waiting for a redemption preserves both balance changes', async () => {
  const user = await connect(), service = await connect(A, true)
  try {
    await seedPoints(); await service.query('BEGIN'); await reward(service)
    const pid = (await user.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    const pendingShare = share(user, ids[1])
    await waitForBlocked(pid, service.processID); await service.query('COMMIT')
    assert.equal((await pendingShare).points, 400)
    assert.deepEqual(await snapshot(), { shares: 1, transactions: 3, ledger: 8400, balance: 8400 })
  } finally { await rollbackAndClose(service, user) }
})
test('missing ticket draw or unsupported reward never debits points', async () => {
  const service = await connect(A, true)
  try {
    await seedPoints()
    assert.deepEqual(await reward(service, ids[0], 'ticket-1', 500), { success: false, reason: 'no_draw' })
    assert.deepEqual(await reward(service, ids[0], 'cash-250', 25000), { success: false, reason: 'unavailable' })
    assert.deepEqual(await snapshot(), { shares: 0, transactions: 1, ledger: 10000, balance: 10000 })
    await admin.query("INSERT INTO akasha_ai.lottery_draws(draw_date) VALUES(now()+interval '1 day')")
    assert.equal((await reward(service, ids[0], 'ticket-1', 500)).fulfilled, true)
    assert.equal((await reward(service, ids[0], 'ticket-1', 500)).replayed, true)
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM akasha_ai.lottery_tickets')).rows[0].n, 1)
    assert.deepEqual(await snapshot(), { shares: 0, transactions: 2, ledger: 9500, balance: 9500 })
  } finally { await closeClients(service) }
})
test('a share waiting for a daily gift cannot overwrite the gift credit', async () => {
  const user = await connect(), service = await connect(A, true)
  try {
    await service.query('BEGIN')
    await service.query("SELECT akasha_ai.claim_daily_gift($1,'points',7,0)", [A])
    const pid = (await user.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    const pendingShare = share(user)
    await waitForBlocked(pid, service.processID); await service.query('COMMIT')
    await pendingShare
    assert.deepEqual(await snapshot(), { shares: 1, transactions: 2, ledger: 407, balance: 407 })
  } finally { await rollbackAndClose(service, user) }
})
test('daily credit gift and redeemed credits compose under a witnessed lock', async () => {
  const c1 = await connect(A, true), c2 = await connect(A, true)
  try {
    await seedPoints(); await c1.query('BEGIN')
    await c1.query("SELECT akasha_ai.claim_daily_gift($1,'credits',3,0)", [A])
    const pid = (await c2.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    const pending = reward(c2)
    await waitForBlocked(pid, c1.processID); await c1.query('COMMIT'); await pending
    assert.equal((await admin.query('SELECT credits FROM akasha_ai.profiles WHERE id=$1', [A])).rows[0].credits, 13)
    assert.deepEqual(await snapshot(), { shares: 0, transactions: 2, ledger: 8000, balance: 8000 })
  } finally { await rollbackAndClose(c1, c2) }
})
test('a concurrent daily gift request replays the committed reward once', async () => {
  const c1 = await connect(A, true), c2 = await connect(A, true)
  const query = "SELECT akasha_ai.claim_daily_gift($1,'points',7,0) AS receipt"
  try {
    await c1.query('BEGIN'); const first = (await c1.query(query, [A])).rows[0].receipt
    const pid = (await c2.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    const replay = c2.query(query, [A])
    await waitForBlocked(pid, c1.processID); await c1.query('COMMIT')
    assert.deepEqual((await replay).rows[0].receipt, { ...first, replayed: true })
    assert.deepEqual(await snapshot(), { shares: 0, transactions: 1, ledger: 7, balance: 7 })
  } finally { await rollbackAndClose(c1, c2) }
})
test('a failed daily reward journal rolls back the claim and permits safe retry', async () => {
  const service = await connect(A, true)
  await admin.query(`CREATE FUNCTION akasha_ai.synthetic_gift_failure() RETURNS trigger LANGUAGE plpgsql AS
    $$ BEGIN RAISE EXCEPTION 'synthetic gift failure'; END $$;
    CREATE TRIGGER synthetic_gift_failure BEFORE INSERT ON akasha_ai.point_transactions
      FOR EACH ROW EXECUTE FUNCTION akasha_ai.synthetic_gift_failure();`)
  try {
    await assert.rejects(service.query("SELECT akasha_ai.claim_daily_gift($1,'points',7,0)", [A]), /synthetic gift failure/)
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM akasha_ai.daily_gifts')).rows[0].n, 0)
    assert.deepEqual(await snapshot(), { shares: 0, transactions: 0, ledger: 0, balance: 0 })
  } finally {
    try {
      await admin.query('DROP TRIGGER synthetic_gift_failure ON akasha_ai.point_transactions; DROP FUNCTION akasha_ai.synthetic_gift_failure()')
    } finally { await closeClients(service) }
  }
})
test('profile write boundary preserves own settings and rejects privileges or credits', async () => {
  const user = await connect()
  try {
    const before = (await user.query('SELECT * FROM akasha_ai.profiles WHERE id=$1', [A])).rows[0]
    for (const statement of ["UPDATE akasha_ai.profiles SET credits=99999 WHERE id=$1",
      "UPDATE akasha_ai.profiles SET role='super_admin' WHERE id=$1", "UPDATE akasha_ai.profiles SET plan='complete' WHERE id=$1",
      "UPDATE akasha_ai.profiles SET plan_tier='max' WHERE id=$1", "UPDATE akasha_ai.profiles SET wallet_balance=99999 WHERE id=$1",
      "UPDATE akasha_ai.profiles SET stripe_customer_id='cus_synthetic_other' WHERE id=$1",
      "UPDATE akasha_ai.profiles SET stripe_subscription_id='sub_synthetic_other' WHERE id=$1",
      "UPDATE akasha_ai.profiles SET email='other@example.test' WHERE id=$1",
      "UPDATE akasha_ai.profiles SET referral_code='changed-referral' WHERE id=$1",
      "UPDATE akasha_ai.profiles SET metadata='{}'::jsonb WHERE id=$1",
      "UPDATE akasha_ai.profiles SET xp=99999,level=100 WHERE id=$1",
      "UPDATE akasha_ai.profiles SET daily_questions=99999,streak_count=99999 WHERE id=$1",
      "UPDATE akasha_ai.profiles SET created_at=now(),subscription_started_at=now() WHERE id=$1",
      "UPDATE akasha_ai.profiles SET bio='Unauthorized partial edit',role='admin' WHERE id=$1"]) {
      await assert.rejects(user.query(statement, [A]), /permission denied/)
    }
    assert.deepEqual((await user.query('SELECT * FROM akasha_ai.profiles WHERE id=$1', [A])).rows[0], before)
    assert.deepEqual((await user.query('SELECT id FROM akasha_ai.profiles')).rows, [{ id: A }])
    assert.equal((await user.query("UPDATE akasha_ai.profiles SET bio='Own setting' WHERE id=$1", [A])).rowCount, 1)
    assert.equal((await user.query("UPDATE akasha_ai.profiles SET bio='Foreign setting' WHERE id=$1", [B])).rowCount, 0)
    assert.equal((await user.query("UPDATE akasha_ai.profiles SET display_name='Alice',avatar_url=NULL,pseudo='alice',bio='Bonjour'," +
      "preferred_language='fr',accent_color='#00d4ff',interests=ARRAY['learn'],onboarding_completed=true," +
      "onboarding_use_case='create',onboarding_level='beginner',tutorial_completed=true,updated_at=now() WHERE id=$1", [A])).rowCount, 1)
    const grants = (await admin.query("SELECT attname, has_column_privilege('authenticated',attrelid,attnum,'UPDATE') AS editable, " +
      "has_column_privilege('authenticated',attrelid,attnum,'INSERT') AS insertable FROM pg_attribute " +
      "WHERE attrelid='akasha_ai.profiles'::regclass AND attnum>0 AND NOT attisdropped ORDER BY attname")).rows
    assert.deepEqual(grants.filter(row => row.editable).map(row => row.attname), ['accent_color', 'avatar_url', 'bio',
      'display_name', 'interests', 'onboarding_completed', 'onboarding_level', 'onboarding_use_case', 'preferred_language',
      'pseudo', 'tutorial_completed', 'updated_at'])
    assert.equal(grants.some(row => row.insertable), false)
  } finally { await closeClients(user) }
})

test('a daily gift waiting for a share preserves both points increments', async () => {
  const user = await connect(), service = await connect(A, true)
  try {
    await user.query('BEGIN')
    assert.equal((await share(user)).points, 400)
    const pid = (await service.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    const pendingGift = service.query("SELECT akasha_ai.claim_daily_gift($1,'points',7,0) AS receipt", [A])
    await waitForBlocked(pid, user.processID); await user.query('COMMIT')
    const receipt = (await pendingGift).rows[0].receipt
    assert.equal(receipt.gift.user_id, A)
    assert.equal(receipt.replayed, false)
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM akasha_ai.daily_gifts')).rows[0].n, 1)
    assert.deepEqual(await snapshot(), { shares: 1, transactions: 2, ledger: 407, balance: 407 })
    assert.equal((await admin.query('SELECT lifetime_earned FROM akasha_ai.purama_points WHERE user_id=$1', [A])).rows[0].lifetime_earned, 407)
  } finally { await rollbackAndClose(user, service) }
})

test('a daily credit gift waiting for an own profile edit preserves both writes', async () => {
  const user = await connect(), service = await connect(A, true)
  try {
    await user.query('BEGIN')
    assert.equal((await user.query("UPDATE akasha_ai.profiles SET display_name='Concurrent edit' WHERE id=$1", [A])).rowCount, 1)
    const pid = (await service.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    const pendingGift = service.query("SELECT akasha_ai.claim_daily_gift($1,'credits',3,0) AS receipt", [A])
    await waitForBlocked(pid, user.processID); await user.query('COMMIT')
    const receipt = (await pendingGift).rows[0].receipt
    assert.equal(receipt.gift.user_id, A)
    assert.equal(receipt.replayed, false)
    assert.deepEqual((await admin.query('SELECT display_name,credits FROM akasha_ai.profiles WHERE id=$1', [A])).rows[0],
      { display_name: 'Concurrent edit', credits: 3 })
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM akasha_ai.daily_gifts')).rows[0].n, 1)
    assert.deepEqual(await snapshot(), { shares: 0, transactions: 0, ledger: 0, balance: 0 })
  } finally { await rollbackAndClose(user, service) }
})
