#!/usr/bin/env python3
"""Qualify the real contact route on a new, password-protected local cluster."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import tempfile
import time


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--pg-bin', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[2]
    binary = Path(args.pg_bin).resolve()
    if not all((binary / name).is_file() for name in ['postgres', 'initdb', 'pg_ctl']):
        raise SystemExit('PostgreSQL postgres/initdb/pg_ctl binaries are required.')
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    private = Path(tempfile.mkdtemp(prefix='contact-cluster-', dir=output))
    private.chmod(0o700)
    cluster = private / 'data'
    password = secrets.token_urlsafe(32)
    pwfile = private / 'password'
    pwfile.write_text(password + '\n'); pwfile.chmod(0o600)
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0)); port = probe.getsockname()[1]
    marker = output / 'owned-fixture.json'
    marker.write_text(json.dumps({'kind': 'akasha-contact-owned-synthetic', 'port': port, 'cluster': str(cluster)}))
    env = {key: os.environ[key] for key in ['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP'] if key in os.environ}
    env.update({'PGHOST': '127.0.0.1', 'PGPORT': str(port), 'PGUSER': 'fixture', 'PGDATABASE': 'postgres', 'PGPASSWORD': password})
    inputs = ['src/app/api/contact/route.ts', 'schema.sql',
              'supabase/migrations/20261122165000_delivery_consistency.sql',
              'tests/contact/native-idempotency.test.ts', 'tests/contact/native-idempotency.config.mts',
              'tests/contact/native-idempotency.py']
    hashes = lambda: {name: hashlib.sha256((repo / name).read_bytes()).hexdigest() for name in inputs}
    report = {'scope': 'Real contact route and Supabase SDK, synthetic HTTP transport to native PostgreSQL; no real email',
              'commands': [], 'inputs_before': hashes(), 'success': False}
    started = False

    def run(command, log, timeout=90):
        stamp = time.monotonic()
        result = subprocess.run(command, cwd=repo, env=env, capture_output=True, text=True, timeout=timeout)
        raw = result.stdout + result.stderr
        (output / log).write_text(raw)
        report['commands'].append({'command': command, 'cwd': str(repo), 'exit_code': result.returncode,
                                   'seconds': round(time.monotonic() - stamp, 3), 'log': log,
                                   'sha256': hashlib.sha256(raw.encode()).hexdigest()})
        return result

    try:
        version = run([str(binary / 'postgres'), '--version'], 'postgres-version.log')
        assert version.returncode == 0
        report['postgres_version'] = version.stdout.strip()
        assert run([str(binary / 'initdb'), '-D', str(cluster), '-U', 'fixture', '--auth=scram-sha-256',
                    '--pwfile=' + str(pwfile), '--no-locale', '--encoding=UTF8'], 'initdb.log').returncode == 0
        assert run([str(binary / 'pg_ctl'), '-D', str(cluster), '-l', str(private / 'server.log'),
                    '-o', "-h 127.0.0.1 -p " + str(port) + " -k '' -c max_connections=24", '-w', 'start'], 'start.log').returncode == 0
        started = True
        create = "import pg from 'pg'; const c=new pg.Client(); await c.connect(); await c.query('CREATE DATABASE akasha_contact_idempotency_test'); await c.end();"
        assert run(['node', '--input-type=module', '-e', create], 'create-database.log').returncode == 0
        env['PGDATABASE'] = 'akasha_contact_idempotency_test'
        probe_command = ['node', '--input-type=module', '-e', "import pg from 'pg'; const c=new pg.Client({connectionTimeoutMillis:1000}); try{await c.connect(); await c.query('SELECT 1')}catch{process.exitCode=1}finally{await c.end()}"]
        for wrong in [None, 'incorrect-synthetic-password']:
            probe_env = dict(env)
            if wrong is None: probe_env.pop('PGPASSWORD', None)
            else: probe_env['PGPASSWORD'] = wrong
            assert subprocess.run(probe_command, cwd=repo, env=probe_env, capture_output=True, timeout=5).returncode != 0
        report['authentication_negative_controls'] = 2
        env.update({'AKASHA_CONTACT_TEST_DB_URL': f'postgres://fixture:{password}@127.0.0.1:{port}/akasha_contact_idempotency_test',
                    'AKASHA_CONTACT_TEST_MARKER': str(marker),
                    'AKASHA_CONTACT_TEST_OBSERVATIONS': str(output / 'observations.json')})
        result = run(['node', 'node_modules/vitest/vitest.mjs', 'run', '--config', 'tests/contact/native-idempotency.config.mts',
                      '--reporter=default', '--reporter=json', '--outputFile=' + str(output / 'results.json')], 'tests.log')
        report['test_exit_code'] = result.returncode
        if (output / 'results.json').exists():
            tests = json.loads((output / 'results.json').read_text())
            report['counts'] = {key: tests.get(key) for key in ['numTotalTests', 'numPassedTests', 'numFailedTests', 'numPendingTests', 'numTodoTests']}
            assertions = [entry for suite in tests.get('testResults', []) for entry in suite.get('assertionResults', [])]
            report['all_ten_assertions_passed'] = len(assertions) == 10 and all(entry.get('status') == 'passed' for entry in assertions)
        if (output / 'observations.json').exists():
            observations = json.loads((output / 'observations.json').read_text())
            report['observations'] = observations
            locks = observations['lock_observations']
            report['two_concurrent_waits_observed'] = len(locks) == 2 and all(row['waiter'] != row['blocker'] and
                row['wait_event_type'] == 'Lock' and row['blocker'] in row['blockers'] for row in locks)
        report['success'] = result.returncode == 0 and report.get('all_ten_assertions_passed', False) and report.get('two_concurrent_waits_observed', False)
    except Exception as error:
        report['error'] = type(error).__name__ + ': ' + str(error)
    finally:
        if started:
            report['server_stopped'] = run([str(binary / 'pg_ctl'), '-D', str(cluster), '-m', 'fast', '-w', 'stop'], 'stop.log').returncode == 0
        else:
            report['server_stopped'] = not (cluster / 'postmaster.pid').exists()
        with socket.socket() as probe:
            probe.settimeout(1); report['port_closed'] = probe.connect_ex(('127.0.0.1', port)) != 0
        if report['server_stopped']:
            shutil.rmtree(private)
        report['cluster_removed'] = not private.exists()
        report['password_file_removed'] = not pwfile.exists()
        report['inputs_after'] = hashes()
        report['inputs_unchanged'] = report['inputs_before'] == report['inputs_after']
        report['success'] = report['success'] and all(report[key] for key in ['server_stopped', 'port_closed', 'cluster_removed', 'password_file_removed', 'inputs_unchanged'])
        (output / 'receipt.json').write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps({key: report.get(key) for key in ['success', 'counts', 'two_concurrent_waits_observed', 'inputs_unchanged', 'server_stopped', 'port_closed', 'error']}, indent=2))
    return 0 if report['success'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
