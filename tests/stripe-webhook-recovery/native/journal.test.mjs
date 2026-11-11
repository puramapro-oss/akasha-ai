import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const required = name => {
  assert.ok(process.env[name], 'Explicit synthetic setting required: ' + name);
  return process.env[name];
};
const host = required('AKASHA_WEBHOOK_TEST_PG_HOST');
const port = Number(required('AKASHA_WEBHOOK_TEST_PG_PORT'));
const user = required('AKASHA_WEBHOOK_TEST_PG_USER');
const expectedData = required('AKASHA_WEBHOOK_TEST_PG_DATA');
const driverUrl = required('AKASHA_WEBHOOK_TEST_PG_DRIVER');
const proofDir = required('AKASHA_WEBHOOK_TEST_PROOF_DIR');
assert.ok(path.isAbsolute(host) && path.isAbsolute(expectedData));
assert.ok(Number.isSafeInteger(port) && port > 0 && port <= 65535);
assert.ok(driverUrl.startsWith('file:'));
const ownership = JSON.parse(await readFile(path.join(path.dirname(expectedData), 'OWNERSHIP.json'), 'utf8'));
assert.equal(ownership.kind, 'purama-akasha-webhook-native');
assert.equal(ownership.run_id, required('AKASHA_WEBHOOK_TEST_RUN_ID'));
assert.equal(ownership.token, required('AKASHA_WEBHOOK_TEST_OWNER_TOKEN'));
assert.equal(expectedData, path.join(ownership.cluster, 'data'));
assert.equal(host, path.join(ownership.cluster, 'socket'));
const imported = await import(driverUrl);
const { Client } = imported.default ?? imported;
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const migration = await readFile(path.join(repo, 'supabase/migrations/20261111_stripe_webhook_journal.sql'), 'utf8');
const schema = await readFile(path.join(repo, 'schema.sql'), 'utf8');
const processedMigration = await readFile(path.join(repo, 'supabase/migrations/20260926_stripe_events_processed.sql'), 'utf8');
const legacyDefinition = schema.match(/CREATE TABLE IF NOT EXISTS akasha_ai\.stripe_events \([\s\S]*?\n\);/);
assert.ok(legacyDefinition, 'Exact legacy table definition must be present in source');
const clients = new Set();
const observations = [];
let owner;
let service;

async function connect(role = null, applicationName = 'akasha-journal-native') {
  const client = new Client({
    host, port, user, database: 'postgres', password: '',
    application_name: applicationName, connectionTimeoutMillis: 5000,
    query_timeout: 8000, statement_timeout: 7000,
  });
  clients.add(client);
  await client.connect();
  if (role) {
    assert.ok(['service_role', 'anon', 'authenticated'].includes(role));
    await client.query('SET ROLE ' + role);
  }
  return client;
}

const canonical = value => value && typeof value === 'object'
  ? Array.isArray(value)
    ? '[' + value.map(canonical).join(',') + ']'
    : '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}'
  : JSON.stringify(value);

function envelope(id, extra = {}) {
  const value = {
    version: 1, stripe_account_key: 'platform', livemode: false,
    event_id: id, event_type: 'checkout.session.completed', event_created: 1_800_000_000,
    api_version: null,
    event_data: { object: { id: 'cs_synthetic', object: 'checkout.session', metadata: { user_id: 'fixture' } } },
    ...extra,
  };
  return { ...value, fingerprint: createHash('sha256').update(canonical(value)).digest('hex') };
}

const identity = value => ({
  stripe_account_key: value.stripe_account_key, livemode: value.livemode,
  event_id: value.event_id, fingerprint: value.fingerprint,
});
async function admit(value, token = randomUUID(), client = service) {
  const result = await client.query(
    'SELECT akasha_ai.admit_stripe_webhook_event($1::jsonb,$2::uuid) AS receipt',
    [JSON.stringify(value), token],
  );
  return { ...result.rows[0].receipt, requested_token: token };
}
async function complete(value, token, client = service) {
  const result = await client.query(
    'SELECT akasha_ai.complete_stripe_webhook_event($1::jsonb,$2::uuid) AS receipt',
    [JSON.stringify(identity(value)), token],
  );
  return result.rows[0].receipt;
}
async function reconcile(value, token, reason = 'effect_failed', client = service) {
  const result = await client.query(
    'SELECT akasha_ai.reconcile_stripe_webhook_event($1::jsonb,$2::uuid,$3::text) AS receipt',
    [JSON.stringify(identity(value)), token, reason],
  );
  return result.rows[0].receipt;
}
async function row(value) {
  const result = await owner.query(
    'SELECT * FROM akasha_ai.stripe_webhook_journal WHERE stripe_account_key=$1 AND livemode=$2 AND event_id=$3',
    [value.stripe_account_key, value.livemode, value.event_id],
  );
  assert.equal(result.rows.length, 1);
  return result.rows[0];
}
async function lockWitness(prefix, expected) {
  const deadline = Date.now() + 5000;
  let count = 0;
  while (Date.now() < deadline) {
    await owner.query('SELECT pg_stat_clear_snapshot()');
    const result = await owner.query(
      "SELECT count(*)::integer AS count FROM pg_stat_activity WHERE application_name LIKE $1 AND wait_event_type='Lock'",
      [prefix + '%'],
    );
    count = result.rows[0].count;
    if (count === expected) break;
    await delay(20);
  }
  observations.push({ kind: 'real_postgresql_lock_waiters', prefix, expected, observed: count });
  assert.equal(count, expected, 'Witness must observe real PostgreSQL lock contention');
}

before(async () => {
  owner = await connect();
  const result = await owner.query(
    "SELECT current_setting('data_directory') AS data, current_setting('listen_addresses') AS listen, " +
    "current_setting('unix_socket_directories') AS socket, current_setting('port') AS port",
  );
  assert.deepEqual(result.rows[0], { data: expectedData, listen: '', socket: host, port: String(port) });
  const fresh = await owner.query(
    "SELECT (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')) + " +
    "(SELECT count(*) FROM pg_namespace WHERE nspname IN ('auth','akasha_ai','purama_ai')) AS count",
  );
  assert.equal(Number(fresh.rows[0].count), 0, 'Refuse an initialized application database');
  await owner.query(
    'CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN; ' +
    'CREATE SCHEMA akasha_ai; GRANT USAGE ON SCHEMA akasha_ai TO anon, authenticated, service_role;',
  );
  service = await connect('service_role');
});

after(async () => {
  await writeFile(path.join(proofDir, 'native-observations.json'), JSON.stringify(observations, null, 2) + '\n', { flag: 'wx' });
  const results = await Promise.allSettled([...clients].map(client => client.end()));
  assert.equal(results.filter(result => result.status === 'rejected').length, 0, 'All private database clients must close');
});

test('migration refuses absent legacy evidence and rolls back its own DDL', async () => {
  await assert.rejects(owner.query(migration), /Legacy Stripe claim tables must be preserved/);
  await owner.query('ROLLBACK');
  const result = await owner.query("SELECT to_regclass('akasha_ai.stripe_webhook_journal') AS relation");
  assert.equal(result.rows[0].relation, null);
});

test('migration installs the journal while preserving both historical claim tables', async () => {
  await owner.query(legacyDefinition[0]);
  await owner.query(processedMigration);
  await owner.query("INSERT INTO akasha_ai.stripe_events(event_id,type) VALUES('evt_legacy_internal','checkout.session.completed')");
  await owner.query("INSERT INTO akasha_ai.stripe_events_processed(event_id,event_type) VALUES('evt_legacy_public','checkout.session.completed')");
  await owner.query(migration);
  const result = await owner.query(
    'SELECT (SELECT count(*) FROM akasha_ai.stripe_events)::integer AS internal, ' +
    '(SELECT count(*) FROM akasha_ai.stripe_events_processed)::integer AS external',
  );
  assert.deepEqual(result.rows[0], { internal: 1, external: 1 });
});

const first = envelope('evt_first');
let firstToken;
test('a fresh authenticated envelope receives one durable owner token', async () => {
  const result = await admit(first);
  firstToken = result.requested_token;
  assert.equal(result.admitted, true);
  assert.equal(result.state, 'processing');
  assert.equal(result.attempt_token, firstToken);
  assert.equal(result.legacy, false);
  assert.equal((await row(first)).fingerprint, first.fingerprint);
});

test('a pending replay cannot acquire or learn the existing owner token', async () => {
  const result = await admit(first);
  assert.equal(result.admitted, false);
  assert.equal(result.state, 'processing');
  assert.equal(result.attempt_token, null);
  assert.equal((await row(first)).attempt_token, firstToken);
});

test('changed semantic content is rejected even when a supplied fingerprint is unchanged', async () => {
  const changed = { ...first, event_data: { object: { id: 'cs_contradictory' } } };
  await assert.rejects(admit(changed), error => error.code === '22023');
  assert.deepEqual((await row(first)).event_data, first.event_data);
});

test('changed fingerprint is rejected without overwriting the original observation', async () => {
  await assert.rejects(admit({ ...first, fingerprint: 'a'.repeat(64) }), error => error.code === '22023');
  assert.equal((await row(first)).fingerprint, first.fingerprint);
});

test('another attempt token cannot complete or reconcile an owned event', async () => {
  await assert.rejects(complete(first, randomUUID()), error => error.code === '55000');
  await assert.rejects(reconcile(first, randomUUID()), error => error.code === '55000');
  assert.equal((await row(first)).state, 'processing');
});

test('completion cannot cross account, mode or fingerprint boundaries', async () => {
  for (const change of [
    { stripe_account_key: 'acct_other' }, { livemode: true }, { fingerprint: 'b'.repeat(64) },
  ]) {
    await assert.rejects(complete({ ...first, ...change }, firstToken), error => error.code === '55000');
  }
  assert.equal((await row(first)).state, 'processing');
});

test('only a confirmed completion permits a completed duplicate receipt', async () => {
  const result = await complete(first, firstToken);
  assert.equal(result.completed, true);
  assert.equal(result.attempt_token, firstToken);
  const duplicate = await admit(first);
  assert.equal(duplicate.admitted, false);
  assert.equal(duplicate.state, 'completed');
  assert.equal(duplicate.attempt_token, null);
  assert.ok((await row(first)).completed_at);
});

test('repeating completion with its original owner does not change the completed timestamp', async () => {
  const before = (await row(first)).completed_at.toISOString();
  await complete(first, firstToken);
  assert.equal((await row(first)).completed_at.toISOString(), before);
});

test('a lost completion response cannot cause a downgrade during reconciliation', async () => {
  const result = await reconcile(first, firstToken, 'completion_unconfirmed');
  assert.equal(result.state, 'completed');
  assert.equal((await row(first)).reconciliation_reason, null);
});

test('a partially completed attempt is retained and cannot be completed or replayed automatically', async () => {
  const value = envelope('evt_partial');
  const ownerReceipt = await admit(value);
  await reconcile(value, ownerReceipt.requested_token);
  const retry = await admit(value);
  assert.equal(retry.admitted, false);
  assert.equal(retry.state, 'reconciliation_required');
  await assert.rejects(complete(value, ownerReceipt.requested_token), error => error.code === '55000');
  assert.equal((await row(value)).reconciliation_reason, 'effect_failed');
});

test('a claim in either historical table requires reconciliation and remains untouched', async () => {
  for (const id of ['evt_legacy_internal', 'evt_legacy_public']) {
    const value = envelope(id);
    const result = await admit(value);
    assert.equal(result.admitted, false);
    assert.equal(result.legacy, true);
    assert.equal(result.state, 'reconciliation_required');
    await assert.rejects(complete(value, result.requested_token), error => error.code === '55000');
  }
  const result = await owner.query(
    'SELECT (SELECT count(*) FROM akasha_ai.stripe_events)::integer AS internal, ' +
    '(SELECT count(*) FROM akasha_ai.stripe_events_processed)::integer AS external',
  );
  assert.deepEqual(result.rows[0], { internal: 1, external: 1 });
});

test('account and livemode form independent journal namespaces', async () => {
  const values = [
    envelope('evt_namespace'),
    envelope('evt_namespace', { stripe_account_key: 'acct_fixture' }),
    envelope('evt_namespace', { livemode: true }),
  ];
  for (const value of values) assert.equal((await admit(value)).admitted, true);
  const result = await owner.query("SELECT count(*)::integer AS count FROM akasha_ai.stripe_webhook_journal WHERE event_id='evt_namespace'");
  assert.equal(result.rows[0].count, 3);
});

test('different Event ids for the same economic object remain explicitly separate', async () => {
  const one = envelope('evt_same_object_one');
  const two = envelope('evt_same_object_two');
  assert.equal((await admit(one)).admitted, true);
  assert.equal((await admit(two)).admitted, true);
  assert.deepEqual((await row(one)).event_data, (await row(two)).event_data);
});

test('invalid envelope types or bounds fail without inserting a journal row', async () => {
  const value = envelope('evt_invalid');
  for (const change of [
    { version: 2 }, { livemode: 'false' }, { event_data: [] },
    { event_created: -1 }, { event_type: '' }, { fingerprint: 'not-a-fingerprint' },
    { event_id: 'not_an_event' }, { stripe_account_key: '' },
  ]) await assert.rejects(admit({ ...value, ...change }));
  const result = await owner.query("SELECT count(*)::integer AS count FROM akasha_ai.stripe_webhook_journal WHERE event_id='evt_invalid'");
  assert.equal(result.rows[0].count, 0);
});

test('service_role can inspect evidence but cannot mutate or delete journal rows directly', async () => {
  await service.query('SELECT event_id FROM akasha_ai.stripe_webhook_journal LIMIT 1');
  for (const query of [
    "UPDATE akasha_ai.stripe_webhook_journal SET state='processing' WHERE false",
    'DELETE FROM akasha_ai.stripe_webhook_journal WHERE false',
    'INSERT INTO akasha_ai.stripe_webhook_journal DEFAULT VALUES',
  ]) await assert.rejects(service.query(query), error => error.code === '42501');
});

test('anon and authenticated cannot read the journal or execute any of its mutation RPCs', async () => {
  for (const role of ['anon', 'authenticated']) {
    const client = await connect(role);
    await assert.rejects(client.query('SELECT * FROM akasha_ai.stripe_webhook_journal'), error => error.code === '42501');
    await assert.rejects(admit(envelope('evt_acl_' + role), randomUUID(), client), error => error.code === '42501');
    await assert.rejects(complete(first, firstToken, client), error => error.code === '42501');
    await assert.rejects(reconcile(first, firstToken, 'effect_failed', client), error => error.code === '42501');
  }
});

test('losing a historical table at runtime fails closed and does not fabricate a fresh owner', async () => {
  const value = envelope('evt_missing_legacy_runtime');
  await owner.query('BEGIN');
  try {
    await owner.query('ALTER TABLE akasha_ai.stripe_events RENAME TO stripe_events_unavailable_fixture');
    await assert.rejects(admit(value, randomUUID(), owner), error => error.code === '42P01');
  } finally {
    await owner.query('ROLLBACK');
  }
  const result = await owner.query("SELECT count(*)::integer AS count FROM akasha_ai.stripe_webhook_journal WHERE event_id='evt_missing_legacy_runtime'");
  assert.equal(result.rows[0].count, 0);
});

test('eight real backends contend on one event and only its committed insert owns execution', async () => {
  const value = envelope('evt_concurrent_admission');
  const group = await Promise.all(Array.from({ length: 8 }, (_, index) =>
    connect('service_role', 'akasha-journal-admit-' + index)));
  let pending = [];
  let transaction = false;
  try {
    await group[0].query('BEGIN'); transaction = true;
    const firstReceipt = await admit(value, randomUUID(), group[0]);
    assert.equal(firstReceipt.admitted, true);
    pending = group.slice(1).map(client => admit(value, randomUUID(), client));
    await lockWitness('akasha-journal-admit-', 7);
    await group[0].query('COMMIT'); transaction = false;
    const receipts = [firstReceipt, ...await Promise.all(pending)];
    assert.equal(receipts.filter(receipt => receipt.admitted).length, 1);
    assert.ok(receipts.slice(1).every(receipt => receipt.state === 'processing' && receipt.attempt_token === null));
    assert.equal((await row(value)).attempt_token, firstReceipt.requested_token);
  } finally {
    if (transaction) await group[0].query('ROLLBACK');
    await Promise.allSettled(pending);
    await Promise.all(group.map(async client => { await client.end(); clients.delete(client); }));
  }
});

test('completion and reconciliation serialize under a real row lock without contradictory final states', async () => {
  const value = envelope('evt_terminal_race');
  const admitted = await admit(value);
  const finishClient = await connect('service_role', 'akasha-journal-terminal-complete');
  const failClient = await connect('service_role', 'akasha-journal-terminal-reconcile');
  let pending = [];
  await owner.query('BEGIN');
  try {
    await owner.query('SELECT 1 FROM akasha_ai.stripe_webhook_journal WHERE event_id=$1 FOR UPDATE', [value.event_id]);
    pending = [
      complete(value, admitted.requested_token, finishClient),
      reconcile(value, admitted.requested_token, 'effect_failed', failClient),
    ];
    // Attach rejection handlers before release; either legal serialized order is accepted.
    const settled = Promise.allSettled(pending);
    await lockWitness('akasha-journal-terminal-', 2);
    await owner.query('COMMIT');
    const results = await settled;
    const final = await row(value);
    assert.ok(['completed', 'reconciliation_required'].includes(final.state));
    if (final.state === 'completed') {
      assert.equal(results[0].status, 'fulfilled');
      assert.equal(results[1].status, 'fulfilled');
      assert.equal(results[1].value.state, 'completed');
    } else {
      assert.equal(results[0].status, 'rejected');
      assert.equal(results[0].reason.code, '55000');
      assert.equal(results[1].status, 'fulfilled');
    }
  } finally {
    await owner.query('ROLLBACK');
    await Promise.allSettled(pending);
  }
});

test('a rolled back admission leaves no durable owner and can be admitted afresh', async () => {
  const value = envelope('evt_rolled_back');
  await service.query('BEGIN');
  const tentative = await admit(value);
  assert.equal(tentative.admitted, true);
  await service.query('ROLLBACK');
  const actual = await admit(value);
  assert.equal(actual.admitted, true);
  assert.notEqual(actual.attempt_token, tentative.attempt_token);
});

test('an old processing timestamp never enables timeout takeover', async () => {
  const value = envelope('evt_old_processing');
  const firstReceipt = await admit(value);
  await owner.query("UPDATE akasha_ai.stripe_webhook_journal SET received_at='2000-01-01',updated_at='2000-01-01' WHERE event_id=$1", [value.event_id]);
  const later = await admit(value);
  assert.equal(later.admitted, false);
  assert.equal(later.state, 'processing');
  assert.equal((await row(value)).attempt_token, firstReceipt.attempt_token);
});

test('RPC security-definer search paths and row-level security are installed as declared', async () => {
  const result = await owner.query(
    "SELECT proname, prosecdef, proconfig FROM pg_proc JOIN pg_namespace ON pg_namespace.oid=pronamespace " +
    "WHERE nspname='akasha_ai' AND proname IN " +
    "('admit_stripe_webhook_event','complete_stripe_webhook_event','reconcile_stripe_webhook_event') ORDER BY proname",
  );
  assert.equal(result.rows.length, 3);
  for (const value of result.rows) {
    assert.equal(value.prosecdef, true);
    assert.ok(value.proconfig.includes('search_path=pg_catalog, akasha_ai'));
  }
  const rls = await owner.query("SELECT relrowsecurity FROM pg_class WHERE oid='akasha_ai.stripe_webhook_journal'::regclass");
  assert.equal(rls.rows[0].relrowsecurity, true);
});
