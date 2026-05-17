export function csvEscape(value: string): string {
  const s = String(value ?? '')
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

export function formatExportDate(ts: string): string {
  const d = new Date(ts)
  return (
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) +
    ' at ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  )
}

export function triggerDownload(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export const ACCOUNT_HEALTH_QUESTIONS: { category: string; questionId: string; question: string }[] = [
  { category: 'Engagement',       questionId: 'engagement_usage_declining',     question: 'Is platform usage declining or inactive for 4+ weeks?' },
  { category: 'Engagement',       questionId: 'engagement_milestone_weakening', question: 'Are milestone or KPI tracking habits weakening?' },
  { category: 'Engagement',       questionId: 'engagement_qbr_missed',          question: 'Are QBRs consistently missed or poorly attended?' },
  { category: 'Engagement',       questionId: 'engagement_feedback_passive',    question: 'Is client feedback passive or negative? Are NPS scores low?' },
  { category: 'Stakeholder Risk', questionId: 'stakeholder_key_left',              question: 'Have key admins, sponsors, or power users left or changed roles?' },
  { category: 'Stakeholder Risk', questionId: 'stakeholder_ownership_unclear',     question: 'Is there unclear ownership or missing champions?' },
  { category: 'Stakeholder Risk', questionId: 'stakeholder_csm_changed',           question: 'Have CSMs been regularly changed?' },
  { category: 'Stakeholder Risk', questionId: 'stakeholder_ai_sponsor_missing',    question: 'Are they missing an internal AI sponsor?' },
  { category: 'Stakeholder Risk', questionId: 'stakeholder_relationship_unstable', question: 'Is there an unstable relationship with sales, CS, product owner, or sponsor?' },
  { category: 'Strategic Fit',    questionId: 'strategic_nonessential',            question: 'Is the product seen as non-essential or misaligned with client priorities?' },
  { category: 'Operational Risk', questionId: 'operational_rollout_delayed',       question: 'Has roll-out been delayed due to inattentive or unresponsive admins?' },
  { category: 'Operational Risk', questionId: 'operational_feedback_passive',      question: 'Is client feedback passive or negative? Are NPS scores low?' },
  { category: 'Commercial Risk',  questionId: 'commercial_renewal_delayed',        question: 'Are renewal conversations delayed or stalled?' },
  { category: 'Risk Matrix',      questionId: 'matrix_engagement',                 question: 'Engagement risk' },
  { category: 'Risk Matrix',      questionId: 'matrix_stakeholder',                question: 'Stakeholder risk' },
  { category: 'Risk Matrix',      questionId: 'matrix_strategic_fit',              question: 'Strategic fit' },
  { category: 'Risk Matrix',      questionId: 'matrix_operational',                question: 'Operational risk' },
  { category: 'Risk Matrix',      questionId: 'matrix_commercial',                 question: 'Commercial risk' },
  { category: 'Risk Factor',      questionId: 'risk_flagged_high',                 question: 'Is the client flagged as High-Risk in the CS risk review?' },
  { category: 'Risk Factor',      questionId: 'risk_admin_left',                   question: 'Has the primary admin, sponsor, or power user left and not been replaced?' },
  { category: 'Risk Factor',      questionId: 'risk_usage_dropped',                question: 'Has product usage dropped significantly (30% or more decline) over a 4-week period?' },
  { category: 'Risk Factor',      questionId: 'risk_renewal_low_engagement',       question: 'Is renewal within 3 months with low engagement?' },
  { category: 'Risk Factor',      questionId: 'risk_confirmed_misalignment',       question: 'Is there a confirmed commercial, strategic, or stakeholder misalignment?' },
]

export const AH_QUESTION_MAP = Object.fromEntries(
  ACCOUNT_HEALTH_QUESTIONS.map((q) => [q.questionId, q])
)

export const AH_QUESTION_ORDER = Object.fromEntries(
  ACCOUNT_HEALTH_QUESTIONS.map((q, i) => [q.questionId, i])
)
