import type { Metadata } from 'next'
import './globals.css'
import { APP_NAME } from '@/lib/app-config'

export const metadata: Metadata = {
  title: `${APP_NAME} — Access Infinity`,
  description: `${APP_NAME} for Access Infinity teams`,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full">
        {children}
      </body>
    </html>
  )
}
