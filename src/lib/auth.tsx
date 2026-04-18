import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'

import { supabase } from './supabase'

type Membership = {
  id: string
  school_id: string
  class_id: string | null
  role: string
  status: string
}

type Profile = {
  id: string
  display_name: string | null
  phone: string | null
}

type AuthContextValue = {
  session: Session | null
  profile: Profile | null
  memberships: Membership[]
  loading: boolean
  isAdmin: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshContext: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function loadContext(session: Session | null) {
  if (!session?.user) {
    return {
      profile: null,
      memberships: [] as Membership[],
    }
  }

  const [profileResponse, membershipsResponse] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, display_name, phone')
      .eq('id', session.user.id)
      .maybeSingle(),
    supabase
      .from('memberships')
      .select('id, school_id, class_id, role, status')
      .eq('user_id', session.user.id)
      .eq('status', 'active'),
  ])

  if (profileResponse.error) {
    throw profileResponse.error
  }
  if (membershipsResponse.error) {
    throw membershipsResponse.error
  }

  return {
    profile: (profileResponse.data as Profile | null) ?? null,
    memberships: (membershipsResponse.data ?? []) as Membership[],
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [loading, setLoading] = useState(true)

  const refreshContext = async () => {
    setLoading(true)
    const {
      data: { session: currentSession },
    } = await supabase.auth.getSession()
    const next = await loadContext(currentSession)
    setSession(currentSession)
    setProfile(next.profile)
    setMemberships(next.memberships)
    setLoading(false)
  }

  useEffect(() => {
    let alive = true

    const bootstrap = async () => {
      try {
        const {
          data: { session: initialSession },
        } = await supabase.auth.getSession()
        const next = await loadContext(initialSession)
        if (!alive) return
        setSession(initialSession)
        setProfile(next.profile)
        setMemberships(next.memberships)
      } finally {
        if (alive) {
          setLoading(false)
        }
      }
    }

    bootstrap()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      const next = await loadContext(nextSession)
      if (!alive) return
      setSession(nextSession)
      setProfile(next.profile)
      setMemberships(next.memberships)
      setLoading(false)
    })

    return () => {
      alive = false
      subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(() => {
    const roles = memberships.map((item) => item.role)

    return {
      session,
      profile,
      memberships,
      loading,
      isAdmin: roles.includes('school_admin'),
      signIn: async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) {
          throw error
        }
      },
      signOut: async () => {
        const { error } = await supabase.auth.signOut()
        if (error) {
          throw error
        }
      },
      refreshContext,
    }
  }, [loading, memberships, profile, session])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return context
}
