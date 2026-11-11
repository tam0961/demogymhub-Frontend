import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, renewAccessToken, LOGOUT_EVENT } from '../lib/api'
import { setAccessToken } from '../lib/session'
import { clearSessionHint, hasSessionHint, setSessionHint } from '../lib/sessionHint'
import type { Me } from '../types'

export interface AuthValue {
  user: Me | null
  ready: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthValue>({
  user: null,
  ready: true,
  login: async () => {},
  logout: async () => {},
})

const fetchMe = async () => (await api.get('/me')).data.data as Me

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        if (hasSessionHint()) {
          await renewAccessToken()
          const me = await fetchMe()
          if (alive) setUser(me)
        }
      } catch {
        setAccessToken(null)
        clearSessionHint()
      } finally {
        if (alive) setReady(true)
      }
    })()
    const onLogout = () => {
      clearSessionHint()
      setUser(null)
    }
    window.addEventListener(LOGOUT_EVENT, onLogout)
    return () => {
      alive = false
      window.removeEventListener(LOGOUT_EVENT, onLogout)
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password })
    setAccessToken(data.data.access_token)
    setSessionHint()
    setUser(await fetchMe())
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } catch {
      /* best effort */
    }
    setAccessToken(null)
    clearSessionHint()
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, ready, login, logout }), [user, ready, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
