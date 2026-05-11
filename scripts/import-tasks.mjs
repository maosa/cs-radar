import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

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
  // Strip BOM if present
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
      if (ch === '"' && next === '"') {
        field += '"';
        i += 2;
      } else if (ch === '"') {
        inQuotes = false;
        i++;
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        row.push(field);
        field = '';
        i++;
      } else if (ch === '\r' && next === '\n') {
        row.push(field);
        field = '';
        rows.push(row);
        row = [];
        i += 2;
      } else if (ch === '\n') {
        row.push(field);
        field = '';
        rows.push(row);
        row = [];
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }

  // Last field / row
  if (field || row.length) {
    row.push(field);
    if (row.some(f => f !== '')) rows.push(row);
  }

  if (rows.length < 2) throw new Error('CSV appears to be empty or header-only');

  const headers = rows[0];
  return rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, i) => { obj[h.trim()] = (r[i] ?? '').trim(); });
    return obj;
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function parseDate(ddmmyyyy) {
  const [dd, mm, yyyy] = ddmmyyyy.split('/');
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

function mapStatus(raw) {
  return raw.toLowerCase() === 'complete' ? 'complete' : 'open';
}

function mapFlagged(raw) {
  return raw.toLowerCase() === 'yes';
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

  // 1. Look up target user
  const TARGET_EMAIL = 'andreas@accessinfinity.com';
  const { data: users, error: userErr } = await supabase
    .from('users')
    .select('id')
    .eq('email', TARGET_EMAIL)
    .limit(1);

  if (userErr) { console.error('User lookup failed:', userErr.message); process.exit(1); }
  if (!users || users.length === 0) {
    console.error(`User not found: ${TARGET_EMAIL}`);
    process.exit(1);
  }

  const userId = users[0].id;
  console.log(`Target user: ${TARGET_EMAIL} (${userId})`);

  // 2. Parse CSV
  const csvText = readFileSync(resolve(ROOT, 'tasks_archive.csv'), 'utf8');
  const records = parseCsv(csvText);
  console.log(`Parsed ${records.length} CSV rows`);

  // 3. Upsert projects
  const uniqueProjectNames = [...new Set(records.map(r => r['Project']).filter(Boolean))];

  const { data: existingProjects, error: projFetchErr } = await supabase
    .from('projects')
    .select('id, name')
    .eq('admin_user_id', userId)
    .is('deleted_at', null);

  if (projFetchErr) { console.error('Project fetch failed:', projFetchErr.message); process.exit(1); }

  const projectMap = {};
  for (const p of existingProjects ?? []) projectMap[p.name] = p.id;

  const newProjectNames = uniqueProjectNames.filter((name) => !projectMap[name]);
  let projectSortOrder = (existingProjects?.length ?? 0) + 1;

  if (newProjectNames.length > 0) {
    const { data: newProjects, error: projErr } = await supabase
      .from('projects')
      .insert(newProjectNames.map((name) => ({ admin_user_id: userId, name, sort_order: projectSortOrder++ })))
      .select('id, name');

    if (projErr) {
      console.error('Failed to create projects:', projErr.message);
      process.exit(1);
    }

    for (const p of newProjects ?? []) {
      projectMap[p.name] = p.id;
      console.log(`  Created project: ${p.name}`);
    }
  }

  console.log(`Projects: ${newProjectNames.length} created, ${(existingProjects?.length ?? 0)} pre-existing`);

  // 4. Build task payloads with pre-generated IDs so notes/comments can reference them
  const { randomUUID } = await import('crypto');
  const weekSortCounters = {};
  const taskPayloads = [];
  const notePayloads = [];
  const commentPayloads = [];

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const weekStartDate = parseDate(r['Week']);
    const projectName = r['Project'];
    const projectId = projectName ? projectMap[projectName] : null;

    weekSortCounters[weekStartDate] = (weekSortCounters[weekStartDate] ?? 0) + 1;
    const sortOrder = weekSortCounters[weekStartDate];
    const taskId = randomUUID();

    taskPayloads.push({
      id: taskId,
      admin_user_id: userId,
      product: r['Product'] || 'N/A',
      project_id: projectId,
      description: r['Task Description'],
      week_start_date: weekStartDate,
      status: mapStatus(r['Status']),
      is_flagged: mapFlagged(r['Flagged']),
      sort_order: sortOrder,
      created_by: userId,
    });

    if (r['Notes']) {
      notePayloads.push({ task_id: taskId, content: r['Notes'], created_by: userId });
    }
    if (r['Comments']) {
      commentPayloads.push({ task_id: taskId, content: r['Comments'], created_by: userId });
    }
  }

  // 5. Batch insert tasks, then notes and comments in parallel
  const { error: taskErr } = await supabase.from('tasks').insert(taskPayloads);
  if (taskErr) {
    console.error('Failed to insert tasks:', taskErr.message);
    process.exit(1);
  }

  const [noteRes, commentRes] = await Promise.all([
    notePayloads.length > 0
      ? supabase.from('task_notes').insert(notePayloads)
      : Promise.resolve({ error: null }),
    commentPayloads.length > 0
      ? supabase.from('task_comments').insert(commentPayloads)
      : Promise.resolve({ error: null }),
  ]);

  if (noteRes.error) {
    console.error('Failed to insert notes:', noteRes.error.message);
    process.exit(1);
  }
  if (commentRes.error) {
    console.error('Failed to insert comments:', commentRes.error.message);
    process.exit(1);
  }

  // 6. Summary
  console.log('\n=== Import Complete ===');
  console.log(`Tasks inserted:    ${taskPayloads.length}`);
  console.log(`Projects created:  ${newProjectNames.length}`);
  console.log(`Notes inserted:    ${notePayloads.length}`);
  console.log(`Comments inserted: ${commentPayloads.length}`);
  console.log('\nAll rows imported successfully.');
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
