import type { ReactNode } from 'react'
import { usePermission } from '../context/usePermission'
import Forbidden from '../pages/Forbidden'

export function PermRoute({ permission, children }: { permission: string; children: ReactNode }) {
  const { can } = usePermission()
  return can(permission) ? <>{children}</> : <Forbidden />
}
