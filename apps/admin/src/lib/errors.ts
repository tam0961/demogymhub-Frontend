import type { AxiosError } from 'axios'

export interface ApiErr { status: number; code: string; message: string }

export function apiError(e: unknown): ApiErr {
  const ax = e as AxiosError<{ error?: { code?: string; message?: string } }>
  const status = ax.response?.status ?? 0
  const err = ax.response?.data?.error
  if (err) return { status, code: err.code ?? 'UNKNOWN', message: err.message ?? 'Có lỗi xảy ra' }
  return { status, code: status ? 'UNKNOWN' : 'NETWORK', message: status ? 'Có lỗi xảy ra' : 'Không kết nối được máy chủ' }
}
