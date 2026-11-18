import type { Branch } from '../types'

// Only Quận 7 is open for now. Add codes here when more branches open.
export const ACTIVE_BRANCH_CODES = ['Q7']

export const activeBranches = (branches: Branch[] | undefined): Branch[] => {
  const all = branches ?? []
  const open = all.filter((b) => ACTIVE_BRANCH_CODES.includes(b.code.toUpperCase()))
  return open.length ? open : all
}
