import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { Button, Field, Input, PageHeader, Panel, Select, useToast } from '../components/ui'
import type { InvoiceCfg, InvoiceCfgResp } from '../types'

const TEXT: { key: keyof InvoiceCfg; label: string; hint?: string }[] = [
  { key: 'base', label: 'Địa chỉ máy chủ Viettel', hint: 'Bắt đầu bằng https://' },
  { key: 'supplierCode', label: 'Mã số thuế dùng trong đường dẫn (supplierCode)' },
  { key: 'invoiceType', label: 'Loại hóa đơn' },
  { key: 'templateCode', label: 'Mẫu số' },
  { key: 'user', label: 'Tài khoản API' },
  { key: 'sellerName', label: 'Tên bên bán' },
  { key: 'sellerTaxCode', label: 'Mã số thuế bên bán' },
  { key: 'sellerAddress', label: 'Địa chỉ bên bán' },
  { key: 'sellerPhone', label: 'Điện thoại bên bán' },
  { key: 'sellerEmail', label: 'Email bên bán' },
  { key: 'sellerBank', label: 'Ngân hàng bên bán' },
  { key: 'sellerAccount', label: 'Số tài khoản bên bán' },
]

export default function InvoiceSettings() {
  const toast = useToast()
  const [resp, setResp] = useState<InvoiceCfgResp | null>(null)
  const [form, setForm] = useState<InvoiceCfg | null>(null)
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<{ data: InvoiceCfgResp }>('/invoices/config')
      setResp(data.data)
      setForm(data.data.cfg)
    } catch (e) {
      setErr(apiError(e).message)
    }
  }, [])
  useEffect(() => { void load() }, [load])

  if (!form || !resp) return <><PageHeader title="Hóa đơn VAT" />{err ? <div className="form-error" role="alert">{err}</div> : <p className="cell-sub">Đang tải...</p>}</>

  const set = (patch: Partial<InvoiceCfg>) => setForm((f) => (f ? { ...f, ...patch } : f))

  const save = async () => {
    setBusy(true)
    setErr('')
    try {
      const { data } = await api.put<{ data: InvoiceCfgResp }>('/invoices/config', { ...form, pass: pass || undefined })
      setResp(data.data)
      setForm(data.data.cfg)
      setPass('')
      toast('Đã lưu thiết lập hóa đơn VAT')
    } catch (e) {
      setErr(apiError(e).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title="Hóa đơn VAT" sub="Viettel S-Invoice, chỉ chủ xem và sửa" />
      {err && <div className="form-error" role="alert">{err}</div>}
      <Panel title="Kết nối Viettel S-Invoice">
        <label className="check" style={{ display: 'block', margin: '4px 0 8px' }}>
          <input type="checkbox" checked={form.live} onChange={(e) => set({ live: e.target.checked })} /> Phát hành thật (gửi cho Viettel)
        </label>
        {form.live ? (
          <div className="view-note" role="note">
            Viettel chỉ nhận lệnh từ địa chỉ IP đã đăng ký, nên chỉ phát hành được từ máy chủ VPS có IP cố định đã đăng ký với Viettel. Phần gửi thật chưa từng được thử với Viettel thật, hãy thử trên môi trường demo trước.
          </div>
        ) : (
          <p className="cell-sub">Đang ở chế độ chạy thử: chỉ tính và kiểm tra, không gửi gì cho Viettel.</p>
        )}
        <div className="form-grid">
          {TEXT.map((t) => (
            <Field key={t.key} label={t.label} htmlFor={`inv-${t.key}`} hint={t.hint}>
              <Input id={`inv-${t.key}`} value={String(form[t.key] ?? '')} onChange={(e) => set({ [t.key]: e.target.value } as Partial<InvoiceCfg>)} />
            </Field>
          ))}
          <Field label="Thuế suất mặc định (%)" htmlFor="inv-vat">
            <Select id="inv-vat" value={String(form.vat)} onChange={(e) => set({ vat: Number(e.target.value) })}>
              {resp.vat_rates.map((r) => <option key={r} value={r}>{r}%</option>)}
            </Select>
          </Field>
          <Field label="Mật khẩu API" htmlFor="inv-pass" hint={resp.has_pass ? 'Đã lưu, để trống để giữ nguyên. Không hiển thị lại.' : 'Chưa lưu mật khẩu.'}>
            <Input id="inv-pass" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />
          </Field>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <Button variant="primary" disabled={busy} onClick={save}>{busy ? 'Đang lưu...' : 'Lưu thiết lập'}</Button>
        </div>
      </Panel>
    </>
  )
}
