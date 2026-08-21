/**
 * Creates a repeatable development dataset that exercises the whole CRM.
 *
 * Not just leads: the rows below fan out into calls, follow-ups, site visits,
 * design projects and versions, execution projects and tasks, and account
 * ledgers — because a dashboard, a follow-up calendar and a designer workload
 * panel cannot be judged against a table of leads with nothing hanging off
 * them.
 *
 * Every generated row is reachable from a lead tagged in `source_reference`,
 * and every child table cascades on lead delete, so `--unseed` removes exactly
 * this dataset and nothing else.
 *
 * Uses the service-role key: this is a local operator utility, never browser
 * code. It writes to whichever project `.env` points at — check that before
 * running it.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const LEAD_COUNT = Number(process.env.SEED_LEAD_COUNT ?? 10_000);
const BATCH_SIZE = 250;
const SEED_NAMESPACE = 'development-seed-10000';
const SEED_PREFIX = `${SEED_NAMESPACE}:`;
const DAY = 24 * 60 * 60 * 1000;

function loadEnvFile(filename) {
  if (!existsSync(filename)) return;

  for (const line of readFileSync(filename, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || line.trimStart().startsWith('#')) continue;

    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^(['"])(.*)\1$/, '$2');
  }
}

loadEnvFile(resolve(process.cwd(), '.env'));
loadEnvFile(resolve(process.cwd(), '.env.local'));

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Add it to .env before running this command.`);
  return value;
}

/** Deterministic per lead, so a re-run produces the same dataset. */
function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

const pick = (random, values) => values[Math.floor(random() * values.length)];

/** Mirrors `app.financial_year_label()`: 1 April to 31 March, in IST. */
function istFinancialYear() {
  const ist = new Date(Date.now() + 5.5 * 3_600_000);
  const year = ist.getUTCFullYear();
  const start = ist.getUTCMonth() + 1 >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}
const iso = (ms) => new Date(ms).toISOString();

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

/* -------------------------------------------------------------------------- */
/* Leads                                                                      */
/* -------------------------------------------------------------------------- */

function buildLead(index, ownerIds, leadCode) {
  const random = createRandom(index * 2654435761);
  const status = weightedStatus(random);
  const createdAt = Date.now() - Math.floor(random() * 180 * DAY);
  const isActive = !['LOST', 'CLOSED'].includes(status);
  const hasOwner = !['NEW', 'UNASSIGNED'].includes(status);
  const hasNextAction = isActive && !['NEW', 'UNASSIGNED'].includes(status) && random() > 0.18;
  const leadNumber = String(index).padStart(5, '0');

  return {
    // Assigned here rather than left to the trigger. Under a bulk insert the
    // trigger's counter hands the same number to more than one row in the same
    // statement, which fails the unique index; a seed run has the whole range
    // to itself, so it can number the batch itself and move the counter on at
    // the end.
    lead_code: leadCode,
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
    assigned_bdm_id: hasOwner && ownerIds.length ? pick(random, ownerIds) : null,
    design_required:
      ['SITE_VISIT_COMPLETED', 'QUALIFIED', 'CLOSED'].includes(status) && random() > 0.25,
    next_action_at: hasNextAction ? iso(Date.now() + Math.floor((random() * 28 - 7) * DAY)) : null,
    last_activity_at: iso(createdAt + Math.floor(random() * 7 * DAY)),
    first_call_attempt_at: ['NEW', 'UNASSIGNED', 'ASSIGNED'].includes(status)
      ? null
      : iso(createdAt + DAY),
    lost_reason:
      status === 'LOST'
        ? pick(random, ['Budget constraints', 'No longer required', 'Chose another vendor'])
        : null,
    created_at: iso(createdAt),
    updated_at: iso(createdAt),
  };
}

/* -------------------------------------------------------------------------- */
/* Everything downstream of a lead                                            */
/* -------------------------------------------------------------------------- */

const CALL_OUTCOMES = [
  'CONNECTED', 'NO_ANSWER', 'BUSY', 'SWITCHED_OFF',
  'INVALID_NUMBER', 'CALL_LATER', 'INTERESTED', 'NOT_INTERESTED',
];

/**
 * Fans one lead out into the records its status implies.
 *
 * Status is the source of truth: a SITE_VISIT_SCHEDULED lead gets a booked
 * visit in the future, a CLOSED one gets an approved design, a finished
 * execution project and a paid ledger. Generating children that contradict the
 * lead's stage would make every dashboard number wrong in a way that looks
 * plausible, which is worse than having no data at all.
 */
function buildChildren(lead, staff) {
  const random = createRandom((Number(lead.mobile_normalized) % 100000) * 2654435761 + 7);
  const created = new Date(lead.created_at).getTime();
  const { owners, designers, execution } = staff;
  const owner = lead.assigned_bdm_id ?? (owners.length ? pick(random, owners) : null);
  const designer = designers.length ? pick(random, designers) : null;
  const worker = execution.length ? pick(random, execution) : null;

  const out = {
    activities: [],
    followUps: [],
    siteVisits: [],
    designProjects: [],
    designVersions: [],
    files: [],
    executionProjects: [],
    executionTasks: [],
    accounts: [],
    designApprovals: [],
  };

  const contacted = !['NEW', 'UNASSIGNED', 'ASSIGNED'].includes(lead.status);

  if (contacted) {
    out.activities.push({
      lead_id: lead.id,
      type: 'CALL_ATTEMPT',
      notes: 'Called the customer.',
      activity_at: iso(created + DAY),
      created_by: owner,
    });
    out.activities.push({
      lead_id: lead.id,
      type: 'CALL_OUTCOME',
      outcome:
        lead.status === 'LOST'
          ? 'NOT_INTERESTED'
          : ['QUALIFIED', 'CLOSED', 'SITE_VISIT_SCHEDULED', 'SITE_VISIT_COMPLETED'].includes(lead.status)
            ? 'INTERESTED'
            : pick(random, CALL_OUTCOMES),
      notes: 'Recorded after the call.',
      activity_at: iso(created + DAY + 3_600_000),
      created_by: owner,
    });
  }

  if (random() > 0.6) {
    out.activities.push({
      lead_id: lead.id,
      type: 'NOTE',
      notes: pick(random, [
        'Customer asked for a revised quote.',
        'Prefers weekend visits only.',
        'Wants low-water plants.',
      ]),
      activity_at: iso(created + 2 * DAY),
      created_by: owner,
    });
  }

  // Follow-ups: a spread of overdue, due today, upcoming and completed, so the
  // calendar and the queue tabs all have something in them.
  if (['CONTACTED', 'FOLLOW_UP', 'QUALIFIED'].includes(lead.status) && random() > 0.35) {
    const roll = random();
    const offsetDays = roll < 0.3 ? -Math.ceil(random() * 10) : Math.ceil(random() * 21);
    const completed = roll > 0.85;

    out.followUps.push({
      lead_id: lead.id,
      assigned_to: owner,
      title: pick(random, ['Send the quote', 'Confirm the visit date', 'Share plant options']),
      notes: 'Auto-generated for the development dataset.',
      due_at: iso(Date.now() + offsetDays * DAY),
      status: completed ? 'COMPLETED' : offsetDays < 0 ? 'OVERDUE' : 'OPEN',
      completed_at: completed ? iso(Date.now() - DAY) : null,
      completed_by: completed ? owner : null,
      created_by: owner,
    });
  }

  const visitScheduled = lead.status === 'SITE_VISIT_SCHEDULED';
  const visitDone = ['SITE_VISIT_COMPLETED', 'QUALIFIED', 'CLOSED'].includes(lead.status);

  if (visitScheduled || visitDone) {
    const start = visitScheduled
      ? Date.now() + Math.ceil(random() * 12) * DAY
      : created + 5 * DAY;

    out.siteVisits.push({
      lead_id: lead.id,
      assigned_designer_id: designer,
      scheduled_start_at: iso(start),
      scheduled_end_at: iso(start + 2 * 3_600_000),
      address: lead.site_address,
      status: visitScheduled ? 'SCHEDULED' : 'COMPLETED',
      journey_status: visitScheduled ? 'NOT_STARTED' : 'ARRIVED',
      journey_tracking_enabled: true,
      check_in_at: visitDone ? iso(start) : null,
      check_out_at: visitDone ? iso(start + 90 * 60_000) : null,
      notes: visitDone ? 'Measured the site and discussed plant choices.' : null,
      requirement_summary: visitDone ? lead.requirement_summary : null,
      created_by: owner,
      created_at: iso(created + 3 * DAY),
    });
  }

  // Designs. A CLOSED lead always gets an approved one, because execution
  // cannot exist without an approved version to point at.
  const wantsDesign = lead.design_required || lead.status === 'CLOSED';
  if (wantsDesign && visitDone) {
    const projectId = randomUUID();
    const designStatus =
      lead.status === 'CLOSED'
        ? 'APPROVED'
        : pick(random, ['REQUIRED', 'ASSIGNED', 'IN_PROGRESS', 'READY_FOR_REVIEW', 'APPROVED']);
    const hasVersion = designStatus !== 'REQUIRED';
    const versionId = randomUUID();
    const fileId = randomUUID();
    const designCreated = created + 7 * DAY;

    if (hasVersion) {
      // Storage keys are fabricated: the row exists so the workflow has
      // something to reference, but nothing was uploaded to Tigris, so a
      // download of a seeded file will 404. That is the intended trade-off.
      out.files.push({
        id: fileId,
        category: 'DESIGN_VERSION',
        object_key: `seed/${SEED_NAMESPACE}/${versionId}.pdf`,
        original_filename: 'garden-layout-v1.pdf',
        safe_filename: 'garden-layout-v1.pdf',
        mime_type: 'application/pdf',
        extension: 'pdf',
        size_bytes: 240_000 + Math.floor(random() * 500_000),
        design_project_id: projectId,
        uploaded_by: designer,
        created_at: iso(designCreated + DAY),
      });

      out.designVersions.push({
        id: versionId,
        design_project_id: projectId,
        version_number: 1,
        file_id: fileId,
        version_note: 'First layout.',
        status: designStatus === 'APPROVED' ? 'APPROVED' : 'READY_FOR_REVIEW',
        uploaded_by: designer,
        ready_for_review_at: iso(designCreated + DAY),
        reviewed_by: designStatus === 'APPROVED' ? owner : null,
        reviewed_at: designStatus === 'APPROVED' ? iso(designCreated + 2 * DAY) : null,
        created_at: iso(designCreated + DAY),
      });
    }

    /**
     * Approval is a second pass, not a column on the first insert.
     *
     * `design_projects.approved_version_id` points at `design_versions`, which
     * points back at the project — and a check constraint forbids an APPROVED
     * project without one. So the project goes in unapproved, its version
     * follows, and only then is the approval written.
     */
    const project = {
      id: projectId,
      lead_id: lead.id,
      assigned_designer_id: designStatus === 'REQUIRED' ? null : designer,
      status: designStatus === 'APPROVED' ? 'READY_FOR_REVIEW' : designStatus,
      requirement_notes: lead.requirement_summary,
      due_at: iso(Date.now() + Math.ceil(random() * 14 - 4) * DAY),
      created_by: owner,
      created_at: iso(designCreated),
    };
    out.designProjects.push(project);

    if (designStatus === 'APPROVED') {
      out.designApprovals.push({
        ...project,
        status: 'APPROVED',
        approved_version_id: versionId,
        approved_by: owner,
        approved_at: iso(designCreated + 2 * DAY),
      });
    }

    if (lead.status === 'CLOSED') {
      const executionId = randomUUID();
      const executionStatus = pick(random, ['ASSIGNED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED']);
      const executionCreated = designCreated + 5 * DAY;
      const done = executionStatus === 'COMPLETED';

      out.executionProjects.push({
        id: executionId,
        lead_id: lead.id,
        design_project_id: projectId,
        approved_design_version_id: versionId,
        title: 'Garden build',
        status: executionStatus,
        planned_start_at: iso(executionCreated),
        due_at: iso(executionCreated + 21 * DAY),
        completed_at: done ? iso(executionCreated + 20 * DAY) : null,
        progress_percent: done ? 100 : executionStatus === 'ASSIGNED' ? 0 : 40 + Math.floor(random() * 40),
        blocker_summary: executionStatus === 'BLOCKED' ? 'Waiting on soil delivery.' : null,
        created_by: owner,
        created_at: iso(executionCreated),
      });

      ['Site preparation', 'Planting', 'Irrigation', 'Handover'].forEach((title, position) => {
        const taskDone = done || position < 2;
        out.executionTasks.push({
          execution_project_id: executionId,
          title,
          assigned_to: worker,
          is_mandatory: position === 0,
          status: taskDone ? 'COMPLETED' : executionStatus === 'BLOCKED' && position === 2 ? 'BLOCKED' : 'TODO',
          blocker_notes:
            executionStatus === 'BLOCKED' && position === 2 ? 'Soil delivery delayed.' : null,
          due_at: iso(executionCreated + (position + 1) * 5 * DAY),
          completed_at: taskDone ? iso(executionCreated + (position + 1) * 4 * DAY) : null,
          completed_by: taskDone ? worker : null,
          sort_order: position,
          created_by: owner,
          created_at: iso(executionCreated),
        });
      });

      const total = 60_000 + Math.floor(random() * 240_000);
      const received = done ? total : Math.floor(total * (random() * 0.6));
      out.accounts.push({
        lead_id: lead.id,
        total_amount: total,
        received_amount: received,
        currency: 'INR',
        payment_status: received === 0 ? 'PENDING' : received >= total ? 'PAID' : 'PARTIAL',
        invoice_number: `SEED-${String(lead.mobile_normalized).slice(-5)}`,
        invoiced_at: iso(executionCreated),
        created_at: iso(executionCreated),
      });
    }
  }

  return out;
}

/* -------------------------------------------------------------------------- */

async function insertAll(supabase, table, rows) {
  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    const { error } = await supabase.from(table).insert(rows.slice(offset, offset + BATCH_SIZE));
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  if (rows.length) console.log(`  ${table}: ${rows.length}`);
}

async function main() {
  const url = requiredEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (process.argv.includes('--unseed')) {
    const { error, count } = await supabase
      .from('leads')
      .delete({ count: 'exact' })
      .like('source_reference', `${SEED_PREFIX}%`);

    if (error) throw error;
    console.log(`Removed ${count ?? 0} seeded leads and everything cascading from them.`);
    return;
  }

  const { count, error: countError } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .like('source_reference', `${SEED_PREFIX}%`);
  if (countError) throw countError;
  if (count) {
    throw new Error(`Found ${count} existing seeded leads. Run pnpm dev:unseed first.`);
  }

  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('is_active', true);
  if (profileError) throw profileError;

  // Owners are BDMs when the business runs that role and Admins when it does
  // not — the same rule `listAssignableBdms` applies, so seeded leads are
  // owned by someone the app would actually offer.
  const bdms = profiles.filter((p) => p.role === 'BDM').map((p) => p.id);
  const admins = profiles.filter((p) => p.role === 'ADMIN').map((p) => p.id);
  const staff = {
    owners: bdms.length ? bdms : admins,
    designers: profiles.filter((p) => p.role === 'DESIGNER').map((p) => p.id),
    execution: profiles.filter((p) => p.role === 'EXECUTION').map((p) => p.id),
  };

  if (!staff.owners.length) throw new Error('No active Admin or BDM to own the seeded leads.');
  console.log(
    `Staff: ${staff.owners.length} owner(s), ${staff.designers.length} designer(s), ${staff.execution.length} execution.`,
  );

  // Reserve a code range up front. `lead_code_counters` is the same row the
  // trigger reads, so moving it past the range at the end keeps real leads
  // created afterwards from colliding with seeded ones.
  const financialYear = istFinancialYear();
  const { data: counterRow } = await supabase
    .from('lead_code_counters')
    .select('last_value')
    .eq('financial_year', financialYear)
    .maybeSingle();
  const codeBase = counterRow?.last_value ?? 0;
  console.log(`Reserving lead codes SG-${financialYear}-${codeBase + 1} … ${codeBase + LEAD_COUNT}.`);

  const children = {
    activities: [], followUps: [], siteVisits: [], designProjects: [],
    designVersions: [], files: [], executionProjects: [], executionTasks: [],
    accounts: [], designApprovals: [],
  };

  for (let offset = 1; offset <= LEAD_COUNT; offset += BATCH_SIZE) {
    const batchEnd = Math.min(offset + BATCH_SIZE, LEAD_COUNT + 1);
    const batch = Array.from({ length: batchEnd - offset }, (_, position) => {
      const index = offset + position;
      return buildLead(index, staff.owners, `SG-${financialYear}-${codeBase + index}`);
    });

    // `select()` on insert: the child rows need the ids the database assigned,
    // and a second round trip to fetch them by tag would be both slower and
    // ambiguous while another batch is in flight.
    /**
     * One retry on a lead_code collision.
     *
     * The code comes from a trigger that claims the next number from a counter
     * row, so a batch is only ever unique relative to what that counter has
     * already handed out. Under bulk load the odd batch loses the race; the
     * retry simply asks for fresh numbers rather than failing a run that is
     * thousands of rows in.
     */
    let data;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await supabase
        .from('leads')
        .insert(batch)
        .select('id, status, assigned_bdm_id, design_required, site_address, requirement_summary, mobile_normalized, created_at');

      if (!result.error) {
        data = result.data;
        break;
      }
      if (attempt === 2 || !result.error.message.includes('lead_code')) throw result.error;
      console.log(`  retrying batch after code collision (attempt ${attempt + 2})…`);
    }

    for (const lead of data ?? []) {
      const built = buildChildren(lead, staff);
      for (const key of Object.keys(children)) children[key].push(...built[key]);
    }

    console.log(`Seeded ${batchEnd - 1}/${LEAD_COUNT} leads.`);
  }

  const { error: counterError } = await supabase
    .from('lead_code_counters')
    .upsert({ financial_year: financialYear, last_value: codeBase + LEAD_COUNT });
  if (counterError) throw counterError;

  console.log('Writing related records…');
  // Order matters: a design version points at a file, and an execution project
  // points at a design version.
  await insertAll(supabase, 'activities', children.activities);
  await insertAll(supabase, 'follow_ups', children.followUps);
  await insertAll(supabase, 'site_visits', children.siteVisits);
  await insertAll(supabase, 'design_projects', children.designProjects);
  await insertAll(supabase, 'files', children.files);
  await insertAll(supabase, 'design_versions', children.designVersions);

  // Second pass: now that the versions exist, mark the approved projects.
  for (let offset = 0; offset < children.designApprovals.length; offset += BATCH_SIZE) {
    const { error } = await supabase
      .from('design_projects')
      .upsert(children.designApprovals.slice(offset, offset + BATCH_SIZE));
    if (error) throw new Error(`design approvals: ${error.message}`);
  }
  if (children.designApprovals.length) {
    console.log(`  design approvals: ${children.designApprovals.length}`);
  }

  await insertAll(supabase, 'execution_projects', children.executionProjects);
  await insertAll(supabase, 'execution_tasks', children.executionTasks);
  await insertAll(supabase, 'lead_accounts', children.accounts);

  console.log(`\nDone. ${LEAD_COUNT} leads plus their calls, follow-ups, visits, designs, execution and accounts.`);
}

main().catch((error) => {
  console.error(`Seed failed: ${error.message}`);
  process.exitCode = 1;
});
