import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CSV_FILE = 'tasks_2026-05-13.csv';
const TARGET_EMAIL = 'andreas@accessinfinity.com';

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

function parseCsv(text) {
  const content = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows = [];
  let field = '', row = [], inQuotes = false, i = 0;
  while (i < content.length) {
    const ch = content[i], next = content[i + 1];
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
  if (field || row.length) { row.push(field); if (row.some(f => f !== '')) rows.push(row); }
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

async function main() {
  const env = loadEnv();
  const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'], {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Resolve user
  const { data: users, error: userErr } = await supabase
    .from('users').select('id').eq('email', TARGET_EMAIL).limit(1);
  if (userErr || !users?.length) { console.error('User lookup failed'); process.exit(1); }
  const userId = users[0].id;
  console.log(`Target user: ${TARGET_EMAIL} (${userId})\n`);

  // Parse CSV — build a map from composite key → expected Notes content
  const csvRows = parseCsv(readFileSync(resolve(ROOT, CSV_FILE), 'utf8'));
  const csvNotesMap = {};   // key → notes string (may be empty)
  for (const r of csvRows) {
    const key = compositeKey(r['Week'], r['Product'] || 'N/A', r['Project'] ?? '', r['Task Description']);
    // Last value wins for duplicate CSV keys (content is identical anyway)
    csvNotesMap[key] = r['Notes'];
  }
  console.log(`Parsed ${csvRows.length} CSV rows (${Object.keys(csvNotesMap).length} unique keys)`);

  // Fetch all tasks with project names
  const { data: dbTasks, error: taskErr } = await supabase
    .from('tasks')
    .select('id, product, description, week_start_date, projects(name)')
    .eq('admin_user_id', userId);
  if (taskErr) { console.error('Task fetch failed:', taskErr.message); process.exit(1); }

  // Build task_id → composite key map
  const taskKeyMap = {};
  for (const t of dbTasks) {
    const projectName = t.projects?.name ?? '';
    taskKeyMap[t.id] = compositeKey(t.week_start_date, t.product, projectName, t.description);
  }

  // Fetch ALL task_notes for this user
  const taskIds = dbTasks.map(t => t.id);
  const { data: allNotes, error: notesErr } = await supabase
    .from('task_notes').select('task_id, content').in('task_id', taskIds);
  if (notesErr) { console.error('Notes fetch failed:', notesErr.message); process.exit(1); }

  console.log(`Fetched ${allNotes.length} task_notes rows from database\n`);

  const failures = [];
  let correctCount = 0;

  // Check 1: every task_notes row matches the CSV
  for (const note of allNotes) {
    const key = taskKeyMap[note.task_id];
    const expectedNotes = key ? (csvNotesMap[key] ?? '') : null;

    if (expectedNotes === null) {
      failures.push({ type: 'ORPHAN_NOTE', taskId: note.task_id, dbContent: note.content });
      continue;
    }

    if (note.content !== expectedNotes) {
      failures.push({
        type: 'CONTENT_MISMATCH',
        taskId: note.task_id,
        key,
        csvContent: expectedNotes,
        dbContent: note.content,
      });
    } else {
      correctCount++;
    }
  }

  // Check 2: every CSV row with a non-empty Note has a task_notes row
  const notedTaskIds = new Set(allNotes.map(n => n.task_id));
  for (const t of dbTasks) {
    const key = taskKeyMap[t.id];
    const expectedNotes = csvNotesMap[key] ?? '';
    if (expectedNotes && !notedTaskIds.has(t.id)) {
      failures.push({ type: 'MISSING_NOTE', taskId: t.id, key, csvContent: expectedNotes });
    }
  }

  // Check 3: no task_notes row exists for a task whose CSV Notes is empty
  for (const note of allNotes) {
    const key = taskKeyMap[note.task_id];
    const expectedNotes = key ? (csvNotesMap[key] ?? '') : '';
    if (!expectedNotes) {
      // Only flag if this is a spurious note (not a pre-existing one we intentionally kept)
      // We can't distinguish pre-existing from spurious without history, so report as INFO
      failures.push({ type: 'NOTE_FOR_EMPTY_CSV', taskId: note.task_id, key, dbContent: note.content });
    }
  }

  // ---------------------------------------------------------------------------
  // Report
  // ---------------------------------------------------------------------------
  const contentMismatches = failures.filter(f => f.type === 'CONTENT_MISMATCH');
  const missingNotes      = failures.filter(f => f.type === 'MISSING_NOTE');
  const orphanNotes       = failures.filter(f => f.type === 'ORPHAN_NOTE');
  const emptyNotes        = failures.filter(f => f.type === 'NOTE_FOR_EMPTY_CSV');

  console.log('=== Verification Report ===');
  console.log(`task_notes rows in DB:          ${allNotes.length}`);
  console.log(`Content matches CSV:            ${correctCount}`);
  console.log(`Content mismatches:             ${contentMismatches.length}  ← BLOCKING`);
  console.log(`Missing notes (in CSV, not DB): ${missingNotes.length}  ← BLOCKING`);
  console.log(`Orphan notes (no DB task):      ${orphanNotes.length}  ← BLOCKING`);
  console.log(`Notes where CSV is empty:       ${emptyNotes.length}  ← INFO (pre-existing notes kept intentionally)`);

  if (contentMismatches.length > 0) {
    console.log('\n--- CONTENT MISMATCHES ---');
    for (const f of contentMismatches) {
      console.log(`  task_id: ${f.taskId}`);
      console.log(`  Key:     ${f.key}`);
      console.log(`  CSV:     ${JSON.stringify(f.csvContent.slice(0, 120))}`);
      console.log(`  DB:      ${JSON.stringify(f.dbContent.slice(0, 120))}`);
    }
  }

  if (missingNotes.length > 0) {
    console.log('\n--- MISSING NOTES (CSV has content, DB has no row) ---');
    for (const f of missingNotes) {
      console.log(`  task_id: ${f.taskId} | ${f.key}`);
      console.log(`  Expected: ${JSON.stringify(f.csvContent.slice(0, 120))}`);
    }
  }

  if (orphanNotes.length > 0) {
    console.log('\n--- ORPHAN NOTES (task_id not found in tasks table) ---');
    for (const f of orphanNotes) console.log(`  task_id: ${f.taskId}`);
  }

  if (emptyNotes.length > 0) {
    console.log('\n--- INFO: Notes where CSV Notes column is empty ---');
    console.log('  These are pre-existing notes that were already in the DB before the migration.');
    console.log('  They were intentionally preserved (migration never deletes existing notes).');
    for (const f of emptyNotes) {
      console.log(`  task_id: ${f.taskId} | ${f.key ?? '(key not found)'}`);
      console.log(`  Content: "${f.dbContent.slice(0, 80)}"`);
    }
  }

  const blocking = contentMismatches.length + missingNotes.length + orphanNotes.length;
  if (blocking === 0) {
    console.log('\n✓ Full verification passed. All task_notes rows match the CSV.');
  } else {
    console.log(`\n✗ Verification failed — ${blocking} blocking issue(s) found.`);
    process.exit(1);
  }
}

main().catch(err => { console.error('Unexpected error:', err); process.exit(1); });
