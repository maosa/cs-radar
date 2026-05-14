'use client'

import { Gauge } from 'lucide-react'

export default function AccountHealthView() {
  return (
    <div className="p-6 flex flex-col gap-5">
      <h1 className="text-base font-medium text-navy">Account health</h1>
      <div className="flex flex-col items-center justify-center py-20 gap-2">
        <Gauge size={28} className="text-border" />
        <p className="text-[13px] text-text-muted">Select a client account above to begin.</p>
      </div>
    </div>
  )
}
