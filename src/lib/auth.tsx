import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, configured } from './supabase'
import type { Profile } from './types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  isGestor: boolean
  /** gestor ou financeiro: vê e lança dados financeiros */
  podeFinanceiro: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string, nome: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(configured)

  useEffect(() => {
    if (!configured) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s)
      if (!s) {
        setProfile(null)
        setLoading(false)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  useEffect(() => {
    if (!userId) return
    let alive = true
    const load = async (retry: boolean) => {
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
      if (!alive) return
      if (!data && retry) {
        // o trigger que cria o perfil pode levar alguns instantes após o cadastro
        setTimeout(() => load(false), 800)
        return
      }
      setProfile(data as Profile | null)
      setLoading(false)
    }
    load(true)
    return () => {
      alive = false
    }
  }, [userId])

  const value: AuthState = {
    session,
    profile,
    loading,
    isGestor: profile?.role === 'gestor',
    podeFinanceiro: profile?.role === 'gestor' || profile?.role === 'financeiro',
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return error ? error.message : null
    },
    signUp: async (email, password, nome) => {
      const { error } = await supabase.auth.signUp({ email, password, options: { data: { nome } } })
      return error ? error.message : null
    },
    signOut: async () => {
      await supabase.auth.signOut()
    },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth fora do AuthProvider')
  return v
}
