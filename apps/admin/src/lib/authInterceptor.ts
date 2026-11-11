import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios'

export function singleFlight<T>(fn: () => Promise<T>): () => Promise<T> {
  let inflight: Promise<T> | null = null
  return () => {
    inflight ??= fn().finally(() => {
      inflight = null
    })
    return inflight
  }
}

interface Opts {
  renew: () => Promise<string>
  onAuthFail: () => void
  getToken: () => string | null
  getBranchId?: () => string | null
  getVisitorId?: () => Promise<string | null>
}

type Retry = InternalAxiosRequestConfig & { _retry?: boolean }

export function attachAuth(inst: AxiosInstance, opts: Opts) {
  const renew = singleFlight(opts.renew)

  inst.interceptors.request.use(async (cfg) => {
    const t = opts.getToken()
    if (t) cfg.headers.set('Authorization', `Bearer ${t}`)
    const b = opts.getBranchId?.()
    if (b) cfg.headers.set('X-Branch-Id', b)
    const v = await opts.getVisitorId?.().catch(() => null)
    if (v) cfg.headers.set('X-Visitor-ID', v)
    return cfg
  })

  inst.interceptors.response.use(
    (r) => r,
    async (err) => {
      const cfg = err.config as Retry | undefined
      const status = err.response?.status
      const code = err.response?.data?.error?.code
      const isAuthUrl = typeof cfg?.url === 'string' && cfg.url.startsWith('/auth/')
      if (status === 401 && code === 'TOKEN_EXPIRED' && cfg && !cfg._retry && !isAuthUrl) {
        cfg._retry = true
        try {
          await renew()
        } catch {
          opts.onAuthFail()
          return Promise.reject(err)
        }
        return inst.request(cfg)
      }
      if (status === 401 && (code === 'TOKEN_INVALID' || code === 'REUSE_DETECTED') && !isAuthUrl) {
        opts.onAuthFail()
      }
      return Promise.reject(err)
    },
  )
}
