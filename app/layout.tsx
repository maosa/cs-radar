import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CS Radar — Access Infinity',
  description: 'CS Radar for Access Infinity teams',
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
