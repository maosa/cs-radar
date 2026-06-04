'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { APP_NAME } from '@/lib/app-config'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [ready, setReady] = useState(false) // true once Supabase has confirmed the recovery token

  useEffect(() => {
    // Supabase fires PASSWORD_RECOVERY after it processes the token in the URL.
    // We wait for that event before showing the form so we know the session is valid.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true)
      }
    })

    // Also handle the case where the user already has a recovery session
    // (e.g. they refreshed the page after the event fired).
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setDone(true)
    setTimeout(() => router.push('/login'), 2500)
  }

  // Token not yet verified — still waiting for the hash to be processed
  if (!ready) {
    return (
      <div className="w-full max-w-sm bg-white rounded-xl border border-border p-8 shadow-sm">
        <div className="mb-6">
          <h1 className="text-[18px] font-medium text-navy">Reset Password</h1>
          <p className="text-[13px] text-text-secondary mt-1">{APP_NAME}</p>
        </div>
        <p className="text-[13px] text-text-muted">Verifying reset link…</p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-sm bg-white rounded-xl border border-border p-8 shadow-sm">
      <div className="mb-6">
        <h1 className="text-[18px] font-medium text-navy">Set New Password</h1>
        <p className="text-[13px] text-text-secondary mt-1">{APP_NAME}</p>
      </div>

      {done ? (
        <div className="space-y-4">
          <div className="rounded-md bg-[#F0FDF9] border border-teal px-4 py-3">
            <p className="text-[13px] text-navy">
              Password updated successfully. Redirecting you to sign in…
            </p>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-text-secondary mb-1">New password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
              minLength={6}
              className="w-full h-9 px-3 text-[13px] border border-border rounded-md focus:outline-none focus:border-navy-mid text-navy"
              placeholder="At least 6 characters"
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium text-text-secondary mb-1">Confirm new password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
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
            {loading ? 'Updating…' : 'Update password'}
          </button>
        </form>
      )}

      {!done && (
        <p className="mt-4 text-[12px] text-text-secondary text-center">
          <Link href="/login" className="text-navy-mid hover:underline">
            Back to sign in
          </Link>
        </p>
      )}
    </div>
  )
}
