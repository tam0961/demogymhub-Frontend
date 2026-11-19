import { fmtDate, fmtMoney, todayISO } from './format'
import type { Contract } from '../types'

export const fillTemplate = (text: string, values: Record<string, string>) => text.replace(/\{\{(\w+)\}\}/g, (m, k: string) => values[k] ?? m)
const escapeHtml = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string)

export const templateKeyOf = (category: string | undefined) => (category === 'pt_1on1' || category === 'pt_1on2' || category === 'pt_group' ? 'contract_pt' : 'contract_member')

export function contractValues(c: Contract & { branch?: { name: string } | null }): Record<string, string> {
  return {
    chi_nhanh: c.branch?.name ?? '', ten_hoi_vien: c.member.name, ma_hoi_vien: c.member.code, sdt: c.member.phone,
    ma_hop_dong: c.code, goi_tap: c.package.name, ngay_bat_dau: c.start_date ? fmtDate(c.start_date) : '-', ngay_het_han: c.end_date ? fmtDate(c.end_date) : '-',
    tong_tien: fmtMoney(c.total_amount), da_thanh_toan: fmtMoney(c.paid_amount), con_thieu: fmtMoney(c.debt_amount),
    nhan_vien_sale: c.sale?.name ?? '-', pt_phu_trach: c.pt?.name ?? '-', ngay_in: fmtDate(todayISO()),
    so_ngay_bao_luu: '-', ly_do: '-', nguoi_nhan: '-', sdt_nguoi_nhan: '-', phi_chuyen_nhuong: '-',
  }
}

export function renderDocHtml(title: string, body: string, values: Record<string, string>): string {
  const t = escapeHtml(fillTemplate(title, values))
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${t}</title><style>body{font:14px/1.7 'Be Vietnam Pro',Arial,sans-serif;margin:0;color:#111}.bar{position:sticky;top:0;background:#f4f4f2;border-bottom:1px solid #ddd;padding:10px 40px;display:flex;justify-content:flex-end}.bar button{font:inherit;padding:6px 14px;border:1px solid #bbb;border-radius:6px;background:#fff;cursor:pointer}main{max-width:780px;margin:24px auto;padding:0 40px 60px}h1{text-align:center;font-size:20px}pre{white-space:pre-wrap;font:inherit}@media print{.bar{display:none}main{margin:0}}</style></head><body><div class="bar"><button onclick="window.print()">In hoặc lưu thành PDF</button></div><main><h1>${t}</h1><pre>${escapeHtml(fillTemplate(body, values))}</pre></main></body></html>`
}
