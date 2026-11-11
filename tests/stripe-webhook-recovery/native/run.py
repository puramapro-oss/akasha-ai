#!/usr/bin/env python3
"""Qualify an allowlisted AKASHA SQL suite on a new marked PostgreSQL cluster.

No existing database, application credentials, TCP listener or installation is used.
This runner reuses the previously reviewed native-cluster lifecycle and cleanup.
"""

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import shlex
import signal
import subprocess
import sys
import time
import traceback
import uuid


REPO = Path(__file__).resolve().parents[3]
INPUTS = ('tests/stripe-webhook-recovery/native/run.py', 'tests/stripe-webhook-recovery/native/journal.test.mjs', 'src/app/api/stripe/webhook/route.ts', 'src/app/api/internal/stripe-fulfillment/route.ts', 'src/lib/webhook-idempotency.ts', 'src/lib/stripe/webhook-handler.ts', 'src/lib/stripe/webhook-helpers.ts', 'src/lib/karma/dispatch.ts', 'supabase/migrations/20261111_stripe_webhook_journal.sql', 'supabase/migrations/20260926_stripe_events_processed.sql', 'schema.sql')

# Closed suite selection: callers cannot provide arbitrary scripts or SQL paths.
SUITES = {
    "stripe": {
        "test_file": "tests/stripe-webhook-recovery/native/journal.test.mjs",
        "test_count": 24,
        "run_prefix": "akasha-webhook-native",
        "marker_kind": "purama-akasha-webhook-native",
        "admin": "akasha_webhook_fixture_owner",
        "env_prefix": "AKASHA_WEBHOOK_TEST",
        "scope": "Native AKASHA journal, ACL and witnessed PostgreSQL concurrency only; no financial effects or provider.",
        "inputs": INPUTS,
    },
    "entraide": {
        "test_file": "tests/entraide/native/privacy.test.mjs",
        "test_count": 10,
        "run_prefix": "akasha-entraide-native",
        "marker_kind": "purama-akasha-entraide-native",
        "admin": "akasha_entraide_fixture_owner",
        "env_prefix": "AKASHA_ENTRAIDE_TEST",
        "scope": "Native Entraide SQL ACL, own-profile RLS and internal bidirectional blocks; four synthetic users; no HTTP, private engine or production attestation.",
        "inputs": (
            "tests/stripe-webhook-recovery/native/run.py",
            "tests/entraide/native/privacy.test.mjs",
            "supabase/migrations/20260904_entraide_social_layer.sql",
            "supabase/migrations/20260905_entraide_profile_privacy.sql",
        ),
    },
}


def now_utc():
    return datetime.now(timezone.utc).isoformat()


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def find_postgres(explicit):
    if explicit:
        candidates = [Path(explicit)]
    else:
        candidates = []
        found = shutil.which("postgres")
        if found:
            candidates.append(Path(found).resolve().parent)
        candidates.extend(sorted(
            Path("/usr/lib/postgresql").glob("*/bin"),
            key=lambda path: int(path.parent.name) if path.parent.name.isdigit() else 0,
            reverse=True,
        ))
        candidates.extend([
            Path("/opt/homebrew/opt/postgresql@18/bin"),
            Path("/opt/homebrew/opt/postgresql/bin"),
            Path("/usr/local/pgsql/bin"),
        ])
    for candidate in candidates:
        if all((candidate / name).is_file() and os.access(candidate / name, os.X_OK)
               for name in ("initdb", "pg_ctl", "psql", "postgres")):
            return candidate.resolve()
    raise RuntimeError("Complete installed PostgreSQL binaries required; pass --pg-bin. No database fallback.")


def process_exists(pid):
    if pid is None:
        return False
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


class AkashaWebhookNativeRun:
    def __init__(self, args):
        self.args = args
        self.suite_name = args.suite
        self.spec = SUITES[self.suite_name]
        self.admin = self.spec["admin"]
        self.expected_counts = {"tests": self.spec["test_count"], "pass": self.spec["test_count"],
                                "fail": 0, "cancelled": 0, "skipped": 0, "todo": 0}
        self.run_id = self.spec["run_prefix"] + "-" + uuid.uuid4().hex[:12]
        self.output = Path(args.output).resolve() / self.run_id
        self.output.mkdir(parents=True, exist_ok=False)
        self.cluster = None
        self.started = False
        self.postmaster_pid = None
        self.transcript = []
        self.report = {
            "run_id": self.run_id, "started_at_utc": now_utc(), "success": False,
            "suite": self.suite_name, "scope": self.spec["scope"],
            "expected_counts": self.expected_counts,
            "output": str(self.output),
        }
        # libpq requires a regular password file; /dev/null emits a warning.
        # Empty private files also prevent reads of the user's real PG config.
        pgpass = self.output / "empty.pgpass"
        pgservice = self.output / "empty.pg_service.conf"
        for path in (pgpass, pgservice):
            descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            os.close(descriptor)
        self.env = {"PATH": "/usr/bin:/bin", "LANG": "C", "LC_ALL": "C", "TZ": "UTC",
                    "PGPASSFILE": str(pgpass), "PGSERVICEFILE": str(pgservice),
                    "PGCONNECT_TIMEOUT": "5"}

    def command(self, label, command, timeout=30, env=None, check=True):
        log = self.output / (label + ".log")
        row = {"label": label, "command": [str(arg) for arg in command],
               "started_at_utc": now_utc(), "timeout_seconds": timeout}
        process = None
        try:
            with log.open("xb") as stream:
                process = subprocess.Popen(
                    row["command"], cwd=REPO, env=self.env if env is None else env,
                    stdin=subprocess.DEVNULL, stdout=stream, stderr=subprocess.STDOUT,
                    start_new_session=True,
                )
                try:
                    process.wait(timeout=timeout)
                except BaseException:
                    # Only this command's freshly created process group is stopped.
                    try:
                        os.killpg(process.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                    process.wait(timeout=5)
                    raise
                row["exit_code"] = process.returncode
        except BaseException as error:
            row["error"] = type(error).__name__ + ": " + str(error)
            if process is not None:
                row["exit_code"] = process.returncode
            raise
        finally:
            row["finished_at_utc"] = now_utc()
            row["log"] = str(log)
            row["log_sha256"] = sha256(log) if log.is_file() else None
            self.transcript.append(row)
        text = log.read_text(errors="replace")
        require(not check or row["exit_code"] == 0,
                label + " exited " + str(row["exit_code"]) + "; see " + str(log))
        return row["exit_code"], text

    def snapshot(self):
        return {name: sha256(REPO / name) for name in self.spec["inputs"]}

    def prepare(self):
        self.pg_bin = find_postgres(self.args.pg_bin)
        node_name = self.args.node_bin or shutil.which("node")
        require(node_name is not None, "Installed Node 22 or later required; pass --node-bin.")
        self.node = Path(node_name).resolve()
        require(self.node.is_file() and os.access(self.node, os.X_OK), "Node is not executable.")
        self.driver = Path(self.args.driver).resolve()
        require(self.driver.is_file(), "Explicit existing pg driver required; no dependency installation is attempted.")
        package = self.driver.parent.parent / "package.json"
        metadata = json.loads(package.read_text())
        require(metadata.get("name") == "pg" and metadata.get("version") == "8.23.0",
                "The explicit driver must be pg 8.23.0.")
        self.env["PATH"] = os.pathsep.join([str(self.pg_bin), str(self.node.parent), "/usr/bin", "/bin"])
        self.report["source_before"] = self.snapshot()
        self.report["driver"] = {
            "path": str(self.driver), "version": metadata["version"],
            "sha256": sha256(self.driver), "package_sha256": sha256(package),
        }
        self.report["postgres_bin"] = str(self.pg_bin)
        self.report["node_bin"] = str(self.node)
        _, node_version = self.command("node-version", [self.node, "--version"], timeout=5)
        match = re.fullmatch(r"v(\d+)\.\d+\.\d+\s*", node_version)
        require(match is not None and int(match.group(1)) >= 22, "Node 22 or later is required.")
        self.report["node_version"] = node_version.strip()
        _, pg_version = self.command("postgres-version", [self.pg_bin / "postgres", "--version"], timeout=5)
        self.report["postgres_version"] = pg_version.strip()
        _, head = self.command("git-head", ["git", "--no-optional-locks", "rev-parse", "HEAD"], timeout=5)
        self.report["git_head"] = head.strip()

        lsof_name = shutil.which("lsof") or ("/usr/sbin/lsof" if Path("/usr/sbin/lsof").is_file() else None)
        require(lsof_name is not None, "Installed lsof required for OS listener observation; no network probes.")
        self.lsof = Path(lsof_name).resolve()
        self.report["listener_observer"] = str(self.lsof)
        # This number names a fresh private Unix socket; it is not a TCP reservation.
        # Inspect OS listener metadata without creating or connecting an IP socket.
        for attempt in range(8):
            self.port = 49152 + uuid.uuid4().int % 16384
            if self.tcp_port_is_free("tcp-port-preflight-" + str(attempt + 1)):
                break
        else:
            raise RuntimeError("Could not select an unoccupied socket number.")
        self.report["port_selection"] = "Random Unix socket number, OS-observed TCP vacancy; not a TCP reservation."
        fixture_root = Path(self.args.fixture_root).resolve()
        fixture_root.mkdir(parents=True, exist_ok=True, mode=0o700)
        cluster = fixture_root / ("c-" + uuid.uuid4().hex[:12])
        require(cluster not in self.output.parents and cluster != self.output, "Evidence must be outside the cluster.")
        socket_file = cluster / "socket" / (".s.PGSQL." + str(self.port))
        require(len(os.fsencode(socket_file)) <= 100, "Private Unix socket path is too long; shorten --fixture-root.")
        cluster.mkdir(mode=0o700, exist_ok=False)
        self.cluster = cluster
        self.data = cluster / "data"
        self.socket = cluster / "socket"
        self.socket.mkdir(mode=0o700)
        self.socket_file = socket_file
        self.marker = {"kind": self.spec["marker_kind"], "run_id": self.run_id,
                       "cluster": str(cluster), "token": uuid.uuid4().hex}
        with (cluster / "OWNERSHIP.json").open("x") as stream:
            json.dump(self.marker, stream)
        self.report.update({"cluster": str(cluster), "data": str(self.data),
                            "socket": str(self.socket), "port": self.port, "listen_addresses": ""})
        print("NATIVE_START " + json.dumps({"run_id": self.run_id, "cluster": str(cluster),
                                         "output": str(self.output)}), flush=True)

    def owns_cluster(self):
        if self.cluster is None or self.cluster.is_symlink() or not self.cluster.is_dir():
            return False
        marker = self.cluster / "OWNERSHIP.json"
        if marker.is_symlink() or not marker.is_file():
            return False
        if json.loads(marker.read_text()) != self.marker:
            return False
        return all(not path.is_symlink() and path.resolve().parent == self.cluster
                   for path in (self.data, self.socket))

    def tcp_port_is_free(self, label):
        code, output = self.command(label, [
            self.lsof, "-nP", "-iTCP:" + str(self.port), "-sTCP:LISTEN", "-Fp",
        ], timeout=5, check=False)
        require((code == 1 and not output.strip()) or (code == 0 and output.startswith("p")),
                "OS listener observation is unavailable or ambiguous.")
        return code == 1

    def start(self):
        require(self.owns_cluster(), "Cluster ownership check failed before initialization.")
        require(not self.data.exists(), "Refuse an existing data directory.")
        self.command("initdb", [
            self.pg_bin / "initdb", "-D", self.data, "-U", self.admin, "-A", "trust",
            "--no-locale", "-E", "UTF8",
        ])
        self.started = True
        options = shlex.join([
            "-k", str(self.socket), "-p", str(self.port), "-c", "listen_addresses=",
            "-c", "unix_socket_permissions=0700", "-c", "shared_buffers=16MB",
            "-c", "max_connections=16",
        ])
        self.command("pg-start", [
            self.pg_bin / "pg_ctl", "-D", self.data, "-l", self.output / "postgres.log",
            "-o", options, "-w", "-t", "20", "start",
        ], timeout=25)
        self.postmaster_pid = int((self.data / "postmaster.pid").read_text().splitlines()[0])
        require(self.postmaster_pid > 1, "Invalid private PostgreSQL PID.")
        query = (
            "SELECT jsonb_build_object("
            "'data_directory',current_setting('data_directory'),"
            "'listen_addresses',current_setting('listen_addresses'),"
            "'unix_socket_directories',current_setting('unix_socket_directories'),"
            "'port',current_setting('port'),"
            "'server_version',current_setting('server_version'),"
            "'system_identifier',system_identifier::text) FROM pg_control_system();"
        )
        _, result = self.command("cluster-identity", [
            self.pg_bin / "psql", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1",
            "-h", self.socket, "-p", str(self.port), "-U", self.admin, "-d", "postgres", "-c", query,
        ], timeout=10)
        identity = json.loads(result.strip())
        require(identity["data_directory"] == str(self.data), "Unexpected data_directory.")
        require(identity["listen_addresses"] == "", "TCP listeners are forbidden.")
        require(identity["unix_socket_directories"] == str(self.socket), "Unexpected Unix socket directory.")
        require(identity["port"] == str(self.port), "Unexpected private socket port.")
        self.report["cluster_identity"] = identity
        self.report["postmaster_pid"] = self.postmaster_pid
        listener_code, listeners = self.command("postgres-tcp-listeners", [
            self.lsof, "-nP", "-a", "-p", str(self.postmaster_pid), "-iTCP", "-sTCP:LISTEN", "-Fp",
        ], timeout=5, check=False)
        require(listener_code == 1 and not listeners.strip(),
                "The owned PostgreSQL process must have no TCP listener.")
        self.report["postgres_tcp_listeners_absent"] = True
        _, fresh = self.command("fresh-cluster-guard", [
            self.pg_bin / "psql", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1",
            "-h", self.socket, "-p", str(self.port), "-U", self.admin, "-d", "postgres", "-c",
            "SELECT (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')) + "
            "(SELECT count(*) FROM pg_database WHERE datname NOT IN ('postgres','template0','template1')) + "
            "(SELECT count(*) FROM pg_namespace WHERE nspname IN ('auth','akasha_ai','purama_ai'));",
        ], timeout=10)
        require(fresh.strip() == "0", "Refuse any pre-existing application/test state.")
        self.report["fresh_cluster_guard"] = True

    def test(self):
        prefix = self.spec["env_prefix"]
        env = {**self.env,
               prefix + "_PG_HOST": str(self.socket),
               prefix + "_PG_PORT": str(self.port),
               prefix + "_PG_USER": self.admin,
               prefix + "_PG_DATA": str(self.data),
               prefix + "_PG_DRIVER": self.driver.as_uri(),
               prefix + "_PROOF_DIR": str(self.output),
               prefix + "_RUN_ID": self.run_id,
               prefix + "_OWNER_TOKEN": self.marker["token"]}
        code, output = self.command(self.suite_name + "-native-tests", [
            self.node, "--test", "--test-reporter=tap", "--test-concurrency=1",
            self.spec["test_file"],
        ], timeout=120, env=env, check=False)
        counts = {}
        for key in self.expected_counts:
            matches = re.findall(r"^# " + key + r" (\d+)\s*$", output, re.MULTILINE)
            require(len(matches) == 1, "Missing or ambiguous TAP counter: " + key)
            counts[key] = int(matches[0])
        self.report.update({"test_exit_code": code, "counts": counts})
        require(code == 0 and counts == self.expected_counts,
                "Native " + self.suite_name + " suite did not pass exactly " + str(self.spec["test_count"]) + " tests.")

    def cleanup(self):
        result = {"stopped": False, "cluster_removed": False, "pid_file_absent": False,
                  "postmaster_absent": False, "socket_absent": False, "tcp_port_free": False, "errors": []}
        self.report["cleanup"] = result
        if self.cluster is None:
            result.update({"stopped": True, "cluster_removed": True, "pid_file_absent": True,
                           "postmaster_absent": True, "socket_absent": True, "tcp_port_free": True, "not_created": True})
            return
        try:
            require(self.owns_cluster(), "Ownership marker changed; cluster is preserved.")
            if self.started:
                stop_code, _ = self.command("pg-stop", [
                    self.pg_bin / "pg_ctl", "-D", self.data, "-m", "fast", "-w", "-t", "15", "stop",
                ], timeout=20, check=False)
                if stop_code != 0:
                    result["errors"].append("pg_ctl stop returned " + str(stop_code))
            if (self.data / "PG_VERSION").is_file():
                status, _ = self.command("pg-status-after-stop", [
                    self.pg_bin / "pg_ctl", "-D", self.data, "status",
                ], timeout=5, check=False)
                result["status_exit_code"] = status
                result["stopped"] = status == 3
            else:
                result["stopped"] = not self.started
            result["pid_file_absent"] = not os.path.lexists(self.data / "postmaster.pid")
            result["socket_absent"] = not any(os.path.lexists(path) for path in
                                             (self.socket_file, Path(str(self.socket_file) + ".lock")))
            deadline = time.monotonic() + 2
            while process_exists(self.postmaster_pid) and time.monotonic() < deadline:
                time.sleep(0.05)
            result["postmaster_absent"] = not process_exists(self.postmaster_pid)
            result["tcp_port_free"] = self.tcp_port_is_free("tcp-port-after-stop")
            safe = all(result[key] for key in
                       ("stopped", "pid_file_absent", "socket_absent", "postmaster_absent", "tcp_port_free"))
            require(safe, "Private server shutdown is not fully confirmed; cluster is preserved.")
            require(self.owns_cluster(), "Ownership marker changed before removal; cluster is preserved.")
            shutil.rmtree(self.cluster)
            result["cluster_removed"] = not self.cluster.exists()
        except BaseException as error:
            result["errors"].append(type(error).__name__ + ": " + str(error))

    def run(self):
        try:
            self.prepare()
            self.start()
            self.test()
        except BaseException as error:
            self.report["error"] = type(error).__name__ + ": " + str(error)
            self.report["traceback"] = traceback.format_exc()
        finally:
            self.cleanup()
            try:
                self.report["source_after"] = self.snapshot()
                self.report["inputs_unchanged"] = self.report.get("source_before") == self.report["source_after"]
            except BaseException as error:
                self.report["inputs_unchanged"] = False
                self.report["source_check_error"] = str(error)
            cleanup = self.report["cleanup"]
            self.report["finished_at_utc"] = now_utc()
            self.report["success"] = (
                not self.report.get("error") and self.report.get("test_exit_code") == 0
                and self.report.get("counts") == self.expected_counts and self.report["inputs_unchanged"]
                and self.report.get("postgres_tcp_listeners_absent") is True
                and all(cleanup[key] for key in
                        ("stopped", "cluster_removed", "pid_file_absent", "postmaster_absent", "socket_absent", "tcp_port_free"))
                and cleanup.get("status_exit_code") == 3 and not cleanup["errors"]
            )
            self.report["commands"] = self.transcript
            (self.output / "result.json").write_text(json.dumps(self.report, indent=2) + "\n")
            print("FINAL_RESULT " + json.dumps({key: self.report.get(key) for key in ("run_id", "success", "error", "output", "suite", "cleanup", "inputs_unchanged")}), flush=True)
        if self.report["success"]:
            return 0
        cleanup = self.report["cleanup"]
        return 1 if cleanup.get("cluster_removed") and cleanup.get("status_exit_code") == 3 else 3


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--suite", choices=tuple(SUITES), default="stripe")
    parser.add_argument("--pg-bin", default=os.environ.get("PG_BIN"))
    parser.add_argument("--node-bin")
    parser.add_argument("--driver", required=True)
    parser.add_argument("--fixture-root", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    def interrupted(signum, frame):
        raise KeyboardInterrupt("Received signal " + str(signum))

    signal.signal(signal.SIGTERM, interrupted)
    return AkashaWebhookNativeRun(args).run()


if __name__ == "__main__":
    sys.exit(main())
