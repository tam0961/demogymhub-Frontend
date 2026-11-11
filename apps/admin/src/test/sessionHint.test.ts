import { beforeEach, describe, expect, it } from 'vitest'
import { clearSessionHint, hasSessionHint, setSessionHint } from '../lib/sessionHint'

describe('sessionHint', () => {
  beforeEach(() => localStorage.clear())

  it('is false until a login sets it, and false again after clearing', () => {
    expect(hasSessionHint()).toBe(false)
    setSessionHint()
    expect(hasSessionHint()).toBe(true)
    clearSessionHint()
    expect(hasSessionHint()).toBe(false)
  })
})
