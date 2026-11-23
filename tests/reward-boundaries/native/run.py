#!/usr/bin/env python3
"""Qualify reward write boundaries on exact SQL in a disposable, socket-free PostgreSQL.

This proves sequential transactions, constraints and actual role permissions.
It does not claim simultaneous-session or deployed PostgREST qualification.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import tempfile


def run_owned(command, *, timeout, input=None, **kwargs):
    process = subprocess.Popen(command, stdin=subprocess.PIPE if input is not None else None,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, start_new_session=True, **kwargs)
    try:
        stdout, stderr = process.communicate(input=input, timeout=timeout)
    except BaseException:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.communicate(timeout=5)
        raise
    return subprocess.CompletedProcess(command, process.returncode, stdout, stderr)


def standalone_transport(sql):
    """Avoid blank-line command delimiters without changing stored function bodies.

    Encode dollar-quoted SQL literals as equivalent escaped string literals.
    Comments, ordinary strings and identifiers are tokens too, so dollar signs
    inside them cannot be mistaken for a new literal. Only formatting outside
    these literals may then lose blank lines in the standalone -j transport.
    The database fingerprint gates verify the resulting prosrc byte-for-byte.
    """
    tokens = re.compile(
        r'--[^\n]*|/\*[\s\S]*?\*/|'
        r"E'(?:\\.|''|[^'])*'|'(?:''|[^'])*'|"
        r'"(?:""|[^"])*"|'
        r'(?P<tag>\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$)(?P<body>[\s\S]*?)(?P=tag)')

    def replace(match):
        body = match.group('body')
        if body is None:
            return match.group(0)
        return "E'" + body.replace('\\', '\\\\').replace("'", "\\'").replace('\r', '\\r').replace('\n', '\\n') + "'"

    encoded = tokens.sub(replace, sql)
    return '\n'.join(line for line in encoded.splitlines() if line.strip())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pg-bin-dir', type=Path, required=True)
    parser.add_argument('--evidence-dir', type=Path, required=True)
    parser.add_argument('--before-hardening', action='store_true',
                        help='Negative control on the published migrations; genuine failures remain failures')
    args = parser.parse_args()
    directory = Path(__file__).resolve().parent
    root = directory.parents[2]
    environment = {key: value for key, value in os.environ.items() if not key.startswith('PG')}
    binaries = {name: args.pg_bin_dir.resolve() / name for name in ('postgres', 'initdb')}
    if any(not value.is_file() for value in binaries.values()):
        raise SystemExit('Existing native PostgreSQL binaries are required')
    paths = {
        'schema': root / 'schema.sql',
        'prior_claim': root / 'supabase/migrations/20260926_daily_gift_atomic_claim.sql',
        'redeem': root / 'supabase/migrations/20260926_points_redeem_atomic.sql',
        'published_share_email': root / 'supabase/migrations/20261122165000_delivery_consistency.sql',
        'published_gift': root / 'supabase/migrations/20261122165100_daily_gift_delivery.sql',
        'published_shop': root / 'supabase/migrations/20261122165200_points_redemption_authority.sql',
        'published_profile': root / 'supabase/migrations/20261122165300_profile_write_boundary.sql',
        'hardening': root / 'supabase/migrations/20261123010000_reward_boundaries.sql',
        'seed': directory / 'seed.sql', 'cases': directory / 'cases.sql',
        'profile_cases': directory / 'profile-cases.sql', 'legacy_columns': directory / 'legacy-column-grants.sql',
        'historical_email_rpc': directory / '4123-email-rpc.sql',
        'shared_withdrawal_fixture': root / 'tests/withdrawal-idempotency/fixtures/connect_withdrawals.sql',
        'withdrawal_overlay': root / 'supabase/migrations/20261123010100_akasha_withdrawal_idempotency.sql',
        'email_overlay': root / 'supabase/migrations/20261123010200_email_sequence_delivery.sql',
        'share_overlay': root / 'supabase/migrations/20261123010300_social_share_tracking_atomic.sql',
        'export_overlay': root / 'supabase/migrations/20261123010400_delivery_receipts_export.sql',
        'composed_cases': directory / 'composed-cases.sql',
    }
    sources = {key: path.read_bytes().decode('utf-8') for key, path in paths.items()}
    expected_routines = [
        ('share', 'akasha_ai.record_social_share(uuid,text,text)', 'published_share_email'),
        ('gift', 'akasha_ai.claim_daily_gift(uuid,text,integer,integer)', 'published_gift'),
        ('shop', 'akasha_ai.redeem_points_reward(uuid,integer,text,uuid)', 'published_shop'),
        ('email', 'akasha_ai.record_email_sequence_delivery(uuid,text)', 'published_share_email'),
        ('stats', 'akasha_ai.get_social_share_stats()', 'published_share_email'),
    ]
    routine_sources = {}
    routine_md5 = {}
    for label, signature, source in expected_routines:
        name = signature.split('(')[0]
        match = re.search(r'CREATE OR REPLACE FUNCTION ' + re.escape(name) +
                          r'\([\s\S]*?AS \$\$([\s\S]*?)\$\$;', sources[source])
        if not match:
            raise RuntimeError('Published function definition missing: ' + signature)
        routine_sources[label] = match.group(0)
        routine_md5[signature] = hashlib.md5(match.group(1).encode()).hexdigest()
        if "('" + signature + "', '" + routine_md5[signature] + "')" not in sources['hardening']:
            raise RuntimeError('Extension fingerprint differs from the published source: ' + signature)
    sha = lambda value: hashlib.sha256(value).hexdigest()
    args.evidence_dir.mkdir(parents=True, exist_ok=True)
    output = Path(tempfile.mkdtemp(prefix='boundaries-native-', dir=args.evidence_dir.resolve()))
    # Keep disposable database pages off the evidence volume. This is still
    # socket-free standalone PostgreSQL, with the same permissions and binary.
    cluster_root = Path(tempfile.mkdtemp(prefix='akasha-boundaries-pg-'))
    cluster = cluster_root / 'data'
    receipt = {
        'status': 'RUNNING', 'mode': 'postgres-native-single-user', 'steps': [],
        'postgres_version': None,
        'binary_sha256': sha(binaries['postgres'].read_bytes()),
        'source_sha256': {key: sha(value.encode()) for key, value in sources.items()},
        'runner_sha256': sha(Path(__file__).read_bytes()),
        'published_prosrc_md5': routine_md5,
        'hardening_applied': not args.before_hardening,
        'behavior_cases': [], 'baseline_only_omissions': [],
        'concurrent_sessions': 0, 'remote_connections': 0, 'provider_calls': 0,
        'cluster_removed': False,
    }

    def save():
        (output / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')

    def run(label, sql, expected_error=None, fail_fast=True):
        marker = 'AKASHA_BOUNDARIES_NATIVE_PASS_' + label
        (output / (label + '.sql')).write_text(sql)
        transport = standalone_transport(sql)
        if expected_error:
            # A migration error can abort the whole input group. Roll back in
            # a distinct group and require the final marker as well as the
            # exact expected rejection; an arbitrary SQL error is not a pass.
            transport += "\n\nROLLBACK; SELECT '" + marker + "';\n\n"
        else:
            transport += "\nSELECT '" + marker + "';\n\n"
        process = run_owned([str(binaries['postgres']), '--single', '-D', str(cluster), '-j',
                                  '-c', 'shared_buffers=16MB', 'postgres'], input=transport,
                                 timeout=45, env=environment)
        log = process.stdout + process.stderr
        (output / (label + '.log')).write_text(log)
        errors = re.findall(r'^.*(?:ERROR:|FATAL:|PANIC:).*$', log, re.M)
        errors_match = not errors if expected_error is None else len(errors) == 1 and expected_error in errors[0]
        passed = process.returncode == 0 and errors_match and marker in log
        row = {'name': label, 'status': 'PASS' if passed else 'FAIL', 'exit_code': process.returncode,
               'expected_error': expected_error, 'observed_errors': errors,
               'transport_sha256': sha(transport.encode())}
        receipt['steps'].append(row); save(); print(json.dumps(row), flush=True)
        if not passed and fail_fast:
            raise RuntimeError('Native reward boundary gate failed: ' + label)
        return passed

    try:
        version = run_owned([str(binaries['postgres']), '--version'], timeout=5, env=environment)
        if version.returncode:
            raise RuntimeError('PostgreSQL version check failed')
        receipt['postgres_version'] = version.stdout.strip()
        initialized = run_owned([str(binaries['initdb']), '-D', str(cluster), '-U', 'postgres',
                                      '--auth-local=trust', '--auth-host=reject', '--encoding=UTF8',
                                      '--no-locale', '--no-sync'],
                                     timeout=45, env=environment)
        (output / 'initdb.log').write_text(initialized.stdout + initialized.stderr)
        if initialized.returncode:
            raise RuntimeError('Disposable PostgreSQL initdb failed')
        run('ordinary_oid_calibration', """
DO $$ DECLARE observed oid; attempts integer:=0; BEGIN LOOP
  CREATE TEMP TABLE daily_oid_probe(id integer);
  SELECT 'pg_temp.daily_oid_probe'::regclass::oid INTO observed;
  DROP TABLE daily_oid_probe;
  attempts:=attempts+1;
  EXIT WHEN observed>=16384;
  IF attempts>4096 THEN RAISE EXCEPTION 'OID calibration bound exceeded'; END IF;
END LOOP; END; $$;
""")
        run('platform_fixture', """
CREATE ROLE anon NOSUPERUSER NOBYPASSRLS;
CREATE ROLE authenticated NOSUPERUSER NOBYPASSRLS;
CREATE ROLE service_role NOSUPERUSER BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE SCHEMA akasha_ai;
GRANT USAGE ON SCHEMA akasha_ai TO anon, authenticated, service_role;
-- Platform ACL fixture, separate from the unchanged canonical CREATE TABLEs.
ALTER DEFAULT PRIVILEGES IN SCHEMA akasha_ai
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
""")
        run('canonical_schema', sources['schema'])
        run('historical_claim', sources['prior_claim'])
        run('historical_redeem', sources['redeem'])
        run('synthetic_legacy_column_grants', sources['legacy_columns'])
        published = ['published_share_email', 'published_gift', 'published_shop', 'published_profile']
        for name in published:
            run(name, sources[name])
        run('synthetic_history', sources['seed'])
        observed_routines = [row[1] for row in expected_routines] + [
            'akasha_ai.redeem_points(uuid,integer,text)', 'akasha_ai.handle_new_user()']
        definition_query = ('SELECT jsonb_object_agg(oid::regprocedure::text,pg_get_functiondef(oid)) '
                            'FROM pg_catalog.pg_proc WHERE oid IN (' +
                            ','.join("'" + signature + "'::regprocedure" for signature in observed_routines) + ')')
        run('snapshot_published_routines', 'CREATE TABLE reward_test.routine_snapshot(value jsonb); '
            'INSERT INTO reward_test.routine_snapshot ' + definition_query + ';')
        preserve_definitions = ('SELECT reward_test.check_true((SELECT value FROM reward_test.routine_snapshot)=('
                                + definition_query + "),'published and signup function definitions unchanged');")
        preserve_history = ("SELECT reward_test.check_true((SELECT value=reward_test.state() FROM reward_test.snapshot),"
                            "'history preserved');")
        if not args.before_hardening:
            run('reward_boundaries', sources['hardening'])
            run('preserve_canonical_definitions', preserve_definitions)
            # The filenames were already published at 4123. A database whose
            # ledger records those names must not pass with its earlier bodies.
            run('install_4123_email_revision', sources['historical_email_rpc'])
            run('reject_4123_email_revision', sources['hardening'],
                expected_error='Published reward RPC revision mismatch: akasha_ai.record_email_sequence_delivery(uuid,text)')
            old_source = re.search(r'AS \$\$([\s\S]*?)\$\$;', sources['historical_email_rpc']).group(1)
            run('preserve_and_restore_4123_email', preserve_history +
                "SELECT reward_test.check_true((SELECT md5(prosrc)='" + hashlib.md5(old_source.encode()).hexdigest() +
                "' FROM pg_proc WHERE oid='akasha_ai.record_email_sequence_delivery(uuid,text)'::regprocedure),"
                "'old revision refused without overwrite');\n" + routine_sources['email'] + '\n' + preserve_definitions)
            # A harmless comment changes each prosrc independently: an unknown
            # function revision must be refused even when its behavior is similar.
            for label, signature, _source in expected_routines:
                changed = routine_sources[label].replace('AS $$', 'AS $$\n-- Synthetic unknown revision.', 1)
                run('install_unknown_' + label, changed)
                run('reject_unknown_' + label, sources['hardening'],
                    expected_error='Published reward RPC revision mismatch: ' + signature)
                run('preserve_and_restore_' + label, preserve_history + '\n' + routine_sources[label] + '\n' + preserve_definitions)
        groups = {}
        for key in ['profile_cases', 'cases']:
            pieces = re.split(r'^-- CASE: ([a-z_0-9]+)\s*$', sources[key], flags=re.M)
            cases = {pieces[i]: pieces[i + 1] for i in range(1, len(pieces), 2)}
            if len(cases) != (31 if key == 'profile_cases' else 6):
                raise RuntimeError('Unexpected behavior case count: ' + key)
            groups[key] = cases
        if next(iter(groups['profile_cases'])) != 'profile_real_rls_precondition':
            raise RuntimeError('A genuine RLS control must run before permission gates')
        if not args.before_hardening:
            # A chain replay must retain the exact strengthened published bodies
            # and remove legacy direct grants again, without rewriting any history.
            run('legacy_grants_for_replay', sources['legacy_columns'].split('DO $$')[0])
            for name in published:
                run('replay_' + name, sources[name])
            run('replay_reward_boundaries', sources['hardening'])
            run('replay_profile_allowlist', groups['profile_cases']['profile_column_allowlist_is_exact'])
            run('replay_reward_acls', groups['cases']['reward_rpc_and_table_acls'])
            run('replay_history', groups['profile_cases']['profile_history_preserved'])
            run('replay_preserves_canonical_definitions', preserve_definitions)

            relations = ['profiles','streaks','social_shares','point_transactions','purama_points',
                         'daily_gifts','user_coupons','lottery_tickets','point_purchases','email_sequences']
            for relation in relations:
                column = 'id' if relation == 'profiles' else 'user_id'
                rights = [('trigger','TRIGGER','has_table_privilege'),
                          ('references','REFERENCES','has_table_privilege'),
                          ('column_references','REFERENCES (' + column + ')','has_any_column_privilege')]
                for kind, grant, privilege_function in rights:
                    label = relation + '_' + kind
                    check = privilege_function + "('authenticated','akasha_ai." + relation + "','" + ('TRIGGER' if kind == 'trigger' else 'REFERENCES') + "')"
                    run('inject_' + label, 'CREATE ROLE boundary_external NOLOGIN; GRANT ' + grant +
                        ' ON akasha_ai.' + relation + ' TO boundary_external; GRANT boundary_external TO authenticated;\n' +
                        'SELECT reward_test.check_true(' + check + ",'inherited fixture is effective');")
                    expected = ('Profile client roles retain inherited structural privileges' if relation in ['profiles','streaks']
                                else 'Reward client retains inherited structural privileges')
                    run('reject_' + label, sources['hardening'], expected_error=expected)
                    run('preserve_and_remove_' + label, 'SELECT reward_test.check_true(' + check +
                        ",'external grant preserved by failed migration');\n" +
                        "SELECT reward_test.check_true((SELECT value=reward_test.state() FROM reward_test.snapshot),'history preserved');\n" +
                        'REVOKE boundary_external FROM authenticated; DROP OWNED BY boundary_external; DROP ROLE boundary_external;')

            routines = [
                ('gift','authenticated','akasha_ai.claim_daily_gift(uuid,text,integer,integer)','Server reward RPC retains inherited client execution'),
                ('shop','authenticated','akasha_ai.redeem_points_reward(uuid,integer,text,uuid)','Server reward RPC retains inherited client execution'),
                ('email','authenticated','akasha_ai.record_email_sequence_delivery(uuid,text)','Server reward RPC retains inherited client execution'),
                ('signup','authenticated','akasha_ai.handle_new_user()','Auth signup trigger retains inherited client execution'),
                ('share','anon','akasha_ai.record_social_share(uuid,text,text)','Authenticated reward RPC retains inherited anonymous execution'),
                ('checked','anon','akasha_ai.record_social_share_checked(uuid,text,text,uuid)','Authenticated reward RPC retains inherited anonymous execution'),
                ('stats','anon','akasha_ai.get_social_share_stats()','Authenticated reward RPC retains inherited anonymous execution'),
                ('legacy_debit','service_role','akasha_ai.redeem_points(uuid,integer,text)','Legacy debit-only RPC retains inherited execution'),
            ]
            for label, client, routine, expected in routines:
                check = "has_function_privilege('" + client + "','" + routine + "','EXECUTE')"
                run('inject_execute_' + label, 'CREATE ROLE boundary_external NOLOGIN; GRANT EXECUTE ON FUNCTION ' + routine +
                    ' TO boundary_external; GRANT boundary_external TO ' + client + ';')
                run('reject_execute_' + label, sources['hardening'], expected_error=expected)
                run('preserve_execute_' + label, 'SELECT reward_test.check_true(' + check +
                    ",'external execute preserved'); REVOKE boundary_external FROM " + client +
                    '; DROP OWNED BY boundary_external; DROP ROLE boundary_external;')
            run('final_history_and_roles', groups['profile_cases']['profile_history_preserved'] +
                "SELECT reward_test.check_true(NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='boundary_external'),'fixture role removed');" +
                preserve_definitions)
        if not args.before_hardening:
            # Fingerprint/replay/inherited-grant probes above exercise the exact
            # published bodies. Install each durable overlay once only afterwards;
            # those overlays intentionally change the writer and email authority.
            run('shared_withdrawal_fixture', sources['shared_withdrawal_fixture'])
            for name in ['withdrawal_overlay', 'email_overlay', 'share_overlay', 'export_overlay']:
                run(name, sources[name])
            run('reject_extension_after_overlays', sources['hardening'],
                expected_error='Published reward RPC revision mismatch: akasha_ai.record_social_share(uuid,text,text)')
            pieces = re.split(r'^-- CASE: ([a-z_0-9]+)\s*$', sources['composed_cases'], flags=re.M)
            replacements = {pieces[i]: pieces[i + 1] for i in range(1, len(pieces), 2)}
            if len(replacements) != 3 or not replacements.keys() <= groups['cases'].keys():
                raise RuntimeError('Unexpected composed email/ACL replacements')
            groups['cases'].update(replacements)
            receipt['behavior_contract'] = 'Complete nine-migration composition; three explicit durable email/ACL replacements'
        else:
            receipt['behavior_contract'] = 'Unhardened published baseline; no durable overlays'
        failures = []
        for key, cases in groups.items():
            for name, sql in cases.items():
                if args.before_hardening and name == 'checked_share_actor_binding':
                    receipt['baseline_only_omissions'].append({'name': name, 'reason': 'New checked wrapper does not exist in published baseline'})
                    continue
                passed = run(name, sql, fail_fast=not args.before_hardening or name == 'profile_real_rls_precondition')
                receipt['behavior_cases'].append({'name': name, 'group': key, 'status': 'PASS' if passed else 'FAIL'})
                if not passed:
                    failures.append(name)
        if failures:
            raise RuntimeError('Boundary behavior gates failed: ' + ', '.join(failures))
        expected_cases = 36 if args.before_hardening else 37
        if len(receipt['behavior_cases']) != expected_cases:
            raise RuntimeError('Behavior case coverage is incomplete')
        if not args.before_hardening:
            run('final_composed_history', preserve_history)
        receipt['status'] = 'PASS'
    except (Exception, KeyboardInterrupt) as error:
        receipt['status'] = 'FAIL'
        receipt['error'] = str(error)
    finally:
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        try:
            receipt['source_sha256_after'] = {key: sha(path.read_bytes()) for key, path in paths.items()}
            receipt['inputs_unchanged'] = receipt['source_sha256_after'] == receipt['source_sha256']
            if not receipt['inputs_unchanged']:
                raise RuntimeError('Input changed during qualification')
            if sha(Path(__file__).read_bytes()) != receipt['runner_sha256']:
                raise RuntimeError('Runner changed during qualification')
        except Exception as error:
            receipt['status'] = 'FAIL'
            receipt['snapshot_error'] = str(error)
        try:
            shutil.rmtree(cluster_root)
        except Exception as error:
            receipt['status'] = 'FAIL'
            receipt['cleanup_error'] = str(error)
        receipt['cluster_removed'] = not cluster_root.exists()
        if not receipt['cluster_removed']:
            receipt['status'] = 'FAIL'
        receipt['behavior_counts'] = {state: sum(item['status'] == state for item in receipt['behavior_cases']) for state in ['PASS','FAIL']}
        save()
        print(json.dumps({'status': receipt['status'], 'receipt': str(output / 'receipt.json'),
                          'behavior_counts': receipt['behavior_counts'], 'steps': len(receipt['steps'])}), flush=True)
    return 0 if receipt['status'] == 'PASS' else 1


if __name__ == '__main__':
    def interrupted(signum, _frame):
        raise KeyboardInterrupt('Received signal ' + str(signum))

    signal.signal(signal.SIGTERM, interrupted)
    raise SystemExit(main())
