-- account_health_responses table
CREATE TABLE IF NOT EXISTS public.account_health_responses (
  id                         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_account_id          uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  admin_user_id              uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  month                      date NOT NULL,
  question_id                text NOT NULL CHECK (question_id IN (
                               'engagement_usage_declining',
                               'engagement_milestone_weakening',
                               'engagement_qbr_missed',
                               'engagement_feedback_passive',
                               'stakeholder_key_left',
                               'stakeholder_ownership_unclear',
                               'stakeholder_csm_changed',
                               'stakeholder_ai_sponsor_missing',
                               'stakeholder_relationship_unstable',
                               'strategic_nonessential',
                               'operational_rollout_delayed',
                               'operational_feedback_passive',
                               'commercial_renewal_delayed',
                               'matrix_engagement',
                               'matrix_stakeholder',
                               'matrix_strategic_fit',
                               'matrix_operational',
                               'matrix_commercial',
                               'risk_flagged_high',
                               'risk_admin_left',
                               'risk_usage_dropped',
                               'risk_renewal_low_engagement',
                               'risk_confirmed_misalignment'
                             )),
  response                   text CHECK (response IN ('yes', 'no', 'low', 'medium', 'high')),
  cs_lead_comment            text,
  cs_lead_updated_at         timestamptz,
  cs_lead_updated_by         uuid REFERENCES public.users(id) ON DELETE SET NULL,
  client_partner_comment     text,
  client_partner_updated_at  timestamptz,
  client_partner_updated_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz,
  updated_by                 uuid REFERENCES public.users(id) ON DELETE SET NULL,
  UNIQUE (client_account_id, month, question_id)
);

CREATE INDEX IF NOT EXISTS ahr_client_account_month_idx
  ON public.account_health_responses(client_account_id, month);
CREATE INDEX IF NOT EXISTS ahr_admin_user_id_idx
  ON public.account_health_responses(admin_user_id);

-- RLS
ALTER TABLE public.account_health_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ah_responses: owner full"
  ON public.account_health_responses FOR ALL
  USING (auth.uid() = admin_user_id);

CREATE POLICY "ah_responses: manager read"
  ON public.account_health_responses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.manager_relationships mr
      WHERE mr.admin_user_id = account_health_responses.admin_user_id
        AND mr.manager_user_id = auth.uid()
        AND mr.status = 'accepted'
    )
  );
