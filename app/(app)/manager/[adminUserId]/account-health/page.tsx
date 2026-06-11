import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ManagerViewTabs from '@/components/manager/ManagerViewTabs'
import AccountHealthView from '@/components/account-health/AccountHealthView'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function ManagerAccountHealthPage({
  params,
}: {
  params: Promise<{ adminUserId: string }>
}) {
  const { adminUserId } = await params
  if (!UUID_RE.test(adminUserId)) redirect('/manager')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id
  if (!userId) redirect('/login')

  // Verify accepted manager relationship
  const { data: rel } = await supabase
    .from('manager_relationships')
    .select('id')
    .eq('admin_user_id', adminUserId)
    .eq('manager_user_id', userId)
    .eq('status', 'accepted')
    .maybeSingle()
  if (!rel) redirect('/manager')

  // Check that the managed user has account health enabled
  const { data: adminUserData } = await supabase
    .from('users')
    .select('account_health_enabled, buyer_matrix_enabled')
    .eq('id', adminUserId)
    .single()
  if (!adminUserData?.account_health_enabled) redirect(`/manager/${adminUserId}`)
  const buyerMatrixEnabled = (adminUserData as any)?.buyer_matrix_enabled ?? false

  return (
    <div className="flex flex-col">
      <ManagerViewTabs adminUserId={adminUserId} accountHealthEnabled={true} buyerMatrixEnabled={buyerMatrixEnabled} />
      <AccountHealthView
        viewAsUserId={adminUserId}
        readOnly={true}
        managerUserId={userId}
      />
    </div>
  )
}
