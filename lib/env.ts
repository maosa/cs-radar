// Static dot-notation access is required for Next.js/webpack to inline
// NEXT_PUBLIC_* values at build time. Dynamic bracket access (process.env[key])
// is NOT replaced and resolves to undefined in the browser bundle.
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error(
    'Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL\n' +
    'Copy .env.example to .env.local and fill in the values.'
  )
}
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing required environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY\n' +
    'Copy .env.example to .env.local and fill in the values.'
  )
}

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
}
