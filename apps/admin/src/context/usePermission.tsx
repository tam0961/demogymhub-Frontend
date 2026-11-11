import { useMemo, type ReactNode } from 'react'
import { useAuth } from './AuthContext'
import type { Me } from '../types'

export function makePermission(user: Pick<Me, 'roles' | 'permissions'> | null) {
  const roles = user?.roles ?? []
  const perms = user?.permissions ?? []
  const can = (p: string) => roles.includes('super_admin') || perms.includes(p)
  return {
    can,
    canAny: (...ps: string[]) => ps.some(can),
    canAll: (...ps: string[]) => ps.every(can),
    hasRole: (r: string) => roles.includes(r),
  }
}

export function usePermission() {
  const { user } = useAuth()
  return useMemo(() => makePermission(user), [user])
}

interface Props {
  permission?: string
  any?: string[]
  all?: string[]
  fallback?: ReactNode
  children: ReactNode
}

export function RequirePermission({ permission, any, all, fallback = null, children }: Props) {
  const p = usePermission()
  const ok = (permission ? p.can(permission) : true) && (any ? p.canAny(...any) : true) && (all ? p.canAll(...all) : true)
  return <>{ok ? children : fallback}</>
}
