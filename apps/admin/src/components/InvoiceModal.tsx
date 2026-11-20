import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtDateTime, fmtMoney } from '../lib/format'
import { Modal } from './Modal'
import { Button, Chip, Field, Input, Select } from './ui'
import type { Contract, InvoiceIssued, InvoicePublicCfg, InvoiceRow } from '../types'

const STATUS_LABEL: Record<InvoiceRow['status'], string> = { test: 'Chạy thử', issued: 'Đã phát hành', failed: 'Lỗi' }

export function InvoiceModal({ contract, onClose }: { contract: Contract; onClose: () => void }) {
  const [cfg, setCfg] = useState<InvoicePublicCfg | null>(null)
  const [rows, setRows] = useState<InvoiceRow[]>([])
  const [name, setName] = useState(contract.member.name)
  const [taxCode, setTaxCode] = useState('')
  const [address, setAddress] = useState('')
  const [email, setEmail] = useState(contract.member.email ?? '')
  const [phone, setPhone] = useState(contract.member.phone)
  const [item, setItem] = useState(contract.package.name)
  const [gross, setGross] = useState(String(contract.paid_amount))
  const [vat, setVat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<InvoiceIssued | null>(null)

  const loadRows = useCallback(async () => {
    try {
      const { data } = await api.get<{ data: InvoiceRow[] }>('/invoices', { params: { contract_id: contract.id } })
      setRows(data.data)
    } catch {
      setRows([])
    }
  }, [contract.id])

  useEffect(() => {
    api
      .get<{ data: InvoicePublicCfg }>('/invoices/config/public')
      .then(({ data }) => {
        setCfg(data.data)
        setVat(String(data.data.vat))
      })
      .catch((e) => setError(apiError(e).message))
    void loadRows()
  }, [loadRows])

  const issue = async () => {
    setBusy(true)
    setError('')
    setResult(null)
    const company = taxCode.trim() ? name.trim() : ''
    try {
      const { data } = await api.post<{ data: InvoiceIssued }>('/invoices/issue', {
        contract_id: contract.id,
        buyer: { name: name.trim(), legalName: company, taxCode: taxCode.trim(), address: address.trim(), email: email.trim(), phone: phone.trim() },
        items: [{ name: item.trim(), gross: Number(gross) || 0, vat: Number(vat) }],
      })
      setResult(data.data)
      await loadRows()
    } catch (e) {
      setError(apiError(e).message)
      await loadRows()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Lập hóa đơn VAT"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Đóng</Button>
          <Button variant="primary" disabled={busy || !cfg} onClick={issue}>{busy ? 'Đang lập...' : 'Lập hóa đơn'}</Button>
        </>
      }
    >
      {cfg && (
        <div className="view-note" role="note">
          {cfg.live ? 'Chế độ phát hành thật: hóa đơn sẽ được gửi cho Viettel S-Invoice.' : 'Chế độ chạy thử: chỉ tính và kiểm tra, chưa gửi cho Viettel.'}
        </div>
      )}
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="form-grid">
        <Field label="Tên người mua hoặc đơn vị" htmlFor="inv-name"><Input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Mã số thuế (nếu xuất cho đơn vị)" htmlFor="inv-tax"><Input id="inv-tax" value={taxCode} onChange={(e) => setTaxCode(e.target.value)} /></Field>
        <Field label="Địa chỉ" htmlFor="inv-addr"><Input id="inv-addr" value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
        <Field label="Email nhận hóa đơn" htmlFor="inv-mail"><Input id="inv-mail" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Điện thoại" htmlFor="inv-phone"><Input id="inv-phone" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field label="Tên hàng" htmlFor="inv-item"><Input id="inv-item" value={item} onChange={(e) => setItem(e.target.value)} /></Field>
        <Field label="Số tiền đã gồm VAT" htmlFor="inv-gross"><Input id="inv-gross" inputMode="numeric" value={gross} onChange={(e) => setGross(e.target.value.replace(/\D/g, ''))} /></Field>
        <Field label="Thuế suất VAT (%)" htmlFor="inv-vat">
          <Select id="inv-vat" value={vat} onChange={(e) => setVat(e.target.value)}>
            {(cfg?.vat_rates ?? [0, 5, 8, 10]).map((r) => <option key={r} value={r}>{r}%</option>)}
          </Select>
        </Field>
      </div>
      {result && (
        <div className="info-ok" role="status" style={{ marginTop: 12 }}>
          {result.status === 'issued' ? <b>Đã phát hành hóa đơn số {result.invoice_no || '-'}</b> : <b>{result.note ?? 'Đã tính và kiểm tra'}</b>}
          <dl className="kv">
            <dt>Tiền hàng</dt><dd>{fmtMoney(result.calc.net)}</dd>
            <dt>Thuế VAT</dt><dd>{fmtMoney(result.calc.tax)}</dd>
            <dt>Tổng thanh toán</dt><dd>{fmtMoney(result.calc.total)}</dd>
            <dt>Bằng chữ</dt><dd>{result.words}</dd>
          </dl>
        </div>
      )}
      <h3 style={{ fontSize: 14, margin: '16px 0 6px' }}>Hóa đơn đã lập cho hợp đồng này</h3>
      {rows.length === 0 ? (
        <p className="hint-muted">Chưa có hóa đơn nào.</p>
      ) : (
        <table className="table">
          <thead><tr><th>Thời gian</th><th>Người mua</th><th>Số hóa đơn</th><th className="num">Tổng</th><th>Trạng thái</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{fmtDateTime(r.created_at)}</td>
                <td>{r.buyer_name}</td>
                <td>{r.invoice_no ?? '-'}</td>
                <td className="num">{fmtMoney(r.total)}</td>
                <td>
                  <Chip tone={r.status === 'issued' ? 'ok' : r.status === 'failed' ? 'bad' : 'warn'}>{STATUS_LABEL[r.status]}</Chip>
                  {r.error && <div className="cell-sub">{r.error}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  )
}
