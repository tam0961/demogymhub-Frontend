import { api } from './api'
import type { ListResp } from '../types'

export async function fetchAll<T>(url: string, params: Record<string, unknown> = {}, maxPages = 20): Promise<T[]> {
  const out: T[] = []
  for (let page = 1; page <= maxPages; page++) {
    const { data } = await api.get<ListResp<T>>(url, { params: { ...params, page, limit: 100 } })
    out.push(...data.data)
    if (out.length >= data.meta.total || data.data.length === 0) break
  }
  return out
}
