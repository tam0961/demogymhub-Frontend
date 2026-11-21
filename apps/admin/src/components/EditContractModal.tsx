import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { Modal } from './Modal'
import { useToast } from './Toast'
import { Button, Field, Input, MoneyInput, Select, Textarea } from './ui'
import type { Contract, ListResp, Pkg } from '../types'

const dayOf = (v: string | null) => (v ? v.slice(0, 10) : '')

export function EditContractModal({ contract, onClose, onDone }: { contract: Contract; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [pkgs, setPkgs] = useState<Pkg[]>([])
  const [pkgId, setPkgId] = useState(contract.package_id)
  const [start, setStart] = useState(dayOf(contract.start_date))
  const [end, setEnd] = useState(dayOf(contract.end_date))
  const [total, setTotal] = useState(String(contract.total_amount))
  const [sTotal, setSTotal] = useState(contract.sessions_total == null ? '' : String(contract.sessions_total))
  const [sLeft, setSLeft] = useState(contract.sessions_left == null ? '' : String(contract.sessions_left))
  const [note, setNote] = useState(contract.note ?? '')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    api.get<ListResp<Pkg>>('/packages', { params: { branch_id: contract.branch_id, limit: 200 } })
      .then((r) => { if (alive) setPkgs(r.data.data.filter((p) => !p.branch_id || p.branch_id === contract.branch_id)) })
      .catch(() => { if (alive) setPkgs([]) })
    return () => { alive = false }
  }, [contract.branch_id])

  const num = (s: string) => (s.trim() === '' ? null : Number(s))
  const body = () => {
    const b: Record<string, unknown> = { reason: reason.trim() }
    if (pkgId !== contract.package_id) b.package_id = pkgId
    if (start !== dayOf(contract.start_date)) b.start_date = start || null
    if (end !== dayOf(contract.end_date)) b.end_date = end || null
    if (Number(total) !== contract.total_amount) b.total_amount = Number(total)
    if (num(sTotal) !== contract.sessions_total) b.sessions_total = num(sTotal)
    if (num(sLeft) !== contract.sessions_left) b.sessions_left = num(sLeft)
    if (note.trim() !== (contract.note ?? '')) b.note = note.trim() || null
    return b
  }
  const changed = Object.keys(body()).length > 1
  const paid = contract.paid_amount

  const save = async () => {
    setErr('')
    if (!reason.trim()) return setErr('Nhập lý do sửa')
    if (Number(total) < paid) return setErr('Tổng tiền không được thấp hơn số đã thu')
    if (start && end && end < start) return setErr('Ngày kết thúc phải sau ngày bắt đầu')
    const t = num(sTotal)
    const l = num(sLeft)
    if (t != null && l != null && l > t) return setErr('Số buổi còn lại không được lớn hơn tổng số buổi')
    setBusy(true)
    try {
      await api.patch(`/contracts/${contract.id}`, body())
      toast('Đã cập nhật hợp đồng')
      onDone()
    } catch (e) {
      setErr(apiError(e).message)
    } finally {
      setBusy(false)
    }
  }

  const pkgOptions = pkgs.some((p) => p.id === contract.package_id) ? pkgs : [{ id: contract.package_id, name: contract.package.name } as Pkg, ...pkgs]

  return (
    <Modal
      title={`Sửa hợp đồng ${contract.code}`}
      onClose={onClose}
      footer={<><Button onClick={onClose} disabled={busy}>Hủy</Button><Button variant="primary" onClick={save} disabled={busy || !changed}>{busy ? 'Đang lưu...' : 'Lưu thay đổi'}</Button></>}
    >
      {err && <div className="form-error" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
      <Field label="Gói dịch vụ" htmlFor="ec-pkg">
        <Select id="ec-pkg" value={pkgId} onChange={(e) => setPkgId(e.target.value)}>
          {pkgOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Field>
      <div className="form-grid">
        <Field label="Ngày bắt đầu" htmlFor="ec-start"><Input id="ec-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="Ngày kết thúc" htmlFor="ec-end"><Input id="ec-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      </div>
      <Field label="Tổng tiền hợp đồng" htmlFor="ec-total" hint={`Đã thu ${paid.toLocaleString('vi-VN')} ₫, tổng tiền không được thấp hơn số này.`}>
        <MoneyInput id="ec-total" value={total} onValueChange={setTotal} />
      </Field>
      <div className="form-grid">
        <Field label="Tổng số buổi" htmlFor="ec-st"><Input id="ec-st" inputMode="numeric" placeholder="Không có" value={sTotal} onChange={(e) => setSTotal(e.target.value.replace(/\D/g, ''))} /></Field>
        <Field label="Số buổi còn lại" htmlFor="ec-sl"><Input id="ec-sl" inputMode="numeric" placeholder="Không có" value={sLeft} onChange={(e) => setSLeft(e.target.value.replace(/\D/g, ''))} /></Field>
      </div>
      <Field label="Ghi chú" htmlFor="ec-note"><Textarea id="ec-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <Field label="Lý do sửa (bắt buộc, lưu vào lịch sử hợp đồng)" htmlFor="ec-reason"><Input id="ec-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </Modal>
  )
}
