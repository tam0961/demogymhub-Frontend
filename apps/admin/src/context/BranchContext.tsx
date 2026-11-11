import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { loadSavedBranch, saveBranch, setBranchId } from '../lib/session'

interface BranchValue {
  branchId: string | null
  setBranch: (id: string | null) => void
}
const BranchContext = createContext<BranchValue>({ branchId: null, setBranch: () => {} })

export function BranchProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [branchId, set] = useState<string | null>(() => {
    const s = loadSavedBranch()
    return s && user?.branches.some((b) => b.id === s) ? s : null
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
