import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Native SQL contract only: no HTTP auth, provider or private matching engine.
const required = name => {
  assert.ok(process.env[name], 'Explicit synthetic setting required: ' + name);
  return process.env[name];
};
const host = required('AKASHA_ENTRAIDE_TEST_PG_HOST');
const port = Number(required('AKASHA_ENTRAIDE_TEST_PG_PORT'));
const user = required('AKASHA_ENTRAIDE_TEST_PG_USER');
const expectedData = required('AKASHA_ENTRAIDE_TEST_PG_DATA');
const driverUrl = required('AKASHA_ENTRAIDE_TEST_PG_DRIVER');
const proofDir = required('AKASHA_ENTRAIDE_TEST_PROOF_DIR');
assert.ok(path.isAbsolute(host) && path.isAbsolute(expectedData) && path.isAbsolute(proofDir));
assert.ok(Number.isSafeInteger(port) && port > 0 && port <= 65535);
assert.ok(driverUrl.startsWith('file:'));
const ownership = JSON.parse(await readFile(path.join(path.dirname(expectedData), 'OWNERSHIP.json'), 'utf8'));
assert.equal(ownership.kind, 'purama-akasha-entraide-native');
assert.equal(ownership.run_id, required('AKASHA_ENTRAIDE_TEST_RUN_ID'));
assert.equal(ownership.token, required('AKASHA_ENTRAIDE_TEST_OWNER_TOKEN'));
assert.equal(expectedData, path.join(ownership.cluster, 'data'));
assert.equal(host, path.join(ownership.cluster, 'socket'));
const imported = await import(driverUrl);
const { Client } = imported.default ?? imported;
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const migrationPaths = [
  'supabase/migrations/20260904_entraide_social_layer.sql',
  'supabase/migrations/20260905_entraide_profile_privacy.sql',
];
const migrations = await Promise.all(migrationPaths.map(async relative => {
  const bytes = await readFile(path.join(repo, relative));
  return { relative, sql: bytes.toString('utf8'), sha256: createHash('sha256').update(bytes).digest('hex') };
}));
const publicColumns = [
  'user_id', 'skills_offered', 'skills_needed', 'availability_days',
  'radius_km', 'created_at', 'updated_at',
];
const publicProjection = publicColumns.join(', ');
const people = {
  A: '11111111-1111-4111-8111-111111111111',
  B: '22222222-2222-4222-8222-222222222222',
  C: '33333333-3333-4333-8333-333333333333',
  D: '44444444-4444-4444-8444-444444444444',
};
const clients = new Set();
const observations = [{
  kind: 'scope',
  migrations: migrations.map(({ relative, sha256 }) => ({ relative, sha256 })),
  synthetic_users: Object.values(people),
  service_role_bypassrls: 'Synthetic fixture contract, not a production role attestation.',
  auth_uid: 'Synthetic request claim; HTTP authentication is outside this suite.',
  public_profile_policy: 'Seven public columns remain readable even for blocked neighbours.',
  candidate_oracle: 'SQL data contract; application serialization and private matching are separate gates.',
}];
let owner;
let authenticated;
let service;

async function connect(role = null, actor = null) {
  const client = new Client({
    host, port, user, database: 'postgres', password: '',
    application_name: 'akasha-entraide-native',
    connectionTimeoutMillis: 5000, query_timeout: 8000, statement_timeout: 7000,
  });
  clients.add(client);
  await client.connect();
  if (role) {
    assert.ok(['anon', 'authenticated', 'service_role'].includes(role));
    await client.query('SET ROLE ' + role);
  }
  if (actor) await client.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [actor]);
  return client;
}

async function denied(label, query) {
  await assert.rejects(query, error => {
    assert.equal(error.code, '42501', label + ' must fail on privilege/RLS, not a different SQL error');
    observations.push({ kind: 'expected_denial', label, sqlstate: error.code, assertion: 'PASS' });
    return true;
  });
}

async function profile(id, client = owner) {
  const result = await client.query('SELECT * FROM akasha_ai.entraide_profils WHERE user_id = $1', [id]);
  assert.equal(result.rows.length, 1);
  return result.rows[0];
}

before(async () => {
  owner = await connect();
  const identity = await owner.query(
    "SELECT current_setting('data_directory') AS data, current_setting('listen_addresses') AS listen, " +
    "current_setting('unix_socket_directories') AS socket, current_setting('port') AS port",
  );
  assert.deepEqual(identity.rows[0], { data: expectedData, listen: '', socket: host, port: String(port) });
  const fresh = await owner.query(
    "SELECT (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')) + " +
    "(SELECT count(*) FROM pg_namespace WHERE nspname IN ('auth','akasha_ai','purama_ai')) AS count",
  );
  assert.equal(Number(fresh.rows[0].count), 0, 'Refuse any initialized application database');
  await owner.query(`
    CREATE ROLE anon NOLOGIN NOBYPASSRLS;
    CREATE ROLE authenticated NOLOGIN NOBYPASSRLS;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE SCHEMA akasha_ai;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      SET search_path = pg_catalog
      AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA akasha_ai TO anon, authenticated, service_role;
    GRANT USAGE ON SCHEMA auth TO authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role;
  `);
  for (const migration of migrations) await owner.query(migration.sql);
  for (const [index, [name, id]] of Object.entries(people).entries()) {
    await owner.query('INSERT INTO auth.users(id) VALUES($1)', [id]);
    await owner.query(
      'INSERT INTO akasha_ai.entraide_profils ' +
      '(user_id, skills_offered, skills_needed, availability_days, radius_km, location_lat, location_lng) ' +
      'VALUES($1, $2, $3, $4, $5, $6, $7)',
      [id, ['synthetic-' + name], ['fixture-help'], ['mon'], 10 + index, 11.25 + index, 12.5 + index],
    );
  }
  await owner.query(
    'INSERT INTO akasha_ai.entraide_blocages(blocker_id, blocked_id) VALUES($1,$2),($3,$1)',
    [people.A, people.B, people.C],
  );
  authenticated = await connect('authenticated', people.A);
  service = await connect('service_role');
  const actor = await authenticated.query('SELECT current_user AS role, auth.uid() AS actor');
  assert.deepEqual(actor.rows[0], { role: 'authenticated', actor: people.A });
});

after(async () => {
  try {
    await writeFile(path.join(proofDir, 'native-observations.json'), JSON.stringify(observations, null, 2) + '\n', { flag: 'wx' });
  } finally {
    const results = await Promise.allSettled([...clients].map(client => client.end()));
    assert.equal(results.filter(result => result.status === 'rejected').length, 0, 'Every private SQL client must close');
  }
});

test('versioned migrations grant exactly seven public columns and preserve RLS role separation', async () => {
  const columns = await owner.query(
    "SELECT column_name FROM information_schema.column_privileges " +
    "WHERE table_schema='akasha_ai' AND table_name='entraide_profils' " +
    "AND grantee='authenticated' AND privilege_type='SELECT' ORDER BY column_name",
  );
  assert.deepEqual(columns.rows.map(row => row.column_name), [...publicColumns].sort());
  const privileges = await owner.query(
    "SELECT has_table_privilege('authenticated','akasha_ai.entraide_profils','SELECT') AS whole_table, " +
    "has_column_privilege('authenticated','akasha_ai.entraide_profils','location_lat','SELECT') AS latitude, " +
    "has_column_privilege('authenticated','akasha_ai.entraide_profils','location_lng','SELECT') AS longitude",
  );
  assert.deepEqual(privileges.rows[0], { whole_table: false, latitude: false, longitude: false });
  const roles = await owner.query(
    "SELECT rolname, rolsuper, rolbypassrls FROM pg_roles " +
    "WHERE rolname IN ('authenticated','service_role') ORDER BY rolname",
  );
  assert.deepEqual(roles.rows, [
    { rolname: 'authenticated', rolsuper: false, rolbypassrls: false },
    { rolname: 'service_role', rolsuper: false, rolbypassrls: true },
  ]);
  const tables = await owner.query(
    "SELECT c.relname, c.relrowsecurity, pg_get_userbyid(c.relowner) AS owner FROM pg_class c " +
    "JOIN pg_namespace n ON n.oid=c.relnamespace " +
    "WHERE n.nspname='akasha_ai' AND c.relname IN ('entraide_profils','entraide_blocages') ORDER BY c.relname",
  );
  assert.equal(tables.rows.length, 2);
  assert.ok(tables.rows.every(row => row.relrowsecurity && row.owner === user));
  observations.push({ kind: 'effective_acl', public_columns: publicColumns, table_select: false, roles: roles.rows });
});

test('authenticated SELECT star fails even when restricted to the authenticated owner', async () => {
  await denied('own_profile_select_star', authenticated.query(
    'SELECT * FROM akasha_ai.entraide_profils WHERE user_id=$1', [people.A],
  ));
});

test('authenticated own-profile projection returns exactly the seven allowed columns', async () => {
  const result = await authenticated.query(
    'SELECT ' + publicProjection + ' FROM akasha_ai.entraide_profils WHERE user_id=$1', [people.A],
  );
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].user_id, people.A);
  assert.deepEqual(result.fields.map(field => field.name), publicColumns);
  assert.deepEqual(Object.keys(result.rows[0]).sort(), [...publicColumns].sort());
});

test('authenticated clients cannot explicitly read coordinates for self or another profile', async () => {
  for (const [label, id] of [['self_coordinates', people.A], ['other_coordinates', people.B]]) {
    await denied(label, authenticated.query(
      'SELECT location_lat, location_lng FROM akasha_ai.entraide_profils WHERE user_id=$1', [id],
    ));
  }
});

test('authenticated upsert with RETURNING star fails atomically without changing the own profile', async () => {
  const beforeValue = await profile(people.A);
  await denied('own_profile_upsert_returning_star', authenticated.query(
    'INSERT INTO akasha_ai.entraide_profils(user_id,skills_offered) VALUES($1,$2) ' +
    'ON CONFLICT(user_id) DO UPDATE SET skills_offered=EXCLUDED.skills_offered RETURNING *',
    [people.A, ['attempt-must-not-persist']],
  ));
  assert.deepEqual(await profile(people.A), beforeValue);
});

test('authenticated writes can update own coordinates but cannot mutate or insert another identity', async () => {
  const ownBefore = await profile(people.A);
  const otherBefore = await profile(people.B);
  try {
    const own = await authenticated.query(
      'UPDATE akasha_ai.entraide_profils SET location_lat=$2, location_lng=$3 ' +
      'WHERE user_id=$1 RETURNING ' + publicProjection, [people.A, 45.5, -12.25],
    );
    assert.equal(own.rowCount, 1);
    assert.deepEqual(own.fields.map(field => field.name), publicColumns);
    const stored = await profile(people.A);
    assert.equal(stored.location_lat, 45.5);
    assert.equal(stored.location_lng, -12.25);
    const other = await authenticated.query(
      'UPDATE akasha_ai.entraide_profils SET skills_offered=$2 WHERE user_id=$1 RETURNING user_id',
      [people.B, ['forbidden-write']],
    );
    assert.equal(other.rowCount, 0);
    assert.deepEqual(await profile(people.B), otherBefore);
    await denied('other_identity_insert', authenticated.query(
      'INSERT INTO akasha_ai.entraide_profils(user_id,skills_offered) VALUES($1,$2) ON CONFLICT(user_id) DO NOTHING',
      [people.D, ['forbidden-insert']],
    ));
  } finally {
    await owner.query(
      'UPDATE akasha_ai.entraide_profils SET location_lat=$2, location_lng=$3 WHERE user_id=$1',
      [people.A, ownBefore.location_lat, ownBefore.location_lng],
    );
  }
  assert.deepEqual(await profile(people.A), ownBefore);
});

test('authenticated RLS hides incoming blocks even from a bidirectional request', async () => {
  const result = await authenticated.query(
    'SELECT blocker_id,blocked_id FROM akasha_ai.entraide_blocages ' +
    'WHERE blocker_id=$1 OR blocked_id=$1 ORDER BY blocker_id,blocked_id', [people.A],
  );
  assert.deepEqual(result.rows, [{ blocker_id: people.A, blocked_id: people.B }]);
  observations.push({ kind: 'authenticated_block_visibility', outgoing_count: 1, incoming_count: 0 });
});

test('synthetic service role can see both directions internally without weakening client RLS', async () => {
  const result = await service.query(
    'SELECT blocker_id,blocked_id FROM akasha_ai.entraide_blocages ' +
    'WHERE blocker_id=$1 OR blocked_id=$1 ORDER BY blocker_id,blocked_id', [people.A],
  );
  assert.deepEqual(result.rows, [
    { blocker_id: people.A, blocked_id: people.B },
    { blocker_id: people.C, blocked_id: people.A },
  ]);
  observations.push({ kind: 'service_block_visibility', outgoing_count: 1, incoming_count: 1 });
});

test('service query bound to the synthetic actor returns only that own profile with private coordinates', async () => {
  const own = await profile(people.A, service);
  assert.equal(own.user_id, people.A);
  assert.equal(own.location_lat, 11.25);
  assert.equal(own.location_lng, 12.5);
  assert.deepEqual(own.skills_offered, ['synthetic-A']);
});

test('server candidate oracle excludes self and both block directions and projects no coordinates', async () => {
  const result = await service.query(
    'SELECT ' + publicColumns.map(column => 'p.' + column).join(', ') +
    ' FROM akasha_ai.entraide_profils p WHERE p.user_id <> $1 AND NOT EXISTS (' +
    'SELECT 1 FROM akasha_ai.entraide_blocages b WHERE ' +
    '(b.blocker_id=$1 AND b.blocked_id=p.user_id) OR (b.blocked_id=$1 AND b.blocker_id=p.user_id)) ' +
    'ORDER BY p.user_id', [people.A],
  );
  assert.deepEqual(result.rows.map(row => row.user_id), [people.D]);
  assert.deepEqual(result.fields.map(field => field.name), publicColumns);
  assert.deepEqual(Object.keys(result.rows[0]).sort(), [...publicColumns].sort());
  // The database still permits all seven public fields for blocked profiles.
  // Matching exclusion must therefore be enforced by the server application.
  const publicRows = await authenticated.query(
    'SELECT ' + publicProjection + ' FROM akasha_ai.entraide_profils ORDER BY user_id',
  );
  assert.deepEqual(publicRows.rows.map(row => row.user_id), Object.values(people));
  assert.ok(publicRows.rows.every(row => !('location_lat' in row) && !('location_lng' in row)));
  observations.push({
    kind: 'candidate_projection', returned_candidates: 1, expected_candidate: people.D,
    public_columns: publicColumns, private_coordinate_keys: [], internal_block_keys: [],
    authenticated_public_profiles_readable: 4,
  });
});
