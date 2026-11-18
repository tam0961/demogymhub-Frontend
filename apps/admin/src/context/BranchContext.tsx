import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { activeBranches } from '../lib/branches'
import { loadSavedBranch, saveBranch, setBranchId } from '../lib/session'

interface BranchValue {
  branchId: string | null
  setBranch: (id: string | null) => void
}
const BranchContext = createContext<BranchValue>({ branchId: null, setBranch: () => {} })

export function BranchProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [branchId, set] = useState<string | null>(() => {
    const open = activeBranches(user?.branches)
    if (open.length === 1) return open[0].id
    const s = loadSavedBranch()
    if (s && open.some((b) => b.id === s)) return s
    return null
  })
  setBranchId(branchId)
  useEffect(() => () => setBranchId(null), [])
  const setBranch = useCallback((id: string | null) => {
    saveBranch(id)
    set(id)
  }, [])
  return <BranchContext.Provider value={{ branchId, setBranch }}>{children}</BranchContext.Provider>
}

export const useBranch = () => useContext(BranchContext)
