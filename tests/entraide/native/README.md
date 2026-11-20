# Native PostgreSQL qualification of Entraide privacy

This suite checks the versioned SQL access contract with four synthetic users.
It runs no HTTP server, provider request or private matching engine.

## Existing runtime and runner

Use installed PostgreSQL, Node 22 or later, Python 3, lsof and the explicit
pg 8.23.0 driver. The runner installs nothing and accepts no database URL or
existing data directory.

The guarded runner is shared with the webhook journal. Its closed --suite
allowlist contains stripe and entraide; stripe remains the default. The
lifecycle, process ownership and cleanup code are shared, not copied.

On macOS, the qualification can be constrained to Unix sockets by the OS:

    /usr/bin/sandbox-exec -p '(version 1) (allow default) (deny network*) (allow network-inbound (local unix-socket)) (allow network-outbound (remote unix-socket))' \
      python3 tests/stripe-webhook-recovery/native/run.py \
      --suite entraide \
      --pg-bin /path/to/postgresql/bin \
      --node-bin /path/to/node22 \
      --driver /path/to/pg/lib/index.js \
      --fixture-root /private/tmp/akasha-native \
      --output "$PWD/.git/akasha-entraide-native-results"

Each invocation creates its own marked cluster, private directory, unique Unix
socket path and receipt. The numeric socket suffix is selected after an OS
listener observation; it is not a TCP reservation. PostgreSQL must report empty
listen_addresses and the exact data directory, socket directory and number.
lsof checks that the owned PostgreSQL PID has no TCP listener without creating
or connecting any IP socket. The runtime uses empty private PostgreSQL config
files and a minimal environment, not application credentials.

## Ten native properties

1. The two complete versioned migrations grant exactly seven public profile
   columns and retain the expected RLS and role separation.
2. Authenticated SELECT * fails with SQLSTATE 42501 even for one's own profile.
3. The explicit own-profile public projection succeeds with exactly seven fields.
4. Explicit coordinate reads fail for both self and another user.
5. An authenticated upsert with RETURNING * fails atomically and changes no row.
6. Authenticated own-coordinate updates can succeed with a permitted projection;
   another identity cannot be mutated or inserted through those policies.
7. Client RLS hides incoming blocks, even with a bidirectional query predicate.
8. A synthetic service role sees outgoing and incoming blocks internally.
9. A service query filtered on the synthetic actor returns that own full profile.
10. A server SQL candidate oracle excludes self and both block directions and
    returns only public fields. Public metadata remains directly readable for all
    four profiles, including blocked neighbours, under the existing read policy.

The A/B/C/D fixtures contain invented coordinates. A blocks B, C blocks A and D
is the only eligible candidate. Both migrations are applied in full from source;
their policies and tables are not reconstructed inside the tests.

Expected permission denials are successful assertions checked by SQLSTATE.
A different SQL error, missing denial, missing case or skipped case fails the
suite. The runner requires exactly 10 passing cases and no failed, skipped,
cancelled or todo tests.

## Evidence and cleanup

The receipt records runtime and driver identity, source hashes before and after,
the cluster identity, command logs and TAP counts. native-observations.json
records the expected denial assertions and the non-sensitive contract outcomes.

The test command is bounded to 120 seconds. All SQL clients must close. Cleanup
requires pg_ctl status 3, absence of the owned postmaster, PID file and Unix
socket, an OS observation of no listener at the selected number, and the
unchanged ownership marker. Only that freshly owned cluster is removed.
An ambiguous cleanup preserves it and produces a non-successful result.

## Boundaries

The synthetic service_role has BYPASSRLS explicitly. This is a fixture of the
required service-side contract, not an attestation of a production role.
auth.uid() reads an explicit synthetic request claim; no JWT is validated.

Native SQL does not prove HTTP authentication, binding of getUser() to a route
filter, ignored client-supplied identities, error responses or JSON serialization.
Those need separate application tests. The candidate query is a SQL contract
oracle and does not execute or copy the private matching engine.

No migration is weakened. In particular, authenticated clients cannot read
coordinates directly, including their own. The existing read_all policy still
allows seven public fields for blocked neighbours; candidate exclusion is a
server matching obligation.

## Recorded local qualification

On 2026-11-11 at 16:00 UTC, all 10 Entraide cases passed on PostgreSQL 18.4,
Node 22.23.4 and pg 8.23.0. The five expected 42501 denials were successful
assertions. There were no failed, skipped, cancelled or todo tests.

At 16:01 UTC, the unchanged 24-case webhook journal suite also passed through
the shared runner with --suite omitted, verifying the default selection after
the runner change. Its observers again witnessed seven admission lock waiters
and two terminal-transition lock waiters.

Both runs used the Unix-only OS policy, separate fresh clusters and socket
numbers. Each owned server had no TCP listener. Both source snapshots remained
unchanged, both cleanups passed, and the owned empty parent fixture was removed.

Local receipts are under .git/unlazy-akasha-packaging-20261111-1524/native/:

- entraide/akasha-entraide-native-a73b9ddb520d/result.json
  SHA256 b3b837cedb0726490fdc5581e5bd5d3522cda6fc5ba5cfdb60bc382b662bd3bf
- stripe/akasha-webhook-native-aea1ab25ac6f/result.json
  SHA256 c4e8f74a6700574b8606ecc1fc45ea7d5ff7199b6dba517a13a2d3d271c93b3d

GATES.json records the preflight, exact commands, expected rejection outcomes,
impact-analysis limits and final source hashes. No preparation or suite
execution failed in this qualification. These local results retain all the
boundaries stated above.
