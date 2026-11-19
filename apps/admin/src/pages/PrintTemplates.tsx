import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { Button, Field, Input, PageHeader, Panel, Tabs, useToast } from '../components/ui'
import { fillTemplate } from '../lib/printDoc'

export interface PrintTpl { key: string; title: string; body: string; is_default: boolean }

export const TEMPLATE_LABEL: Record<string, string> = {
  contract_member: 'Hợp đồng member',
  contract_pt: 'Hợp đồng PT',
  contract_deposit: 'Hợp đồng cọc',
  freeze_form: 'Phiếu bảo lưu',
  transfer_form: 'Phiếu chuyển nhượng',
}
const ORDER = Object.keys(TEMPLATE_LABEL)

export const PLACEHOLDERS: { key: string; label: string; sample: string }[] = [
  { key: 'chi_nhanh', label: 'Chi nhánh', sample: 'Chi nhánh Quận 7' },
  { key: 'ten_hoi_vien', label: 'Tên hội viên', sample: 'Nguyễn Văn An' },
  { key: 'ma_hoi_vien', label: 'Mã hội viên', sample: 'M000123' },
  { key: 'sdt', label: 'Số điện thoại', sample: '0903123456' },
  { key: 'ma_hop_dong', label: 'Mã hợp đồng', sample: 'HD-2026-0045' },
  { key: 'goi_tap', label: 'Gói tập', sample: 'PT 1:1 - 10 buổi' },
  { key: 'ngay_bat_dau', label: 'Ngày bắt đầu', sample: '19/11/2026' },
  { key: 'ngay_het_han', label: 'Ngày hết hạn', sample: '17/02/2027' },
  { key: 'tong_tien', label: 'Tổng giá trị', sample: '5.850.000 ₫' },
  { key: 'da_thanh_toan', label: 'Đã thanh toán', sample: '2.000.000 ₫' },
  { key: 'con_thieu', label: 'Còn thiếu', sample: '3.850.000 ₫' },
  { key: 'nhan_vien_sale', label: 'Nhân viên sale', sample: 'Lễ tân Quận 7' },
  { key: 'pt_phu_trach', label: 'PT phụ trách', sample: 'Vũ Bảo Khánh' },
  { key: 'ngay_in', label: 'Ngày in', sample: '19/11/2026' },
  { key: 'so_ngay_bao_luu', label: 'Số ngày bảo lưu', sample: '30' },
  { key: 'ly_do', label: 'Lý do', sample: 'Đi công tác' },
  { key: 'nguoi_nhan', label: 'Người nhận chuyển nhượng', sample: 'Trần Thị Bình' },
  { key: 'sdt_nguoi_nhan', label: 'SĐT người nhận', sample: '0987654321' },
  { key: 'phi_chuyen_nhuong', label: 'Phí chuyển nhượng', sample: '500.000 ₫' },
]

const sampleValues = () => Object.fromEntries(PLACEHOLDERS.map((p) => [p.key, p.sample]))
const escapeHtml = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string)

export default function PrintTemplates() {
  const toast = useToast()
  const area = useRef<HTMLTextAreaElement>(null)
  const [rows, setRows] = useState<PrintTpl[]>([])
  const [tab, setTab] = useState(ORDER[0])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const pick = useCallback((list: PrintTpl[], key: string) => {
    const t = list.find((r) => r.key === key)
    setTitle(t?.title ?? '')
    setBody(t?.body ?? '')
  }, [])

  useEffect(() => {
    api.get<{ data: PrintTpl[] }>('/settings/print-templates')
      .then((r) => { setRows(r.data.data); pick(r.data.data, ORDER[0]) })
      .catch((e) => setError(apiError(e).message))
  }, [pick])

  const current = rows.find((r) => r.key === tab)
  const dirty = !!current && (current.title !== title || current.body !== body)
  const change = (k: string) => { setTab(k); pick(rows, k) }
  const replaceRow = (t: PrintTpl) => setRows((rs) => rs.map((r) => (r.key === t.key ? t : r)))

  const insert = (key: string) => {
    const el = area.current
    const token = `{{${key}}}`
    if (!el) { setBody((b) => b + token); return }
    const s = el.selectionStart
    const e = el.selectionEnd
    setBody(body.slice(0, s) + token + body.slice(e))
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + token.length, s + token.length) })
  }

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      const { data } = await api.put<{ data: PrintTpl }>(`/settings/print-templates/${tab}`, { title: title.trim(), body })
      replaceRow(data.data)
      toast('Đã lưu mẫu in')
    } catch (e) {
      setError(apiError(e).message)
    } finally {
      setBusy(false)
    }
  }

  const reset = async () => {
    if (!window.confirm('Khôi phục mẫu in này về nội dung mặc định?')) return
    setBusy(true)
    try {
      const { data } = await api.delete<{ data: PrintTpl }>(`/settings/print-templates/${tab}`)
      replaceRow(data.data)
      setTitle(data.data.title)
      setBody(data.data.body)
      toast('Đã khôi phục mẫu mặc định')
    } catch (e) {
      setError(apiError(e).message)
    } finally {
      setBusy(false)
    }
  }

  const printTest = () => {
    const w = window.open('', '_blank')
    if (!w) return
    const html = `<!doctype html><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font:14px/1.6 'Be Vietnam Pro',Arial,sans-serif;margin:40px}h1{text-align:center;font-size:20px}pre{white-space:pre-wrap;font:inherit}</style><h1>${escapeHtml(fillTemplate(title, sampleValues()))}</h1><pre>${escapeHtml(fillTemplate(body, sampleValues()))}</pre>`
    w.document.write(html)
    w.document.close()
    w.focus()
    w.print()
  }

  return (
    <>
      <PageHeader title="Mẫu in" sub="Nội dung hợp đồng và phiếu in cho hội viên. Chèn thông tin tự động bằng các thẻ dạng {{ten_hoi_vien}}." />
      {error && <div className="form-error" role="alert">{error}</div>}
      <Tabs tabs={ORDER.map((k) => ({ value: k, label: TEMPLATE_LABEL[k] }))} value={tab} onChange={change} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, alignItems: 'start', marginTop: 12 }}>
        <Panel title="Soạn mẫu" note={current?.is_default ? 'Đang dùng mặc định' : 'Đã tùy chỉnh'}>
          <div className="form-grid">
            <Field label="Tiêu đề" htmlFor="pt-title" full><Input id="pt-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} /></Field>
            <Field label="Nội dung" htmlFor="pt-body" full>
              <textarea id="pt-body" className="input" ref={area} rows={18} value={body} onChange={(e) => setBody(e.target.value)} />
            </Field>
            <div className="full">
              <div className="hint-muted" style={{ marginBottom: 6 }}>Bấm để chèn thông tin tại vị trí con trỏ</div>
              <div className="chips" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {PLACEHOLDERS.map((p) => <Button key={p.key} small onClick={() => insert(p.key)}>{p.label}</Button>)}
              </div>
            </div>
            <div className="full" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <Button onClick={reset} disabled={busy || current?.is_default}>Khôi phục mặc định</Button>
              <Button onClick={printTest}>In thử</Button>
              <Button variant="primary" onClick={save} disabled={busy || !dirty || !title.trim()}>{busy ? 'Đang lưu...' : 'Lưu'}</Button>
            </div>
          </div>
        </Panel>
        <Panel title="Xem trước (dữ liệu mẫu)">
          <div className="contract-sheet">
            <h3 style={{ textAlign: 'center' }}>{fillTemplate(title, sampleValues())}</h3>
            <pre style={{ whiteSpace: 'pre-wrap', font: 'inherit', margin: 0 }}>{fillTemplate(body, sampleValues())}</pre>
          </div>
        </Panel>
      </div>
    </>
  )
}
