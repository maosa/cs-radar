'use client'

import { useEffect, useState, useRef } from 'react'
import { X, Info } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import type { AccountHealthResponse, ResponseValue } from '@/lib/supabase/types'

type QuestionType = 'yes_no' | 'risk_level'

interface Question {
  id: string
  text: string
  type: QuestionType
}

interface Section {
  id: string
  label: string
  questions: Question[]
  infoBox?: string
}

const RISK_ASSESSMENT_SECTIONS: Section[] = [
  {
    id: 'engagement',
    label: 'Engagement',
    questions: [
      { id: 'engagement_usage_declining',     text: 'Is platform usage declining or inactive for 4+ weeks?',                       type: 'yes_no' },
      { id: 'engagement_milestone_weakening', text: 'Are milestone or KPI tracking habits weakening?',                              type: 'yes_no' },
      { id: 'engagement_qbr_missed',          text: 'Are QBRs consistently missed or poorly attended?',                             type: 'yes_no' },
      { id: 'engagement_feedback_passive',    text: 'Is client feedback passive or negative? Are NPS scores low?',                  type: 'yes_no' },
    ],
  },
  {
    id: 'stakeholder',
    label: 'Stakeholder Risk',
    questions: [
      { id: 'stakeholder_key_left',              text: 'Have key admins, sponsors, or power users left or changed roles?',                     type: 'yes_no' },
      { id: 'stakeholder_ownership_unclear',     text: 'Is there unclear ownership or missing champions?',                                      type: 'yes_no' },
      { id: 'stakeholder_csm_changed',           text: 'Have CSMs been regularly changed?',                                                     type: 'yes_no' },
      { id: 'stakeholder_ai_sponsor_missing',    text: 'Are they missing an internal AI sponsor?',                                              type: 'yes_no' },
      { id: 'stakeholder_relationship_unstable', text: 'Is there an unstable relationship with sales, CS, product owner, or sponsor?',         type: 'yes_no' },
    ],
  },
  {
    id: 'strategic',
    label: 'Strategic Fit',
    questions: [
      { id: 'strategic_nonessential', text: 'Is the product seen as non-essential or misaligned with client priorities?', type: 'yes_no' },
    ],
  },
  {
    id: 'operational',
    label: 'Operational Risk',
    questions: [
      { id: 'operational_rollout_delayed',  text: 'Has roll-out been delayed due to inattentive or unresponsive admins?', type: 'yes_no' },
      { id: 'operational_feedback_passive', text: 'Is client feedback passive or negative? Are NPS scores low?',          type: 'yes_no' },
    ],
  },
  {
    id: 'commercial',
    label: 'Commercial Risk',
    questions: [
      { id: 'commercial_renewal_delayed', text: 'Are renewal conversations delayed or stalled?', type: 'yes_no' },
    ],
  },
  {
    id: 'matrix',
    label: 'Risk Matrix',
    infoBox: 'Low — Minor concern or passive signals; log and track regular health reviews. Medium — Noticeable early signals; requires client re-engagement and active monitoring. High — High likelihood of churn or downgrade; urgent action and internal escalation.',
    questions: [
      { id: 'matrix_engagement',    text: 'Engagement risk',    type: 'risk_level' },
      { id: 'matrix_stakeholder',   text: 'Stakeholder risk',   type: 'risk_level' },
      { id: 'matrix_strategic_fit', text: 'Strategic fit',      type: 'risk_level' },
      { id: 'matrix_operational',   text: 'Operational risk',   type: 'risk_level' },
      { id: 'matrix_commercial',    text: 'Commercial risk',    type: 'risk_level' },
    ],
  },
  {
    id: 'risk_factor',
    label: 'Risk Factor',
    questions: [
      { id: 'risk_flagged_high',           text: 'Is the client flagged as high risk in the CS risk review?',                                        type: 'yes_no' },
      { id: 'risk_admin_left',             text: 'Has the primary admin, sponsor, or power user left and not been replaced?',                        type: 'yes_no' },
      { id: 'risk_usage_dropped',          text: 'Has product usage dropped significantly (30% or more decline) over a 4-week period?',             type: 'yes_no' },
      { id: 'risk_renewal_low_engagement', text: 'Is renewal within 3 months with low engagement?',                                                  type: 'yes_no' },
      { id: 'risk_confirmed_misalignment', text: 'Is there a confirmed commercial, strategic, or stakeholder misalignment?',                         type: 'yes_no' },
    ],
  },
]

const MATRIX_POPOVERS: Record<string, string> = {
  matrix_engagement:    'Low or inconsistent platform usage, poor adoption, missed QBRs',
  matrix_stakeholder:   'Loss or absence of champions, sponsors, or decision-makers (e.g., re-organisations, maternity leave, medical leave, change of role, leaves organisation, etc.)',
  matrix_strategic_fit: 'Product is no longer aligned to client priorities or seen as non-essential (e.g., brand enters a new stage of its life-cycle)',
  matrix_operational:   'Onboarding delays, unresponsive admins, weak implementation of tracking tools',
  matrix_commercial:    'Silence or delays in renewal conversations, budget changes, pricing objections',
}

function getResponseStyle(value: ResponseValue | null): React.CSSProperties {
  switch (value) {
    case 'yes':    return { backgroundColor: '#FFCDD3', color: '#C0001A' }
    case 'no':     return { backgroundColor: '#C3FFF8', color: '#007A6E' }
    case 'low':    return { backgroundColor: '#C3FFF8', color: '#007A6E' }
    case 'medium': return { backgroundColor: '#FFF7CB', color: '#7F6900' }
    case 'high':   return { backgroundColor: '#FFCDD3', color: '#C0001A' }
    default:       return { backgroundColor: '#FFFFFF', color: '#595959' }
  }
}

interface RiskAssessmentTableProps {
  clientAccountId: string
  adminUserId: string
  month: Date
  readOnly?: boolean
}

export default function RiskAssessmentTable({
  clientAccountId,
  adminUserId,
  month,
  readOnly = false,
}: RiskAssessmentTableProps) {
  const monthStr = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-01`

  const [responsesMap, setResponsesMap] = useState<Map<string, AccountHealthResponse>>(new Map())
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    supabase
      .from('account_health_responses')
      .select('*')
      .eq('client_account_id', clientAccountId)
      .eq('month', monthStr)
      .then(({ data }) => {
        const map = new Map<string, AccountHealthResponse>()
        ;(data as AccountHealthResponse[] ?? []).forEach(r => map.set(r.question_id, r))
        setResponsesMap(map)
      })
  }, [clientAccountId, monthStr])

  useEffect(() => {
    if (!openPopoverId) return
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpenPopoverId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openPopoverId])

  const handleResponseChange = async (questionId: string, newValue: ResponseValue) => {
    const prevRow = responsesMap.get(questionId)

    setResponsesMap(prev => {
      const next = new Map(prev)
      const existing = next.get(questionId)
      if (existing) {
        next.set(questionId, { ...existing, response: newValue })
      } else {
        next.set(questionId, {
          id: '',
          client_account_id: clientAccountId,
          admin_user_id: adminUserId,
          month: monthStr,
          question_id: questionId,
          response: newValue,
          cs_lead_comment: null,
          cs_lead_updated_at: null,
          cs_lead_updated_by: null,
          client_partner_comment: null,
          client_partner_updated_at: null,
          client_partner_updated_by: null,
          created_at: new Date().toISOString(),
          updated_at: null,
          updated_by: null,
        })
      }
      return next
    })

    const { data, error } = await supabase
      .from('account_health_responses')
      .upsert({
        client_account_id: clientAccountId,
        admin_user_id: adminUserId,
        month: monthStr,
        question_id: questionId,
        response: newValue,
        updated_at: new Date().toISOString(),
        updated_by: adminUserId,
      }, { onConflict: 'client_account_id,month,question_id' })
      .select()
      .single()

    if (error) {
      setResponsesMap(prev => {
        const next = new Map(prev)
        if (prevRow) {
          next.set(questionId, prevRow)
        } else {
          next.delete(questionId)
        }
        return next
      })
    } else if (data) {
      setResponsesMap(prev => {
        const next = new Map(prev)
        next.set(questionId, data as AccountHealthResponse)
        return next
      })
    }
  }

  const handleClear = async (questionId: string) => {
    const existing = responsesMap.get(questionId)

    setResponsesMap(prev => {
      const next = new Map(prev)
      const row = next.get(questionId)
      if (row) next.set(questionId, { ...row, response: null })
      return next
    })

    if (!existing?.id) return

    const { error } = await supabase
      .from('account_health_responses')
      .upsert({
        client_account_id: clientAccountId,
        admin_user_id: adminUserId,
        month: monthStr,
        question_id: questionId,
        response: null,
        updated_at: new Date().toISOString(),
        updated_by: adminUserId,
      }, { onConflict: 'client_account_id,month,question_id' })

    if (error) {
      setResponsesMap(prev => {
        const next = new Map(prev)
        next.set(questionId, existing)
        return next
      })
    }
  }

  return (
    <div className="bg-white rounded-[8px] border border-border overflow-x-auto">
      {/* Table header */}
      <div className="flex min-w-max border-b border-border bg-[#F2F2F2]">
        <div className="w-[280px] shrink-0 px-4 py-2.5 text-[12px] font-medium text-navy">Risk category</div>
        <div className="w-[160px] shrink-0 px-4 py-2.5 text-[12px] font-medium text-navy">Response</div>
        <div className="w-[200px] shrink-0 px-4 py-2.5 text-[12px] font-medium text-navy">CS lead comments</div>
        <div className="w-[200px] shrink-0 px-4 py-2.5 text-[12px] font-medium text-navy">Client partner comments</div>
      </div>

      <div className="min-w-max">
        {RISK_ASSESSMENT_SECTIONS.map(section => (
          <div key={section.id}>
            {/* Section header row */}
            <div className="flex border-t border-border bg-[#F2F2F2]">
              <div className="w-full px-4 py-2.5 text-[13px] font-medium text-navy">{section.label}</div>
            </div>

            {/* Info box for Risk Matrix */}
            {section.infoBox && (
              <div className="mx-4 my-2 px-3 py-2 bg-[#F2F2F2] rounded-[6px] text-[12px] text-text-secondary">
                {section.infoBox}
              </div>
            )}

            {/* Question rows */}
            {section.questions.map(question => {
              const rowData = responsesMap.get(question.id)
              const currentResponse = rowData?.response ?? null
              const isMatrixQuestion = section.id === 'matrix'
              const popoverText = MATRIX_POPOVERS[question.id]

              return (
                <div key={question.id} className="flex border-t border-border hover:bg-[#FAFAFA] transition-colors">
                  {/* Column 1: Question text */}
                  <div className="w-[280px] shrink-0 px-4 py-3 flex items-start gap-1.5">
                    <span className="text-[13px] text-text-secondary flex-1">{question.text}</span>
                    {isMatrixQuestion && popoverText && (
                      <div className="relative flex-shrink-0 mt-0.5">
                        <button
                          onClick={() => setOpenPopoverId(openPopoverId === question.id ? null : question.id)}
                          className="text-text-muted hover:text-navy transition-colors"
                          aria-label="More information"
                        >
                          <Info size={13} />
                        </button>
                        {openPopoverId === question.id && (
                          <div
                            ref={popoverRef}
                            className="absolute left-5 top-0 z-10 bg-white rounded-[8px] shadow-lg border border-border p-3 w-60 text-[12px] text-text-secondary"
                          >
                            {popoverText}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Column 2: Response dropdown */}
                  <div className="w-[160px] shrink-0 flex items-center gap-1.5 px-4 py-3">
                    <select
                      value={currentResponse ?? ''}
                      onChange={(e) => {
                        const val = e.target.value
                        if (val === '') {
                          handleClear(question.id)
                        } else {
                          handleResponseChange(question.id, val as ResponseValue)
                        }
                      }}
                      disabled={readOnly}
                      style={getResponseStyle(currentResponse)}
                      className="flex-1 px-2 py-1.5 rounded-[6px] border border-border text-[13px] outline-none focus:border-navy disabled:cursor-not-allowed"
                    >
                      <option value="">Select…</option>
                      {question.type === 'yes_no' ? (
                        <>
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </>
                      ) : (
                        <>
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </>
                      )}
                    </select>
                    {currentResponse && !readOnly && (
                      <button
                        onClick={() => handleClear(question.id)}
                        className="flex-shrink-0 p-1 rounded text-text-muted hover:text-navy hover:bg-bg transition-colors"
                        title="Clear response"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>

                  {/* Column 3: CS lead comments (placeholder for Phase D) */}
                  <div className="w-[200px] shrink-0 px-4 py-3 bg-[#FAFAFA]" />

                  {/* Column 4: Client partner comments (placeholder for Phase D) */}
                  <div className="w-[200px] shrink-0 px-4 py-3 bg-[#FAFAFA]" />
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
