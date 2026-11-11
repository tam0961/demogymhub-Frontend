import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import axios, { AxiosError, type AxiosAdapter } from 'axios'
import type { ReactNode } from 'react'
import { AuthContext } from '../context/AuthContext'
import { makePermission, usePermission } from '../context/usePermission'
import { attachAuth } from '../lib/authInterceptor'

const wrap = (roles: string[], permissions: string[]) => ({ children }: { children: ReactNode }) => (
  <AuthContext.Provider
    value={{
      user: { id: '1', email: 'a@b.c', name: 'A', roles, permissions, branches: [] },
      ready: true,
      login: async () => {},
      logout: async () => {},
    }}
  >
    {children}
  </AuthContext.Provider>
)

describe('usePermission', () => {
  it('checks can/canAny/canAll/hasRole', () => {
    const { result } = renderHook(() => usePermission(), { wrapper: wrap(['receptionist'], ['members.read', 'members.create']) })
    expect(result.current.can('members.read')).toBe(true)
    expect(result.current.can('packages.create')).toBe(false)
    expect(result.current.canAny('packages.create', 'members.create')).toBe(true)
    expect(result.current.canAll('members.read', 'packages.read')).toBe(false)
    expect(result.current.hasRole('receptionist')).toBe(true)
  })

  it('super_admin passes everything; null user passes nothing', () => {
    expect(makePermission({ roles: ['super_admin'], permissions: [] }).can('anything')).toBe(true)
    expect(makePermission(null).can('members.read')).toBe(false)
  })
})

describe('renew interceptor', () => {
  function setup(renewFn: () => Promise<string>) {
    let token = 'old'
    const calls: string[] = []
    const adapter: AxiosAdapter = async (config) => {
      const auth = String(config.headers.get('Authorization'))
      calls.push(auth)
      if (auth === 'Bearer new') return { data: { data: 'ok' }, status: 200, statusText: 'OK', headers: {}, config }
      const response = { data: { error: { code: 'TOKEN_EXPIRED', message: 'x' } }, status: 401, statusText: '', headers: {}, config }
      throw new AxiosError('expired', 'ERR_BAD_REQUEST', config, null, response)
    }
    const inst = axios.create({ adapter })
    const onAuthFail = vi.fn()
    attachAuth(inst, { renew: renewFn, onAuthFail, getToken: () => token })
    return { inst, onAuthFail, setToken: (t: string) => (token = t), calls }
  }

  it('renews once for parallel 401s and retries all', async () => {
    let t: ReturnType<typeof setup>
    const renew = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 10))
      t.setToken('new')
      return 'new'
    })
    t = setup(renew)
    const res = await Promise.all([t.inst.get('/a'), t.inst.get('/b'), t.inst.get('/c')])
    expect(res.map((r) => r.data.data)).toEqual(['ok', 'ok', 'ok'])
    expect(renew).toHaveBeenCalledTimes(1)
    expect(t.onAuthFail).not.toHaveBeenCalled()
  })

  it('calls onAuthFail when renew fails', async () => {
    const t = setup(async () => {
      throw new Error('nope')
    })
    await expect(t.inst.get('/a')).rejects.toBeTruthy()
    expect(t.onAuthFail).toHaveBeenCalledTimes(1)
  })
})
