'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'

export default function SignupPage() {
  const router = useRouter()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [role, setRole] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [duplicateEmail, setDuplicateEmail] = useState(false)
  const [loading, setLoading] = useState(false)
  const [confirmMessage, setConfirmMessage] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setDuplicateEmail(false)
    setLoading(true)

    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/login`,
        data: { first_name: firstName, last_name: lastName, role: role || null },
      },
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    // identities is empty when the email is already registered (unconfirmed).
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      setDuplicateEmail(true)
      setLoading(false)
      return
    }

    // Newer Supabase behaviour: signing up with an already-confirmed email returns
    // { user: null, session: null } as a silent fake-success to prevent enumeration.
    if (!data.user && !data.session) {
      setDuplicateEmail(true)
      setLoading(false)
      return
    }

    if (data.user) {
      if (!data.session) {
        setConfirmMessage('confirm')
        setLoading(false)
        return
      }

      router.push('/tasks')
    }
  }

  return (
    <div className="w-full max-w-sm bg-white rounded-xl border border-border p-8 shadow-sm">
      {confirmMessage ? (
        <div className="space-y-4 text-center">
          <div className="mb-6">
            <h1 className="text-[18px] font-medium text-navy">Confirm your email address</h1>
            <p className="text-[13px] text-text-secondary mt-1">Task Tracker</p>
          </div>
          <p className="text-[13px] text-text-secondary">A confirmation email has been sent to <span className="font-medium text-navy">{email}</span></p>
          <p className="text-[13px] text-text-secondary">Check your email to activate your account.</p>
          <Link href="/login" className="block text-[13px] text-navy-mid hover:underline">
            Back to sign in
          </Link>
        </div>
      ) : (
        <>
        <div className="mb-6">
          <h1 className="text-[18px] font-medium text-navy">Create account</h1>
          <p className="text-[13px] text-text-secondary mt-1">Task Tracker</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-text-secondary mb-1">First name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                autoFocus
                className="w-full h-9 px-3 text-[13px] border border-border rounded-md focus:outline-none focus:border-navy-mid text-navy"
                placeholder="First name"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-text-secondary mb-1">Last name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                className="w-full h-9 px-3 text-[13px] border border-border rounded-md focus:outline-none focus:border-navy-mid text-navy"
                placeholder="Last name"
              />
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-text-secondary mb-1">Current role</label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full h-9 px-3 text-[13px] border border-border rounded-md focus:outline-none focus:border-navy-mid text-navy"
              placeholder="e.g. Product Manager"
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium text-text-secondary mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full h-9 px-3 text-[13px] border border-border rounded-md focus:outline-none focus:border-navy-mid text-navy"
              placeholder="you@accessinfinity.com"
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium text-text-secondary mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full h-9 px-3 text-[13px] border border-border rounded-md focus:outline-none focus:border-navy-mid text-navy"
              placeholder="At least 6 characters"
            />
          </div>

          {duplicateEmail && (
            <div className="rounded-md bg-red-hover border border-[#FFC4CB] px-3 py-2.5 text-[12px] text-red-dark space-y-1">
              <p className="font-medium">An account with this email already exists.</p>
              <p>
                <Link href="/login" className="underline hover:text-[#a3000f]">Sign in</Link>
                {' '}to your account, or use{' '}
                <Link href="/forgot-password" className="underline hover:text-[#a3000f]">Forgot password</Link>
                {' '}to reset your password.
              </p>
            </div>
          )}
          {error && <p className="text-[12px] text-red-dark">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-9 bg-navy text-white text-[13px] font-medium rounded-md hover:bg-[#2D2870] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="mt-4 text-[12px] text-text-secondary text-center">
          Already have an account?{' '}
          <Link href="/login" className="text-navy-mid hover:underline">
            Sign in
          </Link>
        </p>
        </>
      )}
    </div>
  )
}
