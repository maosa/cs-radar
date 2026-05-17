import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  if (typeof body !== 'object' || body === null || typeof (body as Record<string, unknown>).email !== 'string') {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  const email = ((body as Record<string, unknown>).email as string).trim().toLowerCase()

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: 'Invalid email address' }, { status: 400 })
  }

  const adminUserId = user.id

  const { data: existing } = await supabase
    .from('manager_relationships')
    .select('id, status')
    .eq('admin_user_id', adminUserId)
    .eq('manager_email', email)
    .maybeSingle()

  if (existing) {
    if (existing.status === 'archived') {
      return Response.json(
        { error: 'This invitation was previously declined. Re-send it from the Declined section below.' },
        { status: 409 },
      )
    }
    return Response.json(
      { error: 'An invitation or relationship already exists for this email.' },
      { status: 409 },
    )
  }

  // Look up whether the email belongs to an existing user — server-side only, never revealed to client.
  const { data: managerUser } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .single()

  const { error } = await supabase.from('manager_relationships').insert({
    admin_user_id: adminUserId,
    manager_email: email,
    manager_user_id: managerUser?.id ?? null,
    status: 'pending',
    invited_at: new Date().toISOString(),
  })

  if (error) {
    return Response.json(
      {
        error:
          error.code === '23505'
            ? 'An invitation or relationship already exists for this email.'
            : 'Failed to send invitation.',
      },
      { status: error.code === '23505' ? 409 : 500 },
    )
  }

  return Response.json({ success: true }, { status: 201 })
}
