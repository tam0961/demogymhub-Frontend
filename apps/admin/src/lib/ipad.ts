import { api } from './api'

export type IpadStage = 'idle' | 'pay' | 'sign' | 'signed'

export interface PayPayload {
  amount: number
  content: string
  bankName: string
  account: string
  holder: string
  qrUrl: string
}
export interface SignPayload { title: string; rows: [string, string][]; consent?: string }

export const ipadUrl = (token: string) => `${window.location.origin}/ipad/${token}`

export async function createIpadSession(): Promise<string> {
  const r = await api.post<{ data: { token: string } }>('/ipad/sessions')
  return r.data.data.token
}

export const setIpadStage = (token: string, stage: 'idle' | 'pay' | 'sign', payload: PayPayload | SignPayload | null) =>
  api.put(`/ipad/sessions/${token}`, { stage, payload })

export async function getIpadSession(token: string): Promise<{ stage: IpadStage; signature: string | null }> {
  const r = await api.get<{ data: { stage: IpadStage; signature: string | null } }>(`/ipad/sessions/${token}`)
  return r.data.data
}

export async function getIpadPublic(token: string): Promise<{ stage: IpadStage; payload: (PayPayload & SignPayload) | null }> {
  const r = await api.get<{ data: { stage: IpadStage; payload: (PayPayload & SignPayload) | null } }>(`/public/ipad/${token}`)
  return r.data.data
}

export const sendIpadSignature = (token: string, signature: string) => api.post(`/public/ipad/${token}/sign`, { signature })
