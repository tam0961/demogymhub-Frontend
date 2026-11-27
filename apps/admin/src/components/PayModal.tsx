import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { METHODS, METHOD_LABEL, fmtMoney, parseMoney } from '../lib/format'
import { usePermission } from '../context/usePermission'
import { Modal } from './Modal'
import { useToast } from './Toast'
import { Button, Field, Input, MoneyInput, PayBadge, Select } from './ui'
import { paymentCode } from '../lib/contracts'
import { BANKS, bankReady, loadBank, transferContent, vietQrUrl } from '../lib/bank'
import { createIpadSession, getBranchIpad, setIpadStage } from '../lib/ipad'
import { IpadPairBox } from './IpadPairBox'
import type { Contract, PayMethod, Payment } from '../types'

interface QR { transfer_content: string; bank: string; amount: number; qr_url: string }

interface Who { name: string; code?: string; pkg?: string }

export function PendingPanel({ payment, onConfirmed, who, branchId }: { payment: Payment; onConfirmed: (p: Payment) => void; who?: Who; branchId?: string }) {
  const { can } = usePermission()
  const toast = useToast()
  const [qr, setQr] = useState<QR | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(payment.status)
  const [ipadToken, setIpadToken] = useState('')
  const [ipadPaired, setIpadPaired] = useState(false)

  const person: Who | null = who ?? (payment.contract?.member ? { name: payment.contract.member.name, code: payment.contract.member.code, pkg: payment.contract.code } : null)

  const bankCfg = loadBank()
  const ownQr = !!who?.pkg && bankReady(bankCfg)
  const view = qr
    ? ownQr
      ? { bank: `${BANKS.find((b) => b.code === bankCfg.bank)?.name ?? bankCfg.bank} - ${bankCfg.account}`, bankName: BANKS.find((b) => b.code === bankCfg.bank)?.name ?? bankCfg.bank, account: bankCfg.account, holder: bankCfg.holder, amount: qr.amount, content: transferContent(who!.name, who!.pkg!), qrUrl: vietQrUrl(bankCfg, qr.amount, transferContent(who!.name, who!.pkg!)) }
      : { bank: qr.bank, bankName: qr.bank.split(' - ')[0] ?? qr.bank, account: qr.bank.split(' - ')[1] ?? '', holder: qr.bank.split(' - ')[2] ?? '', amount: qr.amount, content: qr.transfer_content, qrUrl: qr.qr_url }
    : null

  useEffect(() => {
    if (payment.method !== 'vietqr') return
    api.get(`/payments/${payment.id}/qr`).then((r) => setQr(r.data.data)).catch((e) => setErr(apiError(e).message))
  }, [payment.id, payment.method])

  useEffect(() => {
    if (!branchId || ipadToken) return
    getBranchIpad(branchId).catch(() => null).then((t) => {
      if (t) { setIpadPaired(true); setIpadToken(t); return }
      return createIpadSession().then(setIpadToken).catch(() => setIpadToken(''))
    })
  }, [branchId, ipadToken])

  useEffect(() => {
    if (!ipadToken || !view || status !== 'pending') return
    setIpadStage(ipadToken, 'pay', { amount: view.amount, content: view.content, bankName: view.bankName, account: view.account, holder: view.holder, qrUrl: view.qrUrl }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ipadToken, qr, status])

  useEffect(() => {
    if (!ipadToken || !ipadPaired) return
    return () => { setIpadStage(ipadToken, 'idle', null).catch(() => {}) }
  }, [ipadToken, ipadPaired])

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
      {person && (
        <div className="pm-who">
          <b>{person.name}</b> {person.code && <span className="cell-sub">{person.code}</span>}
          {person.pkg && <div className="cell-sub">{person.pkg}</div>}
        </div>
      )}
      <div className={status === 'pending' ? 'pending-box pending-line' : 'pending-box pending-box-ok pending-line'} role="status">
        <PayBadge status={status} />
        <b>{status === 'pending' ? `Chờ xác nhận ${fmtMoney(payment.amount)}. Khoản này chưa được tính là đã thu.` : `Đã thu ${fmtMoney(payment.amount)}.`}</b>
      </div>
      <div className="cell-sub">Phiếu thu: <b>{paymentCode(payment)}</b></div>
      {err && <div className="form-error" role="alert">{err}</div>}
      {view && status === 'pending' && (
        <div className="pm-qr">
          <img src={view.qrUrl} width={340} height={340} alt="Mã VietQR thanh toán" />
          <div className="pm-qr-info">
            <div><span className="pm-k">Ngân hàng</span><span className="pm-v">{view.bank}</span></div>
            <div><span className="pm-k">Số tiền</span><b className="pm-big">{fmtMoney(view.amount)}</b></div>
            <div><span className="pm-k">Nội dung CK</span><b className="pm-big pm-content">{view.content}</b></div>
          </div>
        </div>
      )}
      {ipadToken && status === 'pending' && (
        ipadPaired
          ? <div className="ipad-box"><div><div className="cell-main">Đã gửi mã QR lên iPad quầy lễ tân</div><div className="hint-muted">Khách quét mã trên iPad. Khi tiền về tài khoản, bấm Xác nhận đã nhận tiền.</div></div></div>
          : branchId ? <IpadPairBox branchId={branchId} token={null} onChanged={() => { setIpadPaired(false); setIpadToken('') }} /> : null
      )}
      {status === 'pending' && can('payments.confirm') && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}><Button variant="primary" onClick={confirm} disabled={busy}>{busy ? 'Đang xác nhận...' : 'Xác nhận đã nhận tiền'}</Button></div>
      )}
      {status === 'pending' && !can('payments.confirm') && <span className="hint-muted">Cần người có quyền xác nhận thanh toán để chốt khoản này.</span>}
    </div>
  )
}

export function PayModal({ contract, onClose, onChanged }: { contract: Contract; onClose: () => void; onChanged: () => void }) {
  const [method, setMethod] = useState<PayMethod>('cash')
  const [amount, setAmount] = useState(String(contract.debt_amount))
  const [ref, setRef] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<Payment | null>(null)
  const bank = loadBank()
  const left = Math.max(0, contract.debt_amount - parseMoney(amount))
  const showQr = method === 'transfer' || method === 'vietqr'
  const content = transferContent(contract.member.name, contract.package.name)

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
      setErr(a.code === 'DUPLICATE_PAYMENT' ? 'Mã giao dịch đã được dùng cho khoản khác.' : a.message)
    } finally {
      setBusy(false)
    }
  }

  if (created) {
    return (
      <Modal title="Kết quả thu tiền" size="large" onClose={onClose} footer={<Button onClick={onClose}>Đóng</Button>}>
        <PendingPanel payment={created} onConfirmed={() => onChanged()} branchId={contract.branch_id} who={{ name: contract.member.name, code: contract.member.code, pkg: contract.package.name }} />
      </Modal>
    )
  }

  return (
    <Modal
      title={`Thu tiền - ${contract.code}`}
      size="large"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Hủy</Button>
          <Button variant="primary" type="submit" form="pay-form" disabled={busy || parseMoney(amount) <= 0}>{busy ? 'Đang lưu...' : 'Ghi nhận thu tiền'}</Button>
        </>
      }
    >
      <form id="pay-form" className="stack" onSubmit={submit}>
        <div className="pm-who">
          <b>{contract.member.name}</b> <span className="cell-sub">{contract.member.code}</span>
          <div className="cell-sub">{contract.package.name}</div>
        </div>
        {err && <div className="form-error" role="alert">{err}</div>}
        <div className="cn-money pm-money">
          <div className="cn-money-item"><span className="cn-money-label">Còn nợ</span><b className="cn-money-val bad">{fmtMoney(contract.debt_amount)}</b></div>
          <div className="cn-money-item cn-money-in">
            <label className="cn-money-label" htmlFor="pm-amount">Thu lần này</label>
            <MoneyInput id="pm-amount" required value={amount} onValueChange={setAmount} />
          </div>
          <div className="cn-money-item"><span className="cn-money-label">Còn lại sau khi thu</span><b className={`cn-money-val ${left > 0 ? 'bad' : 'ok'}`}>{left > 0 ? fmtMoney(left) : 'Đã thu đủ'}</b></div>
        </div>
        <Field label="Phương thức" htmlFor="pm-method">
          <Select id="pm-method" value={method} onChange={(e) => setMethod(e.target.value as PayMethod)}>
            {METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
          </Select>
        </Field>
        {showQr && (
          bankReady(bank) ? (
            <div className="qr-box">
              <img src={vietQrUrl(bank, parseMoney(amount), content)} width={220} height={220} alt="Mã QR chuyển khoản" />
              <dl className="kv">
                <dt>Ngân hàng</dt><dd>{BANKS.find((x) => x.code === bank.bank)?.name ?? bank.bank}</dd>
                <dt>Số tài khoản</dt><dd><b>{bank.account}</b></dd>
                <dt>Chủ tài khoản</dt><dd>{bank.holder}</dd>
                <dt>Số tiền</dt><dd><b>{fmtMoney(parseMoney(amount))}</b></dd>
                <dt>Nội dung</dt><dd><b>{content}</b></dd>
              </dl>
            </div>
          ) : <div className="form-error" role="alert">Chưa cài tài khoản ngân hàng của công ty. Vào Thiết lập, mục Tài khoản ngân hàng để nhập.</div>
        )}
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
