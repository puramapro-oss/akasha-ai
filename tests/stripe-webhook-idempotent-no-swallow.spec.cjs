// Source guard only. Executable recovery tests and native SQL evidence remain
// necessary: regexes cannot prove delivery, atomicity or economic correctness.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
const publicRoute = read('src/app/api/stripe/webhook/route.ts');
const internalRoute = read('src/app/api/internal/stripe-fulfillment/route.ts');
const handler = read('src/lib/stripe/webhook-handler.ts');
const journal = read('src/lib/webhook-idempotency.ts');
const body = handler.slice(handler.indexOf('export async function handleVerifiedStripeWebhook'));
const migrationPath = 'supabase/migrations/20261111_stripe_webhook_journal.sql';
const migration = read(migrationPath);

let pass = 0;
function check(name, condition) {
  assert.ok(condition, 'FAIL: ' + name);
  pass++;
  console.log('PASS: ' + name);
}

check('both authenticated routes delegate to the same verified handler',
  [publicRoute, internalRoute].every(source =>
    source.includes("from '@/lib/stripe/webhook-handler'") &&
    source.includes('webhooks.constructEvent(') &&
    source.indexOf('webhooks.constructEvent(') < source.indexOf('return handleVerifiedStripeWebhook(event)')));

const admission = body.indexOf('await admitStripeWebhookEvent(');
const effects = body.indexOf('await applyVerifiedEvent(event)');
const completion = body.indexOf('await completeStripeWebhookEvent(');
check('durable admission precedes all common effects', admission >= 0 && effects > admission);

check('an admitted-only or unresolved duplicate is not acknowledged as completed',
  /if \(!admission\.admitted\)\s*\{\s*return admission\.state === 'completed'/.test(body) &&
  /duplicate: true[\s\S]{0,180}status: 503/.test(body));

check('effects precede durable completion and failures retain reconciliation with 503',
  completion > effects &&
  body.indexOf('return NextResponse.json({ received: true })') > completion &&
  body.includes('await reconcileStripeWebhookEvent(') &&
  (body.match(/status: 503/g) || []).length >= 3);

check('legacy forced-success comments and claim deletion are absent from the ingress protocol',
  [publicRoute, internalRoute, handler, journal].every(source =>
    !/Return 200 to prevent Stripe from retrying|\.delete\s*\(/.test(source)));

check('new journal migration preserves legacy prerequisites and uses a composite delivery identity',
  fs.existsSync(path.join(__dirname, '../supabase/migrations/20260926_stripe_events_processed.sql')) &&
  migration.includes("to_regclass('akasha_ai.stripe_events')") &&
  migration.includes("to_regclass('akasha_ai.stripe_events_processed')") &&
  migration.includes('PRIMARY KEY (stripe_account_key, livemode, event_id)'));

check('RPC errors fail closed and admission/completion receipts validate identity and owner',
  (journal.match(/if \(error\) throw new Error/g) || []).length === 3 &&
  journal.includes('!sameIdentity(receipt, event)') &&
  (journal.match(/!sameIdentity\(receipt, identity\)/g) || []).length === 2 &&
  journal.includes('receipt.attempt_token !== attemptToken') &&
  !/error\.code === '42P01'/.test(journal));

console.log('\n' + pass + '/7 PASS');
