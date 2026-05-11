'use client'

import { createContext, useContext, useState, useCallback } from 'react'

interface SidebarCtx {
  counter: number
  refresh: () => void
}

const SidebarContext = createContext<SidebarCtx | null>(null)

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [counter, setCounter] = useState(0)
  const refresh = useCallback(() => setCounter((c) => c + 1), [])
  return (
    <SidebarContext.Provider value={{ counter, refresh }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebarRefresh() {
  const ctx = useContext(SidebarContext)
  if (!ctx) throw new Error('useSidebarRefresh must be used within SidebarProvider')
  return ctx.refresh
}

export function useSidebarCounter() {
  const ctx = useContext(SidebarContext)
  if (!ctx) throw new Error('useSidebarCounter must be used within SidebarProvider')
  return ctx.counter
}
