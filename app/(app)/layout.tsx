import { AuthProvider } from '@/lib/auth-context'
import { SidebarProvider } from '@/lib/sidebar-context'
import Sidebar from '@/components/layout/Sidebar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <SidebarProvider>
        <div className="flex h-full">
          <Sidebar />
          <main className="flex-1 overflow-auto min-w-0">
            {children}
          </main>
        </div>
      </SidebarProvider>
    </AuthProvider>
  )
}
