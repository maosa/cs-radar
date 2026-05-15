import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

function isPublicPath(pathname: string) {
  return (
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password' ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  )
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    if (isPublicPath(pathname) || process.env.NODE_ENV !== 'production') {
      return NextResponse.next()
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  // Refresh session if expired (important — do not remove)
  let user = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch {
    if (isPublicPath(pathname) || process.env.NODE_ENV !== 'production') {
      return supabaseResponse
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Allow auth pages and public assets through unconditionally
  if (isPublicPath(pathname)) {
    return supabaseResponse
  }

  // Redirect unauthenticated users to login
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
