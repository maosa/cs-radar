import { redirect } from 'next/navigation'
import { AuthProvider } from '@/lib/auth-context'
import { SidebarProvider } from '@/lib/sidebar-context'
import Sidebar from '@/components/layout/Sidebar'
import QueryProvider from '@/components/QueryProvider'
import { createClient } from '@/lib/supabase/server'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [profileResult, relResult, countResult] = await Promise.all([
    supabase
      .from('users')
      .select('first_name, last_name, email, account_health_enabled, buyer_matrix_enabled')
      .eq('id', user.id)
      .single(),
    supabase
      .from('manager_relationships')
      .select('id')
      .eq('manager_user_id', user.id)
      .eq('status', 'accepted')
      .limit(1),
    supabase
      .from('manager_relationships')
      .select('id', { count: 'exact', head: true })
      .eq('manager_user_id', user.id)
      .eq('status', 'pending'),
  ])

  const sidebarInitialData = {
    profile: profileResult.data ?? null,
    hasManagerRelationships: Array.isArray(relResult.data) && relResult.data.length > 0,
    pendingInviteCount: countResult.count ?? 0,
  }

  return (
    <QueryProvider>
      <AuthProvider initialUserId={user.id}>
        <SidebarProvider>
          <div className="flex h-full">
            <Sidebar initialData={sidebarInitialData} />
            <main className="flex-1 overflow-auto min-w-0">
              {children}
            </main>
          </div>
        </SidebarProvider>
      </AuthProvider>
    </QueryProvider>
  )
}
