// Week 0 = Jul 21, 2025. All weeks are Monday–Sunday.
const FIRST_WEEK_MS = Date.UTC(2025, 6, 21) // 2025-07-21 UTC midnight
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000

export function getCurrentWeekIndex(): number {
  const now = new Date()
  const todayMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.max(0, Math.floor((todayMs - FIRST_WEEK_MS) / MS_PER_WEEK))
}

export function weekIndexToDateString(weekIndex: number): string {
  const ms = FIRST_WEEK_MS + weekIndex * MS_PER_WEEK
  const d = new Date(ms)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function dateStringToWeekIndex(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  const ms = Date.UTC(y, m - 1, d)
  return Math.floor((ms - FIRST_WEEK_MS) / MS_PER_WEEK)
}

export function formatWeekHeader(weekIndex: number): string {
  const ms = FIRST_WEEK_MS + weekIndex * MS_PER_WEEK
  const d = new Date(ms)
  return `Week of ${d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })}`
}
