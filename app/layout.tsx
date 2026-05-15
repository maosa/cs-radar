import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Task Tracker — Access Infinity',
  description: 'Weekly task management for Access Infinity teams',
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
