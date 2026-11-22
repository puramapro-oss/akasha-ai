#!/usr/bin/env python3
"""Run delivery SQL gates on a new synthetic PostgreSQL cluster, then remove it."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import subprocess
import tempfile
import time


def run_owned(command, *, timeout, **kwargs):
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, start_new_session=True, **kwargs)
    try:
        stdout, stderr = process.communicate(timeout=timeout)
    except BaseException:
        # Only this invocation's new process group can be stopped here.
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.communicate(timeout=5)
        raise
    return subprocess.CompletedProcess(command, process.returncode, stdout, stderr)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--pg-bin')
    parser.add_argument('--output', required=True)
    parser.add_argument('--port', type=int, default=43047)
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[2]
    candidates = ([Path(args.pg_bin)] if args.pg_bin else [])
    if not candidates:
        installed = shutil.which('postgres')
        if installed:
            candidates.append(Path(installed).resolve().parent)
        candidates.extend(sorted(Path('/usr/lib/postgresql').glob('*/bin'), reverse=True))
    binary = next((path.resolve() for path in candidates if all((path / command).is_file()
        for command in ('postgres', 'initdb'))), None)
    if binary is None:
        raise SystemExit('Installed PostgreSQL required; pass --pg-bin. No existing database is used.')
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    cluster = Path(tempfile.mkdtemp(prefix='cluster-', dir=output))
    marker = output / 'owned-fixture.json'
    marker.write_text(json.dumps({'kind': 'akasha-delivery-owned-synthetic', 'cluster': str(cluster), 'port': args.port}))
    inputs = [repo / 'schema.sql', repo / 'supabase/migrations/20261122165000_delivery_consistency.sql',
              repo / 'supabase/migrations/20261122165200_points_redemption_authority.sql',
              repo / 'supabase/migrations/20261122165100_daily_gift_delivery.sql',
              repo / 'supabase/migrations/20261122165300_profile_write_boundary.sql',
              repo / 'supabase/migrations/20261122170100_email_sequence_delivery.sql',
              repo / 'supabase/migrations/20261122170200_social_share_tracking_atomic.sql',
              Path(__file__).resolve(), repo / 'tests/delivery/native.test.mjs',
              repo / 'tests/delivery/native-fixture.mjs']
    hashes = lambda: {str(p.relative_to(repo)): hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs}
    report = {'scope': 'Synthetic local PostgreSQL. No production, provider or existing database.',
              'inputs_before': None, 'port': args.port, 'tests_exit': None, 'success': False,
              'expected_counts': {'tests': 21, 'pass': 21, 'fail': 0, 'cancelled': 0, 'skipped': 0, 'todo': 0}}
    expected_counts = report['expected_counts']
    server = None
    log = None
    try:
        report['inputs_before'] = hashes()
        assert 1024 <= args.port <= 65535
        with socket.socket() as check:
            check.bind(('127.0.0.1', args.port))
        init = run_owned([str(binary / 'initdb'), '-D', str(cluster), '-U', 'akasha_delivery_fixture_owner',
            '--auth-host=trust', '--auth-local=reject', '--no-locale', '-E', 'UTF8', '--no-sync'],
            timeout=30)
        (output / 'initdb.log').write_text(init.stdout + init.stderr)
        if init.returncode:
            raise RuntimeError('initdb failed: ' + str(init.returncode))
        log = (output / 'server.log').open('w')
        server = subprocess.Popen([str(binary / 'postgres'), '-D', str(cluster), '-p', str(args.port),
            '-c', 'listen_addresses=127.0.0.1', '-c', 'unix_socket_directories=',
            '-c', 'max_connections=12', '-c', 'shared_buffers=16MB'], stdout=log, stderr=subprocess.STDOUT,
            start_new_session=True)
        ready = False
        for _ in range(100):
            if server.poll() is not None:
                raise RuntimeError('PostgreSQL exited before readiness')
            try:
                with socket.create_connection(('127.0.0.1', args.port), timeout=.1):
                    ready = True
                    break
            except OSError:
                time.sleep(.05)
        if not ready:
            raise RuntimeError('Owned PostgreSQL did not become ready')
        env = dict(os.environ, AKASHA_DELIVERY_FIXTURE_MARKER=str(marker), AKASHA_DELIVERY_FIXTURE_PORT=str(args.port))
        result = run_owned(['node', '--test', '--test-reporter=tap', '--test-concurrency=1', 'tests/delivery/native.test.mjs'],
            cwd=repo, env=env, timeout=45)
        (output / 'tests.tap').write_text(result.stdout + result.stderr)
        report['tests_exit'] = result.returncode
        counts = {}
        for key in expected_counts:
            matches = re.findall(r'^# ' + key + r' (\d+)\s*$', result.stdout, re.MULTILINE)
            if len(matches) != 1:
                raise RuntimeError('Missing or ambiguous TAP counter: ' + key)
            counts[key] = int(matches[0])
        report['counts'] = counts
        observations = json.loads((output / 'native-observations.json').read_text())
        report['native_observations'] = observations
        locks = observations['lock_observations']
        report['lock_witnesses_valid'] = len(locks) == 12 and all(
            row['pid'] != row['blocking_pid'] and row['wait_event_type'] == 'Lock'
            and row['blocking_pid'] in row['blocking_pids'] for row in locks)
        report['success'] = result.returncode == 0 and counts == expected_counts and report['lock_witnesses_valid']
    except (Exception, KeyboardInterrupt) as error:
        report['success'] = False
        report['error'] = str(error)
    finally:
        # A repeated termination request must not interrupt this bounded cleanup.
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        if server and server.poll() is None:
            server.send_signal(signal.SIGINT)
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                report['success'] = False
                report['forced_cleanup'] = True
                try:
                    os.killpg(server.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                server.wait(timeout=5)
        if log:
            log.close()
        report['server_stopped'] = server is None or server.poll() is not None
        try:
            report['inputs_after'] = hashes()
            report['inputs_unchanged'] = report['inputs_before'] == report['inputs_after']
        except Exception as error:
            report['inputs_unchanged'] = False
            report['snapshot_error'] = str(error)
        try:
            ownership = json.loads(marker.read_text())
            owned = ownership['kind'] == 'akasha-delivery-owned-synthetic' and ownership['cluster'] == str(cluster)
        except Exception as error:
            owned = False
            report['ownership_error'] = str(error)
        if report['server_stopped'] and owned and cluster.parent == output:
            shutil.rmtree(cluster)
        report['cluster_removed'] = not cluster.exists()
        try:
            with socket.create_connection(('127.0.0.1', args.port), timeout=.1):
                report['listener_absent'] = False
        except OSError:
            report['listener_absent'] = True
        report['success'] = bool(report['success'] and report['inputs_unchanged'] and
                                 report['server_stopped'] and report['cluster_removed'] and report['listener_absent'])
        (output / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
    if not report['success'] and (output / 'tests.tap').is_file():
        print((output / 'tests.tap').read_text()[-65536:], end='', flush=True)
    print(json.dumps(report))
    return 0 if report['success'] else 1


if __name__ == '__main__':
    def interrupted(signum, _frame):
        raise KeyboardInterrupt('Received signal ' + str(signum))

    signal.signal(signal.SIGTERM, interrupted)
    raise SystemExit(main())
