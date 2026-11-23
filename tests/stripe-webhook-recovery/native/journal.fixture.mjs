import { before, after } from 'node:test';
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
  try {
    await writeFile(path.join(proofDir, 'native-observations.json'), JSON.stringify(observations, null, 2) + '\n', { flag: 'wx' });
  } finally {
    const results = await Promise.allSettled([...clients].map(client => client.end()));
    assert.equal(results.filter(result => result.status === 'rejected').length, 0, 'All private database clients must close');
  }
});

export { owner, service, clients, migration, processedMigration, legacyDefinition, connect, envelope, admit, complete, reconcile, row, lockWitness };
