'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    if (data.user) {
      const { data: profile } = await supabase
        .from('users')
        .select('default_landing')
        .eq('id', data.user.id)
        .single()

      // Defensive backfill: the handle_new_user trigger should have created
      // this row at signup, but if it didn't (e.g. trigger wasn't in place yet)
      // we create it now so the rest of the app can find the user.
      if (!profile) {
        await supabase.from('users').upsert({
          id: data.user.id,
          email: data.user.email!,
          first_name: data.user.user_metadata?.first_name ?? null,
          last_name: data.user.user_metadata?.last_name ?? null,
          role: data.user.user_metadata?.role ?? null,
          created_at: new Date().toISOString(),
        }, { onConflict: 'id' })
      }

      router.push(profile?.default_landing === 'manager_view' ? '/manager' : '/tasks')
    } else {
      router.push('/tasks')
    }
  }

  return (
    <div className="w-full max-w-sm bg-white rounded-xl border border-border p-8 shadow-sm">
      <div className="mb-6">
        <h1 className="text-[18px] font-medium text-navy">Sign in</h1>
        <p className="text-[13px] text-text-secondary mt-1">Task Tracker</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[12px] font-medium text-text-secondary mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            className="w-full h-9 px-3 text-[13px] border border-border rounded-md focus:outline-none focus:border-navy-mid text-navy"
            placeholder="you@accessinfinity.com"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[12px] font-medium text-text-secondary">Password</label>
            <Link href="/forgot-password" className="text-[12px] text-navy-mid hover:underline">
              Forgot password?
            </Link>
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full h-9 px-3 text-[13px] border border-border rounded-md focus:outline-none focus:border-navy-mid text-navy"
            placeholder="••••••••"
          />
        </div>

        {error && <p className="text-[12px] text-red-dark">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full h-9 bg-navy text-white text-[13px] font-medium rounded-md hover:bg-[#2D2870] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="mt-4 text-[12px] text-text-secondary text-center">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="text-navy-mid hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  )
}
