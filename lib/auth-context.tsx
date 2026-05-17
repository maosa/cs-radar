'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

interface AuthContextType {
  userId: string | null
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType>({ userId: null, isLoading: false })

export function AuthProvider({
  children,
  initialUserId,
}: {
  children: React.ReactNode
  initialUserId: string
}) {
  const [userId, setUserId] = useState<string | null>(initialUserId)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUserId(session?.user?.id ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ userId, isLoading: false }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
