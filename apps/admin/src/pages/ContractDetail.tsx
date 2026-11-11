import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { EVENT_LABEL, METHOD_LABEL, contractActions, downloadBlob, fmtDate, fmtDateTime, fmtMoney } from '../lib/format'
import { usePermission } from '../context/usePermission'
import { FormDialog } from '../components/Dialogs'
import { Modal } from '../components/Modal'
import { PayModal, PendingPanel } from '../components/PayModal'
import { SignaturePad } from '../components/SignaturePad'
import { useToast } from '../components/Toast'
import { Button, ContractBadge, Field, Input, PayBadge } from '../components/ui'
import type { Contract, Payment } from '../types'

type Dlg = null | 'sign' | 'pay' | 'activate' | 'freeze' | 'cancel' | { pending: Payment } | { refundReq: Payment } | { refund: Payment }

export default function ContractDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { can } = usePermission()
  const toast = useToast()
  const [c, setC] = useState<Contract | null>(null)
  const [error, setError] = useState('')
  const [dlg, setDlg] = useState<Dlg>(null)
  const [busy, setBusy] = useState(false)
  const [dErr, setDErr] = useState('')
  const [sig, setSig] = useState<string | null>(null)
  const [days, setDays] = useState('7')

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/contracts/${id}`)
      setC(data.data)
    } catch (e) {
      setError(apiError(e).message)
    }
  }, [id])
  useEffect(() => {
    load()
  }, [load])

  const close = () => {
    setDlg(null)
    setDErr('')
    setSig(null)
  }
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    setDErr('')
    try {
      await fn()
      toast(ok)
      close()
      await load()
    } catch (e) {
      const a = apiError(e)
      setDErr(a.code === 'INVALID_STATE' ? 'Trạng thái hợp đồng đã thay đổi, hãy tải lại trang. ' + a.message : a.message)
    } finally {
      setBusy(false)
    }
  }

  if (error) return <div className="empty" role="alert">{error} <Link to="/contracts">Về danh sách</Link></div>
  if (!c) return <div className="loading">Đang tải...</div>

  const a = contractActions(c, can)
  const post = (path: string, body?: object) => api.post(`/contracts/${c.id}/${path}`, body ?? {})
  const variant = (k: 'sign' | 'activate' | 'pay') => (a.primary === k ? 'primary' : 'secondary')

  const pdf = async () => {
    try {
      const r = await api.get(`/contracts/${c.id}/pdf`, { responseType: 'blob' })
      downloadBlob(r.data as Blob, `${c.code}.pdf`)
    } catch (e) {
      toast(apiError(e).message, true)
    }
  }

  const renew = async () => {
    setBusy(true)
    try {
      const { data } = await post('renew')
      toast('Đã tạo hợp đồng gia hạn (nháp)')
      nav(`/contracts/${data.data.id}`)
    } catch (e) {
      toast(apiError(e).message, true)
    } finally {
      setBusy(false)
    }
  }

  const pays = c.payments ?? []
  const pendingSum = pays.filter((p) => p.status === 'pending').reduce((s, p) => s + p.amount, 0)

  return (
    <>
      <div className="page-head">
        <h1>{c.code} <ContractBadge status={c.status} /></h1>
        <Link className="btn" to="/contracts">Danh sách</Link>
      </div>

      <section className="card pad stack">
        <dl className="kv kv-2">
          <dt>Hội viên</dt><dd>{c.member.name} ({c.member.code}) - {c.member.phone}</dd>
          <dt>Gói tập</dt><dd>{c.package.name}</dd>
          <dt>Bắt đầu</dt><dd>{fmtDate(c.start_date)}</dd>
          <dt>Kết thúc</dt><dd>{fmtDate(c.end_date)}</dd>
          {c.sessions_total != null && (<><dt>Số buổi còn</dt><dd className="num">{c.sessions_left}/{c.sessions_total}</dd></>)}
          {c.frozen_until && (<><dt>Bảo lưu đến</dt><dd>{fmtDate(c.frozen_until)}</dd></>)}
          <dt>Giảm giá</dt><dd className="num">{fmtMoney(c.discount)}</dd>
          <dt>Tổng tiền</dt><dd className="num"><b>{fmtMoney(c.total_amount)}</b></dd>
          <dt>Đã thu</dt><dd className="num">{fmtMoney(c.paid_amount)}</dd>
          <dt>Còn nợ</dt><dd className={`num ${c.debt_amount > 0 ? 'text-bad' : ''}`}><b>{fmtMoney(c.debt_amount)}</b></dd>
        </dl>
        {pendingSum > 0 && <div className="pending-box" role="status"><PayBadge status="pending" /> {fmtMoney(pendingSum)} đang chờ xác nhận, chưa tính vào đã thu.</div>}
        {c.note && <div className="hint-muted">Ghi chú: {c.note}</div>}

        <div className="actions-area" aria-label="Thao tác hợp đồng">
          {a.sign && <Button variant={variant('sign')} onClick={() => setDlg('sign')}>Ký hợp đồng</Button>}
          {a.activate && <Button variant={variant('activate')} onClick={() => setDlg('activate')}>Kích hoạt</Button>}
          {a.activateBlockedByDebt && <Button onClick={() => setDlg('activate')}>Kích hoạt (chưa đủ tiền)</Button>}
          {a.pay && <Button variant={variant('pay')} onClick={() => setDlg('pay')}>Thu tiền</Button>}
          {a.renew && <Button onClick={renew} disabled={busy}>Gia hạn</Button>}
          {a.freeze && <Button onClick={() => setDlg('freeze')}>Bảo lưu</Button>}
          {a.unfreeze && <Button onClick={() => run(() => post('unfreeze'), 'Đã kết thúc bảo lưu')}>Hủy bảo lưu</Button>}
          {a.pdf && <Button onClick={pdf}>Tải PDF</Button>}
          {a.cancel && <Button variant="danger" onClick={() => setDlg('cancel')}>Hủy hợp đồng</Button>}
        </div>
      </section>

      <h2 className="sec">Thanh toán</h2>
      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Thời gian</th><th>Phương thức</th><th>Trạng thái</th><th className="num">Số tiền</th><th /></tr>
            </thead>
            <tbody>
              {pays.map((p) => (
                <tr key={p.id}>
                  <td>{fmtDateTime(p.created_at)}</td>
                  <td>{METHOD_LABEL[p.method]}{p.ref ? ` (${p.ref})` : ''}</td>
                  <td><PayBadge status={p.status} />{p.refund_requested && p.status === 'confirmed' ? ' Đã đề nghị hoàn' : ''}</td>
                  <td className="num">{fmtMoney(p.amount)}</td>
                  <td className="actions">
                    {p.status === 'pending' && <Button small onClick={() => setDlg({ pending: p })}>{p.method === 'vietqr' ? 'Xem QR / xác nhận' : 'Xác nhận'}</Button>}
                    {p.status === 'confirmed' && can('payments.refund_request') && !p.refund_requested && <Button small onClick={() => setDlg({ refundReq: p })}>Đề nghị hoàn</Button>}
                    {p.status === 'confirmed' && can('payments.refund') && <Button small variant="danger" onClick={() => setDlg({ refund: p })}>Hoàn tiền</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pays.length === 0 && <div className="empty">Chưa có khoản thanh toán</div>}
        </div>
      </div>

      <h2 className="sec">Lịch sử hợp đồng</h2>
      <ol className="timeline card pad">
        {(c.events ?? []).slice().reverse().map((e) => (
          <li key={e.id}>
            <b>{EVENT_LABEL[e.type] ?? e.type}</b> <span className="hint-muted">{fmtDateTime(e.created_at)}{e.by_user ? ` - ${e.by_user}` : ''}</span>
            {e.reason && <div>Lý do: {e.reason}</div>}
          </li>
        ))}
        {(c.events ?? []).length === 0 && <li className="hint-muted">Chưa có sự kiện</li>}
      </ol>

      {dlg === 'sign' && (
        <Modal
          title="Ký hợp đồng"
          onClose={close}
          footer={
            <>
              <Button onClick={close}>Hủy</Button>
              <Button variant="primary" disabled={!sig || busy} onClick={() => run(() => post('sign', { signature: sig }), 'Đã ký hợp đồng')}>{busy ? 'Đang lưu...' : 'Xác nhận chữ ký'}</Button>
            </>
          }
        >
          <div className="stack">
            {dErr && <div className="form-error" role="alert">{dErr}</div>}
            <SignaturePad onChange={setSig} />
          </div>
        </Modal>
      )}

      {dlg === 'pay' && <PayModal contract={c} onClose={() => { close(); load() }} onChanged={load} />}

      {dlg === 'activate' && (
        <Modal
          title="Kích hoạt hợp đồng"
          onClose={close}
          footer={
            <>
              <Button onClick={close}>Đóng</Button>
              {a.activate && <Button variant="primary" disabled={busy} onClick={() => run(() => post('activate', {}), 'Đã kích hoạt')}>Kích hoạt</Button>}
              {a.activateBlockedByDebt && a.activateWithDebt && (
                <Button variant="danger" disabled={busy} onClick={() => run(() => post('activate', { allow_debt: true }), 'Đã kích hoạt có công nợ')}>Kích hoạt có công nợ</Button>
              )}
            </>
          }
        >
          <div className="stack">
            {dErr && <div className="form-error" role="alert">{dErr}</div>}
            {a.activateBlockedByDebt ? (
              <>
                <div className="form-error">Chưa thể kích hoạt: hợp đồng còn nợ {fmtMoney(c.debt_amount)}. Hãy thu đủ tiền trước.</div>
                {a.activateWithDebt ? <p>Bạn có quyền duyệt, có thể kích hoạt kèm công nợ. Việc này được ghi vào lịch sử.</p> : <p className="hint-muted">Cần người có quyền duyệt hợp đồng để kích hoạt khi còn nợ.</p>}
              </>
            ) : (
              <p>Hợp đồng đã thanh toán đủ. Kích hoạt để hội viên bắt đầu sử dụng.</p>
            )}
          </div>
        </Modal>
      )}

      {dlg === 'freeze' && (
        <FormDialog
          title="Bảo lưu hợp đồng"
          confirmLabel="Bảo lưu"
          error={dErr}
          busy={busy}
          onClose={close}
          extra={
            <Field label="Số ngày bảo lưu" htmlFor="fz-days">
              <Input id="fz-days" type="number" min={1} required value={days} onChange={(e) => setDays(e.target.value)} />
            </Field>
          }
          onSubmit={(reason) => run(() => post('freeze', { days: Number(days), reason }), 'Đã bảo lưu')}
        />
      )}

      {dlg === 'cancel' && (
        <FormDialog
          title="Hủy hợp đồng"
          danger
          confirmLabel="Xác nhận hủy hợp đồng"
          error={dErr}
          busy={busy}
          onClose={close}
          intro={<p style={{ margin: 0 }}>Bạn sắp hủy hợp đồng <b>{c.code}</b>. Không thể hoàn tác.</p>}
          onSubmit={(reason) => run(() => post('cancel', { reason }), 'Đã hủy hợp đồng')}
        />
      )}

      {dlg && typeof dlg === 'object' && 'pending' in dlg && (
        <Modal title="Giao dịch chờ xác nhận" onClose={() => { close(); load() }} footer={<Button onClick={() => { close(); load() }}>Đóng</Button>}>
          <PendingPanel payment={dlg.pending} onConfirmed={load} />
        </Modal>
      )}

      {dlg && typeof dlg === 'object' && 'refundReq' in dlg && (
        <FormDialog
          title="Đề nghị hoàn tiền"
          confirmLabel="Gửi đề nghị"
          error={dErr}
          busy={busy}
          onClose={close}
          onSubmit={(reason) => run(() => api.post(`/payments/${dlg.refundReq.id}/refund-request`, { reason }), 'Đã gửi đề nghị hoàn tiền')}
        />
      )}

      {dlg && typeof dlg === 'object' && 'refund' in dlg && (
        <FormDialog
          title={`Hoàn tiền ${fmtMoney(dlg.refund.amount)}`}
          danger
          confirmLabel="Hoàn tiền"
          error={dErr}
          busy={busy}
          onClose={close}
          onSubmit={(reason) => run(() => api.post(`/payments/${dlg.refund.id}/refund`, { reason }), 'Đã hoàn tiền')}
        />
      )}
    </>
  )
}
