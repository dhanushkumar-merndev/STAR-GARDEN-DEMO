/**
 * Creates a repeatable set of development-only leads.
 *
 * The generated rows are identifiable by source_reference, so --unseed can
 * delete exactly this dataset (and only this dataset). It uses the service-role
 * key because this is a local developer utility, never browser code.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const LEAD_COUNT = 10_000;
const BATCH_SIZE = 500;
const SEED_NAMESPACE = 'development-seed-10000';
const SEED_PREFIX = `${SEED_NAMESPACE}:`;

function loadEnvFile(filename) {
  if (!existsSync(filename)) return;

  for (const line of readFileSync(filename, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || line.trimStart().startsWith('#')) continue;

    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    const value = rawValue.replace(/^(['"])(.*)\1$/, '$2');
    process.env[key] = value;
  }
}

loadEnvFile(resolve(process.cwd(), '.env'));
loadEnvFile(resolve(process.cwd(), '.env.local'));

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Add it to .env before running this command.`);
  return value;
}

function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function pick(random, values) {
  return values[Math.floor(random() * values.length)];
}

const names = [
  'Aarav Sharma', 'Ananya Iyer', 'Arjun Mehta', 'Diya Nair', 'Ishaan Kapoor',
  'Kavya Rao', 'Neel Joshi', 'Priya Menon', 'Rohan Desai', 'Saanvi Gupta',
  'Vihaan Singh', 'Zoya Khan',
];

const locations = [
  'Whitefield, Bengaluru', 'Koramangala, Bengaluru', 'Indiranagar, Bengaluru',
  'HSR Layout, Bengaluru', 'Jayanagar, Bengaluru', 'Sarjapur Road, Bengaluru',
  'JP Nagar, Bengaluru', 'Yelahanka, Bengaluru',
];

const requirements = [
  'Low-maintenance balcony garden with flowering plants.',
  'Terrace garden with a seating corner and drip irrigation.',
  'Indoor plants for a newly renovated office.',
  'Vertical garden for the entrance wall.',
  'Kitchen garden plan for a family home.',
  'Landscape design and execution for a villa garden.',
];

const sources = ['META_FACEBOOK', 'META_INSTAGRAM', 'WEBSITE', 'MANUAL', 'OTHER'];
const statusWeights = [
  ['NEW', 10], ['UNASSIGNED', 9], ['ASSIGNED', 10], ['CONTACTED', 16],
  ['FOLLOW_UP', 18], ['SITE_VISIT_SCHEDULED', 8], ['SITE_VISIT_COMPLETED', 7],
  ['QUALIFIED', 12], ['LOST', 6], ['CLOSED', 4],
];

function weightedStatus(random) {
  let remaining = random() * 100;
  for (const [status, weight] of statusWeights) {
    remaining -= weight;
    if (remaining < 0) return status;
  }
  return 'NEW';
}

function buildLead(index, bdmIds) {
  const random = createRandom(index * 2654435761);
  const status = weightedStatus(random);
  const createdAt = new Date(Date.now() - Math.floor(random() * 180 * 24 * 60 * 60 * 1000));
  const isActive = !['LOST', 'CLOSED'].includes(status);
  const hasOwner = !['NEW', 'UNASSIGNED', 'LOST', 'CLOSED'].includes(status);
  const hasNextAction = isActive && !['NEW', 'UNASSIGNED'].includes(status) && random() > 0.18;
  const leadNumber = String(index).padStart(5, '0');

  return {
    customer_name: `${pick(random, names)} ${leadNumber}`,
    mobile_country_code: '+91',
    mobile_normalized: String(9100000000 + index),
    email: `dev.lead.${leadNumber}@example.invalid`,
    location_text: pick(random, locations),
    site_address: `${10 + (index % 300)}, Garden Lane, ${pick(random, locations)}`,
    requirement_summary: pick(random, requirements),
    source: pick(random, sources),
    source_reference: `${SEED_PREFIX}${leadNumber}`,
    status,
    assigned_bdm_id: hasOwner && bdmIds.length ? pick(random, bdmIds) : null,
    design_required: ['SITE_VISIT_COMPLETED', 'QUALIFIED'].includes(status) && random() > 0.35,
    next_action_at: hasNextAction
      ? new Date(Date.now() + Math.floor((random() * 28 - 7) * 24 * 60 * 60 * 1000)).toISOString()
      : null,
    last_activity_at: new Date(createdAt.getTime() + Math.floor(random() * 7 * 24 * 60 * 60 * 1000)).toISOString(),
    lost_reason: status === 'LOST' ? pick(random, ['Budget constraints', 'No longer required', 'Chose another vendor']) : null,
    created_at: createdAt.toISOString(),
    updated_at: createdAt.toISOString(),
  };
}

async function main() {
  const url = requiredEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const unseed = process.argv.includes('--unseed');

  if (unseed) {
    const { error, count } = await supabase
      .from('leads')
      .delete({ count: 'exact' })
      .like('source_reference', `${SEED_PREFIX}%`);

    if (error) throw error;
    console.log(`Removed ${count ?? 0} development seed leads tagged ${SEED_NAMESPACE}.`);
    return;
  }

  const { count, error: countError } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .like('source_reference', `${SEED_PREFIX}%`);
  if (countError) throw countError;
  if (count) {
    throw new Error(`Found ${count} existing ${SEED_NAMESPACE} leads. Run pnpm dev:unseed before seeding again.`);
  }

  const { data: bdms, error: bdmError } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'BDM')
    .eq('is_active', true);
  if (bdmError) throw bdmError;
  const bdmIds = bdms.map(({ id }) => id);

  for (let offset = 1; offset <= LEAD_COUNT; offset += BATCH_SIZE) {
    const batchEnd = Math.min(offset + BATCH_SIZE, LEAD_COUNT + 1);
    const batch = Array.from({ length: batchEnd - offset }, (_, position) => buildLead(offset + position, bdmIds));
    const { error } = await supabase.from('leads').insert(batch);
    if (error) throw error;
    console.log(`Seeded ${batchEnd - 1}/${LEAD_COUNT} leads.`);
  }

  console.log(`Done. Seeded ${LEAD_COUNT} leads with varied states, sources, owners, and next actions.`);
}

main().catch((error) => {
  console.error(`Development seed failed: ${error.message}`);
  process.exitCode = 1;
});
