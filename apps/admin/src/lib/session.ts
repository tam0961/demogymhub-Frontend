let accessToken: string | null = null
let branchId: string | null = null

export const getAccessToken = () => accessToken
export const setAccessToken = (t: string | null) => {
  accessToken = t
}
export const getBranchId = () => branchId
export const setBranchId = (id: string | null) => {
  branchId = id
}

const BRANCH_KEY = 'gymhub_branch'
export const loadSavedBranch = (): string | null => {
  try {
    return localStorage.getItem(BRANCH_KEY)
  } catch {
    return null
  }
}
export const saveBranch = (id: string | null) => {
  try {
    if (id) localStorage.setItem(BRANCH_KEY, id)
    else localStorage.removeItem(BRANCH_KEY)
  } catch {
    /* ignore */
  }
}
