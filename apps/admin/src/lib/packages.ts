import { PACKAGE_CATEGORIES } from './format'
import { apiError } from './errors'
import type { PackageCategory, Pkg } from '../types'

export const IN_USE_TITLE = 'Gói đã có hợp đồng, không sửa được. Hãy tạo phiên bản mới.'

export function groupPackages(rows: Pkg[], showInactive: boolean, q = ''): Record<PackageCategory, Pkg[]> {
  const k = q.trim().toLowerCase()
  const out = { member: [], pt_1on1: [], pt_1on2: [], pt_group: [] } as Record<PackageCategory, Pkg[]>
  rows.forEach((p) => {
    if (!showInactive && !p.active) return
    if (k && !p.name.toLowerCase().includes(k)) return
    out[p.category ?? 'member'].push(p)
  })
  return out
}

export const BOX_ORDER = PACKAGE_CATEGORIES

export function termText(p: Pkg): string {
  if (p.type === 'session') return `${p.sessions ?? 0} buổi${p.duration_days ? `, hết hạn sau ${p.duration_days} ngày` : ''}`
  const d = p.duration_days ?? 0
  return d >= 30 && d % 30 === 0 && p.type === 'month' ? `${d / 30} tháng` : `${d} ngày`
}

export const bundleText = (b: { name: string; duration_days: number | null }) => `${b.name} (${b.duration_days ?? 0} ngày)`

export interface PkgForm {
  name: string
  category: PackageCategory
  type: Pkg['type']
  duration_days: number | null
  sessions: number | null
  price: number
  vat_percent: number
  bundled_member_package_id: string
}

export function changedFields(old: Pkg, f: PkgForm): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (f.name !== old.name) out.name = f.name
  if (f.category !== old.category) out.category = f.category
  if (f.type !== old.type) out.type = f.type
  if (f.duration_days !== old.duration_days) out.duration_days = f.duration_days
  if (f.sessions !== old.sessions) out.sessions = f.sessions
  if (f.price !== old.price) out.price = f.price
  if (f.vat_percent !== old.vat_percent) out.vat_percent = f.vat_percent
  if (f.category.startsWith('pt_') && f.bundled_member_package_id !== (old.bundled_member_package?.id ?? '')) out.bundled_member_package_id = f.bundled_member_package_id || null
  return out
}

const PKG_ERR: Record<string, string> = {
  PACKAGE_IN_USE: 'Gói đã có hợp đồng nên không sửa được. Hãy tạo phiên bản mới.',
  INVALID_BUNDLE: 'Gói member đi kèm không hợp lệ: phải là gói member đang bán của cùng chi nhánh.',
  BUNDLED_PACKAGE_INACTIVE: 'Gói member đi kèm đã bị vô hiệu hóa. Hãy gắn gói member khác cho gói PT này.',
  PACKAGE_INACTIVE: 'Gói đã bị vô hiệu hóa nên không bán được.',
}
export function packageError(e: unknown): string {
  const a = apiError(e)
  return PKG_ERR[a.code] ?? a.message
}
