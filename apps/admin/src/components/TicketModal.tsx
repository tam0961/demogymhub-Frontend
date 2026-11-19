import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { METHODS, METHOD_LABEL, fmtDate } from '../lib/format'
import { TICKET_LABEL, TICKET_TYPES, buildTicketBody, canSubmitTicket, createUrl, feeText, needsPackage, quoteParams, quoteUrl, type TicketQuote, type TicketType } from '../lib/tickets'
import { useAuth } from '../context/AuthContext'
import { useToast } from './Toast'
import { Modal } from './Modal'
import { Button, Chip, Field, Input, MoneyInput, Select, Textarea } from './ui'
import type { Contract, ListResp, PayMethod, Pkg } from '../types'

interface Props { contract: Contract; onClose: () => void; onDone: () => void }

export function TicketModal({ contract, onClose, onDone }: Props) {
  const toast = useToast()
  const { user } = useAuth()
  const [type, setType] = useState<TicketType>('upgrade')
  const [pkgs, setPkgs] = useState<Pkg[]>([])
  const [pkgId, setPkgId] = useState('')
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [branchId, setBranchId] = useState('')
  const [reason, setReason] = useState('')
  const [paid, setPaid] = useState('')
  const [method, setMethod] = useState<PayMethod>('cash')
  const [quote, setQuote] = useState<TicketQuote | null>(null)
  const [qErr, setQErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const otherBranches = useMemo(() => (user?.branches ?? []).filter((b) => b.id !== contract.branch_id), [user, contract.branch_id])

  useEffect(() => {
    let alive = true
    api.get<ListResp<Pkg>>('/packages', { params: { branch_id: contract.branch_id, active: true, limit: 200 } })
      .then((r) => {
        if (!alive) return
        const sameKind = (c: string) => (c === 'member') === (contract.package.category === 'member')
        setPkgs(r.data.data.filter((p) => p.active && !p.bundle_only && p.id !== contract.package_id && (!p.branch_id || p.branch_id === contract.branch_id) && sameKind(p.category)))
      })
      .catch(() => { if (alive) setPkgs([]) })
    return () => { alive = false }
  }, [contract.branch_id, contract.package_id, contract.package.category])

  useEffect(() => {
    setPkgId('')
    setQuote(null)
    setQErr('')
    setErr('')
  }, [type])

  useEffect(() => {
    if (needsPackage(type) && !pkgId) return
    let alive = true
    const t = setTimeout(() => {
      api.get<{ data: TicketQuote }>(quoteUrl(contract.id), { params: quoteParams(type, pkgId) })
        .then((r) => { if (alive) { setQuote(r.data.data); setQErr('') } })
        .catch((e) => { if (alive) { setQuote(null); setQErr(apiError(e).message) } })
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [contract.id, type, pkgId])

  const ready = canSubmitTicket(type, { package_id: pkgId, phone, name, branch_id: branchId, reason }, quote)
  const fee = quote?.fee ?? 0

  const submit = async () => {
    if (!quote) return
    setBusy(true)
    setErr('')
    try {
      const body = buildTicketBody({
        type,
        package_id: pkgId,
        to_member: { phone: phone.trim(), name: name.trim() },
        branch_id: branchId,
        reason,
        paid: fee > 0 ? Number(paid.replace(/\D/g, '')) || 0 : 0,
        method,
      })
      const { data } = await api.post<{ data: { ticket: { status: string } } }>(createUrl(contract.id), body)
      toast(data.data.ticket.status === 'pending' ? 'Đã gửi chờ duyệt' : `Đã lập phiếu ${TICKET_LABEL[type].toLowerCase()}`)
      onDone()
    } catch (e) {
      setErr(apiError(e).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Lập phiếu"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Đóng</Button>
          <Button variant="primary" onClick={submit} disabled={busy || !ready}>{busy ? 'Đang lập...' : 'Lập phiếu'}</Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Loại phiếu" htmlFor="tk-type" full>
          <Select id="tk-type" value={type} onChange={(e) => setType(e.target.value as TicketType)}>
            {TICKET_TYPES.map((t) => <option key={t} value={t}>{TICKET_LABEL[t]}</option>)}
          </Select>
        </Field>

        {needsPackage(type) && (
          <Field label="Gói mới" htmlFor="tk-pkg" full>
            <Select id="tk-pkg" value={pkgId} onChange={(e) => setPkgId(e.target.value)}>
              <option value="">Chọn gói</option>
              {pkgs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
        )}

        {type === 'transfer' && (
          <>
            <Field label="Số điện thoại người nhận" htmlFor="tk-phone" hint="Chưa có hồ sơ thì hệ thống tạo hội viên mới.">
              <Input id="tk-phone" inputMode="tel" placeholder="0903123456" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="Họ tên người nhận" htmlFor="tk-name">
              <Input id="tk-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          </>
        )}

        {type === 'branch_change' && (
          <Field label="Chi nhánh mới" htmlFor="tk-branch" full>
            <Select id="tk-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">Chọn chi nhánh</option>
              {otherBranches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
        )}

        <Field label={type === 'cancel' ? 'Lý do hủy' : 'Ghi chú'} htmlFor="tk-reason" full>
          <Textarea id="tk-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>

      {qErr && <div className="form-error" role="alert" style={{ marginTop: 12 }}>{qErr}</div>}

      {quote && (
        <div className="pending-box" role="status" style={{ marginTop: 12 }}>
          <b className={quote.fee < 0 ? 'text-bad' : ''}>{feeText(quote.fee)}</b>
          {quote.requires_approval && <> <Chip tone="warn">Cần chủ duyệt</Chip></>}
          <div className="cell-sub">
            {quote.new_end_date && <>Hết hạn mới: {fmtDate(quote.new_end_date)}. </>}
            {quote.new_sessions_total != null && <>Số buổi: {quote.new_sessions_left ?? quote.new_sessions_total}/{quote.new_sessions_total}. </>}
            {quote.note}
          </div>
        </div>
      )}

      {quote && fee > 0 && (
        <div className="form-grid" style={{ marginTop: 12 }}>
          <Field label="Thu ngay" htmlFor="tk-paid" hint="Để trống nếu chưa thu, phần thiếu thành công nợ.">
            <MoneyInput id="tk-paid" placeholder="0 ₫" value={paid} onValueChange={setPaid} />
          </Field>
          <Field label="Hình thức" htmlFor="tk-method">
            <Select id="tk-method" value={method} onChange={(e) => setMethod(e.target.value as PayMethod)}>
              {METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
            </Select>
          </Field>
        </div>
      )}

      {err && <div className="form-error" role="alert" style={{ marginTop: 12 }}>{err}</div>}
    </Modal>
  )
}
