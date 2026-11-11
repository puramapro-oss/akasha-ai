# Native PostgreSQL qualification of the webhook journal

This suite qualifies the delivery journal, permissions and state transitions.
It performs no wallet, payment, KARMA, external Stripe or other provider action.

## Requirements

Use already installed PostgreSQL binaries, Node 22 or later, Python 3 and an
explicit pg 8.23.0 driver. Nothing is installed by the runner. The driver and
all test/product inputs are fingerprinted in the execution receipt.

From the repository root:

    python3 tests/stripe-webhook-recovery/native/run.py \
      --pg-bin /path/to/postgresql/bin \
      --node-bin /path/to/node22 \
      --driver "$PWD/node_modules/pg/lib/index.js" \
      --fixture-root /tmp/akasha-webhook-native \
      --output "$PWD/.git/akasha-webhook-native-results"

The runner exclusively creates a new, marked cluster with a private directory
and Unix socket. PostgreSQL must report an empty listen_addresses, the exact
data_directory, socket directory and port selected for that run. The test itself
also checks the ownership marker and rejects pre-existing application roles or
schemas. It does not accept a database URL, production configuration or an
existing data directory.

## Qualification

The 24 cases exercise migration prerequisites and rollback, immutable event
evidence, the account/mode/event composite identity, ownership tokens,
completion and reconciliation, both historical claim tables, invalid input,
service-role-only RPCs, forbidden direct mutations, and no takeover of old
processing rows. Eight actual PostgreSQL backends contend on one event; a
separate observer must see seven lock waiters. A second race serializes
completion and reconciliation under a real row lock.

Legacy claim tables are created from the existing versioned definitions in
schema.sql and 20260926_stripe_events_processed.sql. They are not invented
financial fixtures. Application roles and event observations are synthetic.
The native suite is separate from the Vitest behavior suite and its provider
boundary substitutions.

The test command is bounded to 120 seconds. Logs, TAP counts, source hashes,
cluster identity and the final JSON receipt remain outside the disposable
cluster. Cleanup requires pg_ctl status 3, absence of the postmaster process,
PID file and socket, and an unchanged ownership marker before removal.
An unconfirmed cleanup preserves the marked cluster and exits with status 3.

## Deliberate limits

A completed receipt proves the current event attempt only. Different Stripe
Event identifiers for the same economic object remain separate; no event order
is inferred from created. The legacy wallet/prime/reversal effects remain
non-atomic and cannot be automatically replayed after an uncertain write.

The two historical claim tables remain intact. Older application versions still
write those tables, so deployment must retire or separately qualify those
writers before relying on the new shared journal. This suite does not prove a
mixed-version rollout.

The livemode namespace separates evidence. It does not establish that the
configured Stripe key, webhook endpoint and target database authorize that
mode. That configuration remains a production prerequisite.

Existing RPC definitions in migrations/v4.1-akasha-pools.sql and
migrations/v4.1-akasha-withdrawals.sql are source contracts, not production DB
attestations. The native suite does not supply the missing next_invoice_number
or payments contract, nor the external creation/uniqueness contract of
public.karma_split_log. It does not authorize any financial settlement.

## Recorded local qualification

On 2026-11-11 at 09:46 UTC, the unchanged 24 cases passed on PostgreSQL 18.4,
Node 22.23.4 and pg 8.23.0. There were no failed, skipped, cancelled or todo
tests. The database observer recorded seven simultaneous admission lock waiters
and two terminal-transition lock waiters. All eleven source inputs retained
their hashes during the run.

Cleanup was confirmed with pg_ctl status 3, no postmaster/PID/socket, a free
local port and removal of only the owned marked cluster. The complete receipt
is .git/unlazy-akasha-webhook-recovery/native-results/akasha-webhook-native-d86b98daa556/result.json,
SHA256 44c0ed3a635522be185b919bca86c45a02eda0694d76393d82f72a569db8a9b9.
These are local synthetic results within the limits above.
