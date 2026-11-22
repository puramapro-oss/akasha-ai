import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const composedSql = [
  'tests/withdrawal-idempotency/fixtures/connect_withdrawals.sql',
  'supabase/migrations/20260926_daily_gift_atomic_claim.sql',
  'supabase/migrations/20260926_points_redeem_atomic.sql',
  'supabase/migrations/20261122165000_delivery_consistency.sql',
  'supabase/migrations/20261122165100_daily_gift_delivery.sql',
  'supabase/migrations/20261122165200_points_redemption_authority.sql',
  'supabase/migrations/20261122165300_profile_write_boundary.sql',
  'supabase/migrations/20261123010000_reward_boundaries.sql',
  'supabase/migrations/20261123010100_akasha_withdrawal_idempotency.sql',
  'supabase/migrations/20261123010200_email_sequence_delivery.sql',
  'supabase/migrations/20261123010300_social_share_tracking_atomic.sql',
  'supabase/migrations/20261123010400_delivery_receipts_export.sql',
];

/** Fresh, explicitly owned native PostgreSQL only. No application credentials or HTTP. */
export async function fixture(suite, tables, migrationPaths) {
  assert.ok(['share', 'email', 'withdrawal'].includes(suite));
  const prefix = `AKASHA_${suite.toUpperCase()}_TEST`;
  const setting = name => {
    const value = process.env[`${prefix}_${name}`];
    assert.ok(value, `Missing synthetic setting ${prefix}_${name}`);
    return value;
  };
  const host = setting('PG_HOST'), data = setting('PG_DATA'), proof = setting('PROOF_DIR');
  const port = Number(setting('PG_PORT')), user = setting('PG_USER');
  assert.ok(path.isAbsolute(host) && path.isAbsolute(data) && path.isAbsolute(proof));
  assert.ok(Number.isSafeInteger(port) && port > 0 && port <= 65535);
  const marker = JSON.parse(await readFile(path.join(path.dirname(data), 'OWNERSHIP.json'), 'utf8'));
  assert.equal(marker.kind, `purama-akasha-${suite}-native`);
  assert.equal(marker.run_id, setting('RUN_ID'));
  assert.equal(marker.token, setting('OWNER_TOKEN'));
  assert.equal(data, path.join(marker.cluster, 'data'));
  assert.equal(host, path.join(marker.cluster, 'socket'));
  const driver = setting('PG_DRIVER');
  assert.ok(driver.startsWith('file:'));
  const imported = await import(driver);
  const { Client } = imported.default ?? imported;
  const clients = new Set();
  const observations = [{ kind: 'scope', suite,
    authentication: 'Synthetic session claim; real HTTP authentication is a separate gate.',
    providers: 'None. Native SQL only.',
  }];
  const connect = async (role = null, actor = null) => {
    const client = new Client({ host, port, user, database: 'postgres', password: '',
      application_name: `akasha-${suite}-qualification`, connectionTimeoutMillis: 5000,
      query_timeout: 15000, statement_timeout: 12000 });
    clients.add(client);
    await client.connect();
    if (role) {
      assert.ok(['anon', 'authenticated', 'service_role'].includes(role));
      await client.query('SET ROLE ' + role);
    }
    if (actor) await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [actor]);
    return client;
  };
  try {
    const owner = await connect();
    const identity = (await owner.query("SELECT current_setting('data_directory') AS data, " +
      "current_setting('listen_addresses') AS listen, current_setting('unix_socket_directories') AS socket")).rows[0];
    assert.deepEqual(identity, { data, listen: '', socket: host });
    const initial = await owner.query("SELECT count(*)::int AS count FROM pg_namespace WHERE nspname IN ('auth','akasha_ai')");
    assert.equal(initial.rows[0].count, 0, 'Never initialize a pre-existing application database');
    await owner.query(`
      CREATE ROLE anon NOLOGIN NOBYPASSRLS;
      CREATE ROLE authenticated NOLOGIN NOBYPASSRLS;
      CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE SCHEMA akasha_ai;
      CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}');
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE SET search_path=pg_catalog
        AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      GRANT USAGE ON SCHEMA auth,akasha_ai TO anon,authenticated,service_role;
      GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;
    `);
    const apply = async relative => {
      const bytes = await readFile(path.join(repo, relative));
      observations.push({ kind: 'source', path: relative, sha256: createHash('sha256').update(bytes).digest('hex') });
      await owner.query(bytes.toString('utf8'));
    };
    // Each suite exercises the final nine-migration composition, including the
    // actual signup trigger and inherited reward/profile guards.
    await apply('schema.sql');
    for (const table of tables) {
      assert.match(table, /^[a-z_]+$/);
      const found = await owner.query('SELECT to_regclass($1) IS NOT NULL AS present', ['akasha_ai.' + table]);
      assert.equal(found.rows[0].present, true, 'Versioned schema definition missing for ' + table);
    }
    await owner.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA akasha_ai TO authenticated,service_role');
    // Reproduce the old permissive ownership policy, so the new restrictive policies
    // must resist an authenticated client with ordinary table privileges.
    for (const table of ['social_shares', 'point_transactions', 'notification_preferences', 'email_sequences']) {
      if (!tables.includes(table)) continue;
      await owner.query(`ALTER TABLE akasha_ai.${table} ENABLE ROW LEVEL SECURITY;
        CREATE POLICY fixture_own_rows ON akasha_ai.${table} FOR ALL TO authenticated
        USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id)`);
    }
    for (const relative of migrationPaths) assert.ok(composedSql.includes(relative), 'Unknown suite prerequisite');
    for (const relative of composedSql) await apply(relative);
    const createUser = async (balance = 100) => {
      const id = randomUUID(), code = 'fixture-' + id;
      await owner.query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [id, id + '@example.invalid']);
      await owner.query('UPDATE akasha_ai.profiles SET referral_code=$2,wallet_balance=$3 WHERE id=$1',
        [id, code, balance]);
      return { id, code, email: id + '@example.invalid' };
    };
    const observeLock = async (waiting, blocking, label) => {
      const deadline = Date.now() + 4000;
      let observed;
      do {
        const result = await owner.query('SELECT pid,wait_event_type,wait_event,pg_blocking_pids(pid) AS blockers ' +
          'FROM pg_stat_activity WHERE pid=$1', [waiting.processID]);
        const row = result.rows[0];
        if (row?.wait_event_type === 'Lock' && row.blockers.includes(blocking.processID)) { observed = row; break; }
        await new Promise(resolve => setTimeout(resolve, 10));
      } while (Date.now() < deadline);
      assert.ok(observed, 'PostgreSQL must witness the expected lock: ' + label);
      observations.push({ kind: 'native_lock', label, ...observed });
    };
    const close = async () => {
      try { await writeFile(path.join(proof, 'native-observations.json'), JSON.stringify(observations, null, 2) + '\n', { flag: 'wx' }); }
      finally {
        const results = await Promise.allSettled([...clients].map(client => client.end()));
        assert.equal(results.filter(result => result.status === 'rejected').length, 0);
      }
    };
    const releaseClients = async () => {
      const temporary = [...clients].filter(client => client !== owner);
      const results = await Promise.allSettled(temporary.map(client => client.end()));
      temporary.forEach(client => clients.delete(client));
      assert.equal(results.filter(result => result.status === 'rejected').length, 0);
    };
    return { owner, connect, createUser, observeLock, apply, close, releaseClients, observations, repo };
  } catch (error) {
    // The caller has no fixture yet if initialization fails. Release connections
    // here so an invalid schema fails promptly instead of waiting for runner timeout.
    await Promise.allSettled([...clients].map(client => client.end()));
    throw error;
  }
}
