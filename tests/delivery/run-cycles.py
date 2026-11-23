#!/usr/bin/env python3
"""Receive the public Cycles or contact tests against the current Next build."""
import argparse
import hashlib
import http.client
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import threading
import time
from urllib.parse import urlsplit


SYNTHETIC_ENV = {
    'CI': 'true', 'NODE_ENV': 'production', 'NEXT_TELEMETRY_DISABLED': '1',
    'NEXT_PUBLIC_SUPABASE_URL': 'https://supabase.example.invalid',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY': 'ci-anon-key-not-a-real-key',
    'SUPABASE_SERVICE_ROLE_KEY': 'ci-service-role-not-a-real-key',
    'UPSTASH_REDIS_REST_URL': 'https://redis.example.invalid',
    'UPSTASH_REDIS_REST_TOKEN': 'ci-redis-token-not-a-real-token',
    'STRIPE_SECRET_KEY': 'sk_test_synthetic_fixture_not_a_real_key',
    'RESEND_API_KEY': '',
}


def port_absent(port):
    try:
        with socket.socket() as check:
            check.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            check.bind(('127.0.0.1', port))
            return True
    except OSError:
        return False


def group_exists(pid):
    try:
        os.killpg(pid, 0)
        return True
    except ProcessLookupError:
        return False


def stop_owned(process):
    if process is None:
        return {'started': False, 'stopped': True, 'forced': False}
    forced = False
    if group_exists(process.pid):
        os.killpg(process.pid, signal.SIGTERM)
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        forced = True
        os.killpg(process.pid, signal.SIGKILL)
        process.wait(timeout=5)
    deadline = time.monotonic() + 3
    while group_exists(process.pid) and time.monotonic() < deadline:
        time.sleep(.05)
    if group_exists(process.pid):
        forced = True
        os.killpg(process.pid, signal.SIGKILL)
    return {'pid': process.pid, 'exit_code': process.returncode,
            'started': True, 'stopped': not group_exists(process.pid), 'forced': forced}


def verify_tests(receipt):
    cases = []
    def visit(suite):
        for spec in suite.get('specs', []):
            assert Path(spec['file']).name == 'cycles-public.spec.ts'
            assert spec['ok'] and len(spec['tests']) == 1
            test = spec['tests'][0]
            assert test['projectName'] == 'chromium' and test['expectedStatus'] == 'passed'
            assert test['status'] == 'expected' and len(test['results']) == 1
            result = test['results'][0]
            assert result['status'] == 'passed' and result['retry'] == 0 and not result['errors']
            cases.append({'title': spec['title'], 'status': result['status'],
                          'retry': result['retry'], 'duration_ms': result['duration']})
        for child in suite.get('suites', []):
            visit(child)
    for suite in receipt['suites']:
        visit(suite)
    counts = {key: receipt['stats'][key] for key in ('expected', 'unexpected', 'flaky', 'skipped')}
    assert counts == {'expected': 4, 'unexpected': 0, 'flaky': 0, 'skipped': 0}
    assert len(cases) == 4 and len({case['title'] for case in cases}) == 4 and not receipt['errors']
    return counts, cases


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    parser.add_argument('--port', type=int, default=3000)
    parser.add_argument('--suite', choices=['cycles', 'contact'], default='cycles')
    args = parser.parse_args()
    assert os.name == 'posix' and 1024 <= args.port <= 65535
    repo = Path(__file__).resolve().parents[2]
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    origin = 'http://127.0.0.1:' + str(args.port)
    inputs = [Path(__file__).resolve(), repo / 'package-lock.json', repo / '.next/BUILD_ID']
    inputs += ([repo / 'tests/contact/browser.mjs', repo / 'src/app/contact/page.tsx', repo / 'src/lib/idempotency/browser-request.ts'] if args.suite == 'contact'
               else [repo / 'tests/delivery/cycles.playwright.config.mts', repo / 'tests/cycles-public.spec.ts'])
    hashes = lambda: {str(p.relative_to(repo)): hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs}
    report = {'scope': 'Four ' + args.suite + ' tests on the compiled Next application; no real provider or account.',
              'origin': origin, 'success': False, 'errors': [], 'browser_proxy_denials': []}
    server = tests = proxy = proxy_thread = None
    logs = []
    def interrupted(signum, _frame):
        raise InterruptedError('Qualification interrupted by signal ' + str(signum))
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        report['inputs_before'] = hashes()
        report['build_id'] = (repo / '.next/BUILD_ID').read_text().strip()
        assert report['build_id'], 'The existing Next production build is required'
        for name in ('.env', '.env.local', '.env.production', '.env.production.local'):
            assert not (repo / name).exists(), 'Refusing a checkout with runtime dotenv configuration: ' + name
        lock = json.loads((repo / 'package-lock.json').read_text())
        for name in ('playwright', '@playwright/test'):
            installed = json.loads((repo / 'node_modules' / name / 'package.json').read_text())['version']
            assert installed == lock['packages']['node_modules/' + name]['version']
            report[name + '_version'] = installed
        with socket.socket() as check:
            check.bind(('127.0.0.1', args.port))

        class DenyExternal(BaseHTTPRequestHandler):
            def deny(self):
                url = self.path if '://' in self.path else 'https://' + self.path
                target = urlsplit(url).hostname or 'unparsed'
                if target not in report['browser_proxy_denials']:
                    report['browser_proxy_denials'].append(target)
                self.send_error(403, 'Only the owned loopback application is admitted')
            do_CONNECT = do_GET = do_POST = do_PUT = do_DELETE = do_HEAD = do_OPTIONS = do_PATCH = deny
            def log_message(self, _format, *_args):
                pass
        proxy = ThreadingHTTPServer(('127.0.0.1', 0), DenyExternal)
        proxy_thread = threading.Thread(target=proxy.serve_forever, daemon=True)
        proxy_thread.start()
        report['proxy_port'] = proxy.server_port
        env = {key: os.environ[key] for key in ('PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'LANG',
               'LC_ALL', 'XDG_CACHE_HOME', 'PLAYWRIGHT_BROWSERS_PATH') if key in os.environ}
        env.update(SYNTHETIC_ENV, NEXT_PUBLIC_APP_URL=origin, CYCLES_E2E_BASE_URL=origin,
                   AKASHA_CYCLES_DENY_PROXY='http://127.0.0.1:' + str(proxy.server_port),
                   AKASHA_CYCLES_OUTPUT=str(output))
        if args.suite == 'contact':
            env.update(CONTACT_BROWSER_BASE_URL=origin,
                       CONTACT_BROWSER_DENY_PROXY='http://127.0.0.1:' + str(proxy.server_port),
                       CONTACT_BROWSER_EVIDENCE=str(output / 'browser.json'))
            if os.environ.get('CONTACT_BROWSER_EXECUTABLE'):
                env['CONTACT_BROWSER_EXECUTABLE'] = os.environ['CONTACT_BROWSER_EXECUTABLE']
        server_log = (output / 'next-server.log').open('w')
        logs.append(server_log)
        server = subprocess.Popen(['node', 'node_modules/next/dist/bin/next', 'start',
            '--hostname', '127.0.0.1', '--port', str(args.port)], cwd=repo, env=env,
            stdout=server_log, stderr=subprocess.STDOUT, start_new_session=True)
        report['server_pid'] = server.pid
        ready = False
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            assert server.poll() is None, 'Owned Next process exited before readiness'
            connection = http.client.HTTPConnection('127.0.0.1', args.port, timeout=1)
            try:
                connection.request('GET', '/contact' if args.suite == 'contact' else '/cycles')
                response = connection.getresponse()
                response.read()
                if response.status == 200 and server.poll() is None:
                    ready = True
                    break
            except (OSError, http.client.HTTPException):
                pass
            finally:
                connection.close()
            time.sleep(.1)
        assert ready, 'Owned compiled Next application did not become ready in 30 seconds'
        test_log = (output / 'playwright.log').open('w')
        logs.append(test_log)
        command = ['node', 'tests/contact/browser.mjs'] if args.suite == 'contact' else [
            'node', 'node_modules/@playwright/test/cli.js', 'test',
            'tests/cycles-public.spec.ts', '--config', 'tests/delivery/cycles.playwright.config.mts',
            '--project=chromium', '--workers=1', '--retries=0']
        tests = subprocess.Popen(command, cwd=repo, env=env,
            stdout=test_log, stderr=subprocess.STDOUT, start_new_session=True)
        report['tests_exit'] = tests.wait(timeout=170)
        if args.suite == 'contact':
            receipt = json.loads((output / 'browser.json').read_text())
            assert receipt['status'] == 'PASS' and receipt['sandbox'] is True
            assert len(receipt['results']) == 4 and len({case['name'] for case in receipt['results']}) == 4
            assert all(case['status'] == 'PASS' for case in receipt['results'])
            report['counts'] = {'expected': 4, 'unexpected': 0, 'flaky': 0, 'skipped': 0}
            report['cases'] = receipt['results']
        else:
            receipt = json.loads((output / 'playwright.json').read_text())
            report['counts'], report['cases'] = verify_tests(receipt)
        report['success'] = report['tests_exit'] == 0 and server.poll() is None
    except Exception as error:
        report['errors'].append(str(error) or type(error).__name__)
    finally:
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        for name, process in (('playwright_cleanup', tests), ('server_cleanup', server)):
            try:
                report[name] = stop_owned(process)
            except Exception as error:
                report[name] = {'stopped': False, 'error': str(error)}
        if proxy:
            proxy.shutdown()
            proxy.server_close()
            proxy_thread.join(timeout=2)
        for log in logs:
            log.close()
        report['server_port_absent'] = port_absent(args.port)
        report['proxy_stopped'] = proxy_thread is None or not proxy_thread.is_alive()
        report['proxy_port_absent'] = proxy is None or port_absent(proxy.server_port)
        try:
            report['inputs_after'] = hashes()
            report['inputs_unchanged'] = report.get('inputs_before') == report['inputs_after']
        except OSError:
            report['inputs_unchanged'] = False
        report['success'] = bool(report['success'] and not report['errors'] and report['inputs_unchanged']
            and report['server_port_absent'] and report['proxy_port_absent'] and report['proxy_stopped']
            and all(report[name].get('stopped') and not report[name].get('forced')
                    for name in ('playwright_cleanup', 'server_cleanup')))
        (output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    if not report['success']:
        for name in ('next-server.log', 'playwright.log', 'playwright.json', 'browser.json'):
            if (output / name).is_file():
                print(name + '\n' + (output / name).read_text()[-20000:])
    print(json.dumps(report, ensure_ascii=False))
    return 0 if report['success'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
