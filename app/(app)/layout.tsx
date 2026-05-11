import { AuthProvider } from '@/lib/auth-context'
import { SidebarProvider } from '@/lib/sidebar-context'
import Sidebar from '@/components/layout/Sidebar'
import TopBar from '@/components/layout/TopBar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <SidebarProvider>
        <div className="flex h-full">
          <Sidebar />
          <div className="flex flex-col flex-1 min-w-0">
            <TopBar />
            <main className="flex-1 overflow-auto">
              {children}
            </main>
          </div>
        </div>
      </SidebarProvider>
    </AuthProvider>
  )
}
