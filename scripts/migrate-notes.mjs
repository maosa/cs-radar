import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CSV_FILE = 'tasks_2026-05-13.csv';
const TARGET_EMAIL = 'andreas@accessinfinity.com';
const SPOT_CHECK_SAMPLE = 10;

// ---------------------------------------------------------------------------
// Load .env.local
// ---------------------------------------------------------------------------
function loadEnv() {
  const raw = readFileSync(resolve(ROOT, '.env.local'), 'utf8');
  const env = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

// ---------------------------------------------------------------------------
// RFC 4180 CSV parser
// ---------------------------------------------------------------------------
function parseCsv(text) {
  const content = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  let i = 0;

  while (i < content.length) {
    const ch = content[i];
    const next = content[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') { field += '"'; i += 2; }
      else if (ch === '"') { inQuotes = false; i++; }
      else { field += ch; i++; }
    } else {
      if (ch === '"') { inQuotes = true; i++; }
      else if (ch === ',') { row.push(field); field = ''; i++; }
      else if (ch === '\r' && next === '\n') { row.push(field); field = ''; rows.push(row); row = []; i += 2; }
      else if (ch === '\n') { row.push(field); field = ''; rows.push(row); row = []; i++; }
      else { field += ch; i++; }
    }
  }

  if (field || row.length) {
    row.push(field);
    if (row.some(f => f !== '')) rows.push(row);
  }

  if (rows.length < 2) throw new Error('CSV appears to be empty or header-only');

  const headers = rows[0];
  return rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h.trim()] = (r[idx] ?? '').trim(); });
    return obj;
  });
}

function compositeKey(weekStartDate, product, projectName, description) {
  return `${weekStartDate}|${product}|${projectName ?? ''}|${description}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const env = loadEnv();
  const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
  const serviceRoleKey = env['SUPABASE_SERVICE_ROLE_KEY'];

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Resolve target user
  const { data: users, error: userErr } = await supabase
    .from('users').select('id').eq('email', TARGET_EMAIL).limit(1);
  if (userErr) { console.error('User lookup failed:', userErr.message); process.exit(1); }
  if (!users?.length) { console.error(`User not found: ${TARGET_EMAIL}`); process.exit(1); }
  const userId = users[0].id;
  console.log(`Target user: ${TARGET_EMAIL} (${userId})\n`);

  // 2. Parse CSV
  const csvText = readFileSync(resolve(ROOT, CSV_FILE), 'utf8');
  const csvRows = parseCsv(csvText);
  console.log(`Parsed ${csvRows.length} CSV rows from ${CSV_FILE}`);

  // 3. Fetch all DB tasks with project names
  const { data: dbTasks, error: taskErr } = await supabase
    .from('tasks')
    .select('id, product, description, week_start_date, project_id, projects(name)')
    .eq('admin_user_id', userId);
  if (taskErr) { console.error('Task fetch failed:', taskErr.message); process.exit(1); }
  console.log(`Fetched ${dbTasks.length} tasks from database`);

  // 4. Fetch existing task_notes
  const taskIds = dbTasks.map(t => t.id);
  let existingNotesMap = {};
  if (taskIds.length > 0) {
    const { data: notes, error: notesErr } = await supabase
      .from('task_notes').select('task_id, content').in('task_id', taskIds);
    if (notesErr) { console.error('Notes fetch failed:', notesErr.message); process.exit(1); }
    for (const n of notes ?? []) existingNotesMap[n.task_id] = n.content;
  }
  console.log(`Fetched ${Object.keys(existingNotesMap).length} existing task_notes rows`);

  // 5. Build composite-key map: key → task[] (keeps duplicates)
  const dbMap = {};

  for (const t of dbTasks) {
    const projectName = t.projects?.name ?? '';
    const key = compositeKey(t.week_start_date, t.product, projectName, t.description);
    if (!dbMap[key]) dbMap[key] = [];
    dbMap[key].push(t);
  }

  const duplicateKeyCount = Object.values(dbMap).filter(arr => arr.length > 1).length;
  if (duplicateKeyCount > 0) {
    console.log(`Note: ${duplicateKeyCount} duplicate key(s) found — notes will be written to all matching DB rows.`);
  }

  // 6. Build upsert payloads (Option A: only rows where CSV note differs from DB)
  const upsertPayloads = [];
  let skippedEmpty = 0;
  let skippedMatch = 0;
  let skippedNoTask = 0;
  const upsertedTaskIds = [];

  for (const r of csvRows) {
    const csvNotes = r['Notes'];

    if (!csvNotes) { skippedEmpty++; continue; }

    const weekStartDate = r['Week'];
    const product = r['Product'] || 'N/A';
    const projectName = r['Project'] ?? '';
    const description = r['Task Description'];
    const key = compositeKey(weekStartDate, product, projectName, description);

    const dbTaskList = dbMap[key];
    if (!dbTaskList) { skippedNoTask++; continue; }

    for (const dbTask of dbTaskList) {
      const existingContent = existingNotesMap[dbTask.id] ?? null;
      if (existingContent === csvNotes) { skippedMatch++; continue; }

      upsertPayloads.push({
        task_id: dbTask.id,
        content: csvNotes,
        created_by: userId,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      });
      upsertedTaskIds.push(dbTask.id);
    }
  }

  // Deduplicate by task_id — duplicate CSV rows can produce the same task_id twice,
  // and PostgreSQL rejects a single upsert batch that targets the same row more than once.
  const seenTaskIds = new Set();
  const dedupedPayloads = [];
  for (const p of upsertPayloads) {
    if (!seenTaskIds.has(p.task_id)) {
      seenTaskIds.add(p.task_id);
      dedupedPayloads.push(p);
    }
  }
  const dedupedCount = upsertPayloads.length - dedupedPayloads.length;

  console.log('\n--- Pre-migration summary ---');
  console.log(`CSV rows processed:     ${csvRows.length}`);
  console.log(`Notes empty in CSV:     ${skippedEmpty}  (skipped — nothing to write)`);
  console.log(`Notes already match DB: ${skippedMatch}  (skipped — no change needed)`);
  console.log(`No matching DB task:    ${skippedNoTask}  (skipped — unmatched rows)`);
  console.log(`Duplicate CSV rows:     ${dedupedCount}  (deduplicated — same task_id)`);
  console.log(`Notes to upsert:        ${dedupedPayloads.length}`);

  if (dedupedPayloads.length === 0) {
    console.log('\n✓ Nothing to migrate — all CSV notes already match the database.');
    process.exit(0);
  }

  // 7. Execute batch upsert
  // Strategy: single API call using the UNIQUE(task_id) constraint.
  // Not wrapped in a DB transaction (Supabase JS REST client does not expose one).
  // The operation is idempotent — re-running is safe if a partial failure occurs.
  console.log('\nExecuting upsert...');

  const { error: upsertErr } = await supabase
    .from('task_notes')
    .upsert(dedupedPayloads, { onConflict: 'task_id' });

  if (upsertErr) {
    console.error('\n✗ Upsert failed:', upsertErr.message);
    console.error('The operation is idempotent — re-running migrate-notes.mjs is safe.');
    process.exit(1);
  }

  console.log(`✓ Upserted ${dedupedPayloads.length} task_notes rows successfully.`);

  // 8. Spot-check: re-query a random sample of updated rows
  const sampleSize = Math.min(SPOT_CHECK_SAMPLE, upsertedTaskIds.length);
  const shuffled = [...upsertedTaskIds].sort(() => Math.random() - 0.5);
  const sampleIds = shuffled.slice(0, sampleSize);

  const { data: spotNotes, error: spotErr } = await supabase
    .from('task_notes').select('task_id, content').in('task_id', sampleIds);

  if (spotErr) {
    console.error('\nSpot-check query failed:', spotErr.message);
    process.exit(1);
  }

  // Build a quick lookup of what we intended to write
  const intendedMap = {};
  for (const p of dedupedPayloads) intendedMap[p.task_id] = p.content;

  console.log(`\n=== Spot-check (${sampleSize} random updated rows) ===`);
  let spotFailures = 0;
  for (const n of spotNotes ?? []) {
    const intended = intendedMap[n.task_id];
    const ok = n.content === intended;
    if (!ok) spotFailures++;
    const preview = (n.content ?? '').slice(0, 60).replace(/\n/g, '↵');
    console.log(`  ${ok ? '✓' : '✗'} task_id=${n.task_id} | "${preview}"`);
  }

  console.log('\n=== Migration Report ===');
  console.log(`CSV rows processed:     ${csvRows.length}`);
  console.log(`Notes upserted:         ${dedupedPayloads.length}`);
  console.log(`Spot-check failures:    ${spotFailures}`);

  if (spotFailures > 0) {
    console.error('\n✗ Spot-check detected mismatches — review the output above.');
    process.exit(1);
  }

  console.log('\n✓ Migration complete. All spot-check rows match.');
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
