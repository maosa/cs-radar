'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'

export default function TopBar() {
  const { userId } = useAuth()
  const router = useRouter()
  const [initials, setInitials] = useState('?')
  const [fullName, setFullName] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!userId) return
    supabase
      .from('users')
      .select('first_name, last_name, email')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (!data) return
        const first = data.first_name ?? ''
        const last = data.last_name ?? ''
        const name = [first, last].filter(Boolean).join(' ')
        setFullName(name || data.email)
        const i = [(first[0] ?? ''), (last[0] ?? '')].filter(Boolean).join('').toUpperCase()
        setInitials(i || (data.email?.[0]?.toUpperCase() ?? '?'))
      })
  }, [userId])

  // Close menu when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <header className="flex items-center justify-end h-12 px-4 bg-white border-b border-border flex-shrink-0">
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="w-8 h-8 rounded-full bg-navy-mid text-white text-xs font-medium flex items-center justify-center select-none hover:bg-[#2D2870] transition-colors"
          title={fullName || undefined}
          aria-label={fullName ? `Signed in as ${fullName}` : 'User menu'}
        >
          {initials}
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-10 w-48 bg-white border border-border rounded-lg shadow-lg py-1 z-50">
            {fullName && (
              <div className="px-3 py-2 border-b border-border">
                <p className="text-[12px] font-medium text-navy truncate">{fullName}</p>
              </div>
            )}
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-text-secondary hover:bg-bg hover:text-navy transition-colors"
            >
              <LogOut size={13} />
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
