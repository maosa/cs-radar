'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { Product, ProjectRow, TaskWithProject } from '@/lib/supabase/types'
import { supabase } from '@/lib/supabase/client'
import { formatWeekHeader, weekIndexToDateString } from '@/lib/weeks'
import { useAuth } from '@/lib/auth-context'

const PRODUCTS: { value: Product; label: string }[] = [
  { value: 'AH', label: 'Access Hub (AH)' },
  { value: 'NURO', label: 'NURO' },
  { value: 'EH', label: 'Evidence Hub (EH)' },
  { value: 'N/A', label: 'N/A (Not Applicable)' },
]

interface Props {
  weekIndex: number
  projects: ProjectRow[]
  onClose: () => void
  onCreated: (task: TaskWithProject) => void
}

export default function AddTaskModal({ weekIndex, projects, onClose, onCreated }: Props) {
  const { userId } = useAuth()
  const [product, setProduct] = useState<Product | ''>('')
  const [projectId, setProjectId] = useState('')
  const [description, setDescription] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeSuggestion, setActiveSuggestion] = useState(-1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const descRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const weekDateStr = weekIndexToDateString(weekIndex)

  const fetchSuggestions = useCallback(async (query: string, prod: Product | '') => {
    if (!userId || query.length < 2) {
      setSuggestions([])
      return
    }
    let q = supabase
      .from('tasks')
      .select('description')
      .eq('admin_user_id', userId)
      .ilike('description', `%${query}%`)
      .order('created_at', { ascending: false })
      .limit(5)
    if (prod) q = q.eq('product', prod)
    const { data } = await q
    if (data) {
      const unique = [...new Set(data.map((r) => r.description))].slice(0, 5)
      setSuggestions(unique)
    }
  }, [userId])

  const handleDescriptionChange = (val: string) => {
    setDescription(val)
    setActiveSuggestion(-1)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (val.length < 2) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(val, product)
      setShowSuggestions(true)
    }, 300)
  }

  const pickSuggestion = (s: string) => {
    setDescription(s)
    setSuggestions([])
    setShowSuggestions(false)
    descRef.current?.focus()
  }

  const handleDescKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveSuggestion((i) => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveSuggestion((i) => Math.max(i - 1, -1))
    } else if (e.key === 'Enter' && activeSuggestion >= 0) {
      e.preventDefault()
      pickSuggestion(suggestions[activeSuggestion])
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!product) { setError('Please select a product.'); return }
    if (!projectId) { setError('Please select a project.'); return }
    if (!description.trim()) { setError('Please enter a description.'); return }
    if (!userId) { setError('Not signed in.'); return }

    setSaving(true)
    const { data, error: dbErr } = await supabase
      .from('tasks')
      .insert({
        admin_user_id: userId,
        product: product as Product,
        project_id: projectId || null,
        description: description.trim(),
        week_start_date: weekDateStr,
        status: 'open',
        is_flagged: false,
        sort_order: 9999,
        created_by: userId,
      })
      .select('*, projects(name)')
      .single()

    setSaving(false)
    if (dbErr || !data) {
      setError(dbErr?.message ?? 'Failed to create task.')
      return
    }
    const proj = data.projects as { name: string } | null
    const task: TaskWithProject = { ...data, project_name: proj?.name ?? null, projects: undefined } as unknown as TaskWithProject
    onCreated(task)
  }

  // Close on backdrop click
  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={handleBackdrop}
    >
      <div className="bg-white rounded-[12px] shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-[15px] font-medium text-[#19153F] mb-1">Add task</h2>
        <p className="text-[12px] text-[#797979] mb-5">{formatWeekHeader(weekIndex)}</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Product */}
          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-medium text-[#595959]">Product</label>
            <select
              value={product}
              onChange={(e) => { setProduct(e.target.value as Product | ''); setProjectId('') }}
              className="px-3 py-2 text-[13px] border border-[#DADADA] rounded-[6px] bg-white text-[#19153F] focus:outline-none focus:border-[#38308F]"
            >
              <option value="">Select product…</option>
              {PRODUCTS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* Project */}
          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-medium text-[#595959]">Project</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              disabled={!product}
              className={`px-3 py-2 text-[13px] border border-[#DADADA] rounded-[6px] text-[#19153F] focus:outline-none focus:border-[#38308F] ${!product ? 'bg-[#F2F2F2] cursor-not-allowed' : 'bg-white'}`}
            >
              <option value="">{product ? 'Select project…' : 'Select a product first'}</option>
              {projects
                .filter((p) => p.product === product || p.product === null)
                .map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
            </select>
          </div>

          {/* Description with autocomplete */}
          <div className="flex flex-col gap-1 relative">
            <label className="text-[12px] font-medium text-[#595959]">Description</label>
            <input
              ref={descRef}
              type="text"
              value={description}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              onKeyDown={handleDescKeyDown}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              placeholder="What needs to be done?"
              autoFocus
              className="px-3 py-2 text-[13px] border border-[#DADADA] rounded-[6px] bg-white text-[#19153F] focus:outline-none focus:border-[#38308F] placeholder:text-[#797979]"
            />
            {showSuggestions && suggestions.length > 0 && (
              <ul className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#DADADA] rounded-[6px] shadow-md z-10 overflow-hidden">
                {suggestions.map((s, i) => (
                  <li
                    key={i}
                    onMouseDown={() => pickSuggestion(s)}
                    className={`px-3 py-2 text-[13px] cursor-pointer ${
                      i === activeSuggestion ? 'bg-[#F2F2F2] text-[#19153F]' : 'text-[#595959] hover:bg-[#F2F2F2]'
                    }`}
                  >
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && <p className="text-[12px] text-[#FF0522]">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-[13px] font-medium border border-[#DADADA] rounded-[6px] text-[#595959] hover:border-[#aaa] hover:text-[#19153F] transition-colors bg-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-[13px] font-medium bg-[#19153F] text-white rounded-[6px] border border-transparent hover:bg-[#2a2460] disabled:opacity-60 transition-colors"
            >
              {saving ? 'Saving…' : 'Save task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
