import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CSV_FILE = 'tasks_2026-05-13.csv';
const TARGET_EMAIL = 'andreas@accessinfinity.com';

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
// RFC 4180 CSV parser (handles quoted fields, embedded commas, newlines)
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

// ---------------------------------------------------------------------------
// Mapping helpers (mirror import-tasks.mjs)
// ---------------------------------------------------------------------------
function mapStatus(raw) {
  return raw.toLowerCase() === 'complete' ? 'complete' : 'open';
}

function mapFlagged(raw) {
  return raw.toLowerCase() === 'yes';
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
    .select('id, product, description, week_start_date, status, is_flagged, project_id, projects(name)')
    .eq('admin_user_id', userId);
  if (taskErr) { console.error('Task fetch failed:', taskErr.message); process.exit(1); }
  console.log(`Fetched ${dbTasks.length} tasks from database`);

  // 4. Fetch task_notes
  const taskIds = dbTasks.map(t => t.id);
  let notesMap = {};
  if (taskIds.length > 0) {
    const { data: notes, error: notesErr } = await supabase
      .from('task_notes').select('task_id, content').in('task_id', taskIds);
    if (notesErr) { console.error('Notes fetch failed:', notesErr.message); process.exit(1); }
    for (const n of notes ?? []) notesMap[n.task_id] = n.content;
  }

  // 5. Build composite-key map from DB tasks: key → array of tasks
  // Duplicate keys are kept (not removed) so we can validate and migrate all of them.
  const dbMap = {};  // key → task[]

  for (const t of dbTasks) {
    const projectName = t.projects?.name ?? '';
    const key = compositeKey(t.week_start_date, t.product, projectName, t.description);
    if (!dbMap[key]) dbMap[key] = [];
    dbMap[key].push(t);
  }

  const duplicateKeys = new Set(
    Object.entries(dbMap).filter(([, arr]) => arr.length > 1).map(([k]) => k)
  );

  // 6. Validate each CSV row
  const issues = [];
  const matchedKeys = new Set();

  for (let i = 0; i < csvRows.length; i++) {
    const r = csvRows[i];
    const weekStartDate = r['Week'];
    const product = r['Product'] || 'N/A';
    const projectName = r['Project'] ?? '';
    const description = r['Task Description'];
    const key = compositeKey(weekStartDate, product, projectName, description);

    const dbTaskList = dbMap[key];
    if (!dbTaskList) {
      issues.push({ type: 'UNMATCHED_CSV_ROW', row: i + 2, week: weekStartDate, product, project: projectName, description });
      continue;
    }

    matchedKeys.add(key);

    // Validate all DB rows that share this key
    for (const dbTask of dbTaskList) {
      const checks = [
        { field: 'week_start_date', csv: weekStartDate,             db: dbTask.week_start_date },
        { field: 'product',         csv: product,                   db: dbTask.product },
        { field: 'project_name',    csv: projectName,               db: dbTask.projects?.name ?? '' },
        { field: 'description',     csv: description,               db: dbTask.description },
        { field: 'status',          csv: mapStatus(r['Status']),    db: dbTask.status },
        { field: 'is_flagged',      csv: mapFlagged(r['Flagged']),  db: dbTask.is_flagged },
      ];

      for (const { field, csv, db } of checks) {
        const csvVal = typeof csv === 'string' ? csv : String(csv);
        const dbVal  = typeof db  === 'string' ? db  : String(db);
        if (csvVal !== dbVal) {
          issues.push({ type: 'FIELD_MISMATCH', row: i + 2, key, taskId: dbTask.id, field, csvVal, dbVal });
        }
      }
    }
  }

  // 7. Find DB rows with no matching CSV row
  for (const [key, taskList] of Object.entries(dbMap)) {
    if (!matchedKeys.has(key)) {
      for (const task of taskList) {
        issues.push({
          type: 'UNMATCHED_DB_ROW',
          taskId: task.id,
          week: task.week_start_date,
          product: task.product,
          project: task.projects?.name ?? '',
          description: task.description,
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Report
  // ---------------------------------------------------------------------------
  const fieldMismatches = issues.filter(i => i.type === 'FIELD_MISMATCH');
  const unmatchedCsv    = issues.filter(i => i.type === 'UNMATCHED_CSV_ROW');
  const unmatchedDb     = issues.filter(i => i.type === 'UNMATCHED_DB_ROW');

  console.log('\n=== Validation Report ===');
  console.log(`Total CSV rows:       ${csvRows.length}`);
  console.log(`Matched rows:         ${matchedKeys.size}`);
  console.log(`Duplicate DB keys:    ${duplicateKeys.size}  (WARNING — ${duplicateKeys.size} keys map to 2 DB rows; both will be updated)`);
  console.log(`Unmatched CSV rows:   ${unmatchedCsv.length}  (WARNING — rows in CSV but not in DB)`);
  console.log(`Unmatched DB rows:    ${unmatchedDb.length}  (WARNING — rows in DB but not in CSV)`);
  console.log(`Field mismatches:     ${fieldMismatches.length}`);

  if (duplicateKeys.size > 0) {
    console.log('\n--- DUPLICATE DB KEYS (migrate-notes.mjs will update both rows) ---');
    for (const key of duplicateKeys) {
      console.log(`  ${key}`);
    }
  }

  if (fieldMismatches.length > 0) {
    console.log('\n--- FIELD MISMATCHES ---');
    for (const i of fieldMismatches) {
      console.log(`  [Row ${i.row}] task_id=${i.taskId} | field: ${i.field}`);
      console.log(`    CSV: ${JSON.stringify(i.csvVal)}`);
      console.log(`    DB:  ${JSON.stringify(i.dbVal)}`);
    }
  }

  if (unmatchedCsv.length > 0) {
    console.log('\n--- UNMATCHED CSV ROWS (in CSV, not found in DB) ---');
    for (const i of unmatchedCsv) {
      console.log(`  [Row ${i.row}] Week=${i.week} | Product=${i.product} | Project="${i.project}" | Desc="${i.description.slice(0, 60)}"`);
    }
  }

  if (unmatchedDb.length > 0) {
    console.log('\n--- UNMATCHED DB ROWS (in DB, not in CSV) ---');
    for (const i of unmatchedDb) {
      console.log(`  task_id=${i.taskId} | Week=${i.week} | Product=${i.product} | Project="${i.project}" | Desc="${i.description.slice(0, 60)}"`);
    }
  }

  if (fieldMismatches.length === 0) {
    console.log('\n✓ All matched rows pass non-Notes column validation. Safe to proceed to Step 2.');
    if (duplicateKeys.size > 0) {
      console.log(`  Note: ${duplicateKeys.size} duplicate key(s) found — migrate-notes.mjs will write the note to both DB rows for each.`);
    }
    process.exit(0);
  } else {
    console.log('\n✗ DO NOT PROCEED TO STEP 2 — field mismatches found.');
    console.log('  Fix the discrepancies above before running migrate-notes.mjs.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
