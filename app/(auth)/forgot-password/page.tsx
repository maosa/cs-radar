'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { APP_NAME } from '@/lib/app-config'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    setLoading(false)

    if (resetError) {
      setError(resetError.message)
      return
    }

    setSubmitted(true)
  }

  return (
    <div className="w-full max-w-sm bg-white rounded-xl border border-border p-8 shadow-sm">
      <div className="mb-6">
        <h1 className="text-[18px] font-medium text-navy">Reset Password</h1>
        <p className="text-[13px] text-text-secondary mt-1">{APP_NAME}</p>
      </div>

      {submitted ? (
        <div className="space-y-4">
          <div className="rounded-md bg-[#F0FDF9] border border-teal px-4 py-3">
            <p className="text-[13px] text-navy">
              If an account exists for <span className="font-medium">{email}</span>, you will receive a password reset link shortly.
            </p>
          </div>
          <p className="text-[12px] text-text-secondary">
            Didn&apos;t receive it? Check your spam folder or{' '}
            <button
              onClick={() => setSubmitted(false)}
              className="text-navy-mid hover:underline"
            >
              try again
            </button>
            .
          </p>
          <Link
            href="/login"
            className="block text-center text-[13px] text-navy-mid hover:underline"
          >
            Back to sign in
          </Link>
        </div>
      ) : (
        <>
          <p className="text-[13px] text-text-secondary mb-5">
            Enter your email address and we&apos;ll send you a link to reset your password.
          </p>

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

            {error && <p className="text-[12px] text-red-dark">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-9 bg-navy text-white text-[13px] font-medium rounded-md hover:bg-[#2D2870] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>

          <p className="mt-4 text-[12px] text-text-secondary text-center">
            <Link href="/login" className="text-navy-mid hover:underline">
              Back to sign in
            </Link>
          </p>
        </>
      )}
    </div>
  )
}
