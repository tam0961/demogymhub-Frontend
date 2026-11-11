import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { METHODS, METHOD_LABEL, fmtMoney, parseMoney } from '../lib/format'
import { useShift } from '../context/ShiftContext'
import { usePermission } from '../context/usePermission'
import { Modal } from './Modal'
import { useToast } from './Toast'
import { Button, Field, Input, PayBadge, Select } from './ui'
import type { Contract, PayMethod, Payment } from '../types'

interface QR { transfer_content: string; bank: string; amount: number; qr_url: string }

export function PendingPanel({ payment, onConfirmed }: { payment: Payment; onConfirmed: (p: Payment) => void }) {
  const { can } = usePermission()
  const toast = useToast()
  const [qr, setQr] = useState<QR | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(payment.status)

  useEffect(() => {
    if (payment.method !== 'vietqr') return
    api.get(`/payments/${payment.id}/qr`).then((r) => setQr(r.data.data)).catch((e) => setErr(apiError(e).message))
  }, [payment.id, payment.method])

  const confirm = async () => {
    setBusy(true)
    setErr('')
    try {
      const { data } = await api.post(`/payments/${payment.id}/confirm`)
      setStatus('confirmed')
      toast('Đã xác nhận thu tiền')
      onConfirmed(data.data)
    } catch (e) {
      setErr(apiError(e).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <div className={status === 'pending' ? 'pending-box' : 'pending-box pending-box-ok'} role="status">
        <PayBadge status={status} />
        {status === 'pending' ? (
          <span>Chờ xác nhận {fmtMoney(payment.amount)}. Khoản này chưa được tính là đã thu.</span>
        ) : (
          <span>Đã thu {fmtMoney(payment.amount)}.</span>
        )}
      </div>
      {err && <div className="form-error" role="alert">{err}</div>}
      {qr && status === 'pending' && (
        <div className="qr-box">
          <img src={qr.qr_url} width={180} height={180} alt="Mã VietQR thanh toán" />
          <dl className="kv">
            <dt>Ngân hàng</dt><dd>{qr.bank}</dd>
            <dt>Số tiền</dt><dd className="num">{fmtMoney(qr.amount)}</dd>
            <dt>Nội dung CK</dt><dd><b>{qr.transfer_content}</b></dd>
          </dl>
        </div>
      )}
      {status === 'pending' && can('payments.confirm') && (
        <div><Button variant="primary" onClick={confirm} disabled={busy}>{busy ? 'Đang xác nhận...' : 'Xác nhận đã nhận tiền'}</Button></div>
      )}
      {status === 'pending' && !can('payments.confirm') && <span className="hint-muted">Cần người có quyền xác nhận thanh toán để chốt khoản này.</span>}
    </div>
  )
}

export function PayModal({ contract, onClose, onChanged }: { contract: Contract; onClose: () => void; onChanged: () => void }) {
  const { can } = usePermission()
  const { shift, loaded, openModal } = useShift()
  const [method, setMethod] = useState<PayMethod>('cash')
  const [amount, setAmount] = useState(String(contract.debt_amount))
  const [ref, setRef] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<Payment | null>(null)
  const needShift = method === 'cash' && loaded && !shift

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      const { data } = await api.post('/payments', {
        contract_id: contract.id, method, amount: parseMoney(amount), ref: ref.trim() || undefined, note: note.trim() || undefined,
      })
      setCreated(data.data)
      onChanged()
    } catch (x) {
      const a = apiError(x)
      setErr(a.code === 'NO_OPEN_SHIFT' ? 'Chưa mở ca thu ngân. Hãy mở ca trước khi thu tiền mặt.' : a.code === 'DUPLICATE_PAYMENT' ? 'Mã giao dịch đã được dùng cho khoản khác.' : a.message)
    } finally {
      setBusy(false)
    }
  }

  if (created) {
    return (
      <Modal title="Kết quả thu tiền" onClose={onClose} footer={<Button onClick={onClose}>Đóng</Button>}>
        <PendingPanel payment={created} onConfirmed={() => onChanged()} />
      </Modal>
    )
  }

  return (
    <Modal
      title={`Thu tiền - ${contract.code}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Hủy</Button>
          <Button variant="primary" type="submit" form="pay-form" disabled={busy || needShift || parseMoney(amount) <= 0}>{busy ? 'Đang lưu...' : 'Ghi nhận thu tiền'}</Button>
        </>
      }
    >
      <form id="pay-form" className="stack" onSubmit={submit}>
        <div>Còn nợ: <b className="num">{fmtMoney(contract.debt_amount)}</b></div>
        {err && <div className="form-error" role="alert">{err}</div>}
        {needShift && (
          <div className="form-error" role="alert">
            Chưa có ca đang mở nên chưa thu được tiền mặt.{' '}
            {can('shifts.open') ? <Button small onClick={openModal}>Mở ca ngay</Button> : 'Nhờ người có quyền mở ca.'}
          </div>
        )}
        <Field label="Phương thức" htmlFor="pm-method">
          <Select id="pm-method" value={method} onChange={(e) => setMethod(e.target.value as PayMethod)}>
            {METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
          </Select>
        </Field>
        <Field label="Số tiền (đ)" htmlFor="pm-amount">
          <Input id="pm-amount" inputMode="numeric" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <span className="hint-muted">Sẽ ghi: {fmtMoney(parseMoney(amount))}</span>
        {method !== 'cash' && method !== 'vietqr' && (
          <Field label="Mã giao dịch" htmlFor="pm-ref">
            <Input id="pm-ref" value={ref} onChange={(e) => setRef(e.target.value)} />
          </Field>
        )}
        <Field label="Ghi chú" htmlFor="pm-note">
          <Input id="pm-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </form>
    </Modal>
  )
}
