'use client'

import { useState } from 'react'
import { triggerDownload } from './settings-utils'

export default function ExportSection({
  onToast,
  accountHealthEnabled,
}: {
  onToast: (msg: string, type?: 'success' | 'error') => void
  accountHealthEnabled: boolean
}) {
  const [exporting, setExporting] = useState(false)
  const [exportingPT, setExportingPT] = useState(false)
  const [exportingAH, setExportingAH] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await fetch('/api/export/tasks')
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const date = new Date().toISOString().slice(0, 10)
      triggerDownload(URL.createObjectURL(blob), `tasks_${date}.csv`)
      onToast('Export downloaded.')
    } catch {
      onToast('Export failed. Please try again.', 'error')
    } finally {
      setExporting(false)
    }
  }

  const handleExportProjectTracker = async () => {
    setExportingPT(true)
    try {
      const res = await fetch('/api/export/project-tracker')
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const date = new Date().toISOString().slice(0, 10)
      triggerDownload(URL.createObjectURL(blob), `project_tracker_${date}.csv`)
      onToast('Export downloaded.')
    } catch {
      onToast('Export failed. Please try again.', 'error')
    } finally {
      setExportingPT(false)
    }
  }

  const handleExportAccountHealth = async () => {
    setExportingAH(true)
    try {
      const res = await fetch('/api/export/account-health')
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const date = new Date().toISOString().slice(0, 10)
      triggerDownload(URL.createObjectURL(blob), `account_health_${date}.csv`)
      onToast('Export downloaded.')
    } catch {
      onToast('Export failed. Please try again.', 'error')
    } finally {
      setExportingAH(false)
    }
  }

  return (
    <div>
      <p className="text-[13px] text-text-secondary mb-4">
        Download all your tasks, notes, and comments as a CSV file.
      </p>
      <button
        onClick={handleExport}
        disabled={exporting}
        className="w-60 px-4 py-2 text-right text-[13px] font-medium bg-navy text-white rounded-[6px] border border-transparent hover:bg-navy-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {exporting ? 'Exporting…' : 'Export Task List to CSV'}
      </button>
      <hr className="border-border my-4" />
      <p className="text-[13px] text-text-secondary mb-4">
        Download all your project tracking notes and updates as a CSV file.
      </p>
      <button
        onClick={handleExportProjectTracker}
        disabled={exportingPT}
        className="w-60 px-4 py-2 text-right text-[13px] font-medium bg-navy text-white rounded-[6px] border border-transparent hover:bg-navy-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {exportingPT ? 'Exporting…' : 'Export Project Tracker to CSV'}
      </button>
      {accountHealthEnabled && (
        <>
          <hr className="border-border my-4" />
          <p className="text-[13px] text-text-secondary mb-4">
            Download all your Account Health data as a CSV file.
          </p>
          <button
            onClick={handleExportAccountHealth}
            disabled={exportingAH}
            className="w-60 px-4 py-2 text-right text-[13px] font-medium bg-navy text-white rounded-[6px] border border-transparent hover:bg-navy-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {exportingAH ? 'Exporting…' : 'Export Account Health to CSV'}
          </button>
        </>
      )}
    </div>
  )
}
