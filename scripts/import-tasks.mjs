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

  let projectsCreated = 0;
  let projectSortOrder = (existingProjects?.length ?? 0) + 1;

  for (const name of uniqueProjectNames) {
    if (projectMap[name]) continue;

    const { data: newProj, error: projErr } = await supabase
      .from('projects')
      .insert({ admin_user_id: userId, name, sort_order: projectSortOrder++ })
      .select('id')
      .single();

    if (projErr) {
      console.error(`Failed to create project "${name}":`, projErr.message);
      process.exit(1);
    }

    projectMap[name] = newProj.id;
    projectsCreated++;
    console.log(`  Created project: ${name}`);
  }

  console.log(`Projects: ${projectsCreated} created, ${(existingProjects?.length ?? 0)} pre-existing`);

  // 4. Insert tasks, notes, and comments
  let tasksInserted = 0;
  let notesInserted = 0;
  let commentsInserted = 0;
  const errors = [];

  // Track sort_order per week
  const weekSortCounters = {};

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const rowNum = i + 2; // 1-based + header row

    try {
      const weekStartDate = parseDate(r['Week']);
      const projectName = r['Project'];
      const projectId = projectName ? projectMap[projectName] : null;

      weekSortCounters[weekStartDate] = (weekSortCounters[weekStartDate] ?? 0) + 1;
      const sortOrder = weekSortCounters[weekStartDate];

      const { data: task, error: taskErr } = await supabase
        .from('tasks')
        .insert({
          admin_user_id: userId,
          product: r['Product'] || 'N/A',
          project_id: projectId,
          description: r['Task Description'],
          week_start_date: weekStartDate,
          status: mapStatus(r['Status']),
          is_flagged: mapFlagged(r['Flagged']),
          sort_order: sortOrder,
          created_by: userId,
        })
        .select('id')
        .single();

      if (taskErr) throw new Error(`Task insert: ${taskErr.message}`);
      tasksInserted++;

      const taskId = task.id;

      const noteContent = r['Notes'];
      if (noteContent) {
        const { error: noteErr } = await supabase
          .from('task_notes')
          .insert({ task_id: taskId, content: noteContent, created_by: userId });
        if (noteErr) throw new Error(`Note insert: ${noteErr.message}`);
        notesInserted++;
      }

      const commentContent = r['Comments'];
      if (commentContent) {
        const { error: commentErr } = await supabase
          .from('task_comments')
          .insert({ task_id: taskId, content: commentContent, created_by: userId });
        if (commentErr) throw new Error(`Comment insert: ${commentErr.message}`);
        commentsInserted++;
      }

    } catch (err) {
      errors.push({ rowNum, description: r['Task Description']?.slice(0, 60), error: err.message });
    }
  }

  // 5. Summary
  console.log('\n=== Import Complete ===');
  console.log(`Tasks inserted:    ${tasksInserted}`);
  console.log(`Projects created:  ${projectsCreated}`);
  console.log(`Notes inserted:    ${notesInserted}`);
  console.log(`Comments inserted: ${commentsInserted}`);

  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors) {
      console.log(`  Row ${e.rowNum} "${e.description}": ${e.error}`);
    }
    process.exit(1);
  } else {
    console.log('\nAll rows imported successfully.');
  }
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
