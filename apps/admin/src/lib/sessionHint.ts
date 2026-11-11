const KEY = 'gh_session'

export function hasSessionHint(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return true
  }
}

export function setSessionHint() {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    /* storage unavailable */
  }
}

export function clearSessionHint() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* storage unavailable */
  }
}
