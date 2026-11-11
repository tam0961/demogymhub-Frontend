import axios from 'axios'
import { attachAuth, singleFlight } from './authInterceptor'
import { getAccessToken, setAccessToken, getBranchId } from './session'
import { getVisitorId } from './fingerprint'
import { reportApi } from './connection'
import { mockAdapter } from '../mock/adapter'

export const USE_MOCK = import.meta.env.VITE_USE_MOCK === '1'
const baseURL = import.meta.env.VITE_API_URL || '/api'

export const api = axios.create({ baseURL, withCredentials: true })
const bare = axios.create({ baseURL, withCredentials: true })

if (USE_MOCK) {
  api.defaults.adapter = mockAdapter
  bare.defaults.adapter = mockAdapter
}

export const LOGOUT_EVENT = 'gymhub:logout'

async function postRenew(attempt = 0): Promise<{ data: { access_token: string } }> {
  try {
    const { data } = await bare.post('/auth/renew', {})
    return data
  } catch (e) {
    const code = (e as { response?: { status?: number; data?: { error?: { code?: string } } } }).response
    if (code?.status === 409 && code.data?.error?.code === 'RENEW_CONFLICT' && attempt < 2) {
      await new Promise((r) => setTimeout(r, 300))
      return postRenew(attempt + 1)
    }
    throw e
  }
}

export const renewAccessToken = singleFlight(async () => {
  const data = await postRenew()
  const t = data.data.access_token as string
  setAccessToken(t)
  return t
})

attachAuth(api, {
  renew: renewAccessToken,
  getToken: getAccessToken,
  getBranchId,
  getVisitorId: USE_MOCK ? undefined : getVisitorId,
  onAuthFail: () => {
    setAccessToken(null)
    window.dispatchEvent(new Event(LOGOUT_EVENT))
  },
})

api.interceptors.response.use(
  (r) => {
    reportApi(true)
    return r
  },
  (e) => {
    reportApi(!!(e as { response?: unknown }).response)
    return Promise.reject(e)
  },
)
