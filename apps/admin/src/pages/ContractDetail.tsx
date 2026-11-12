import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { EVENT_LABEL, METHOD_LABEL, PAY_STATUS, contractActions, daysLeftText, downloadBlob, fmtDate, fmtDateTime, fmtMoney, memberStatus } from '../lib/format'
import { usePermission } from '../context/usePermission'
import { FormDialog } from '../components/Dialogs'
import { Modal } from '../components/Modal'
import { PayModal, PendingPanel } from '../components/PayModal'
import { SignaturePad } from '../components/SignaturePad'
import { useToast } from '../components/Toast'
import { BranchTag, Button, Chip, DataTable, Field, Input, Kpi, KpiRow, PageHeader, Panel, type Column } from '../components/ui'
import { MemberAvatar } from '../components/MemberAvatar'
import type { Contract, Member, Payment } from '../types'

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
  const [mem, setMem] = useState<Member | null>(null)
  const memberId = c?.member_id
  useEffect(() => {
    if (!memberId || !can('members.read')) return
    api.get(`/members/${memberId}`).then((r) => setMem(r.data.data)).catch(() => {})
  }, [memberId, can])

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

  const st = memberStatus({ status: c.status, end_date: c.end_date })
  const payCols: Column<Payment>[] = [
    { key: 'at', header: 'Thời gian', sortValue: (p) => p.created_at, render: (p) => fmtDateTime(p.created_at) },
    { key: 'method', header: 'Hình thức', render: (p) => <>{METHOD_LABEL[p.method]}{p.ref ? <div className="cell-sub">{p.ref}</div> : null}</> },
    { key: 'status', header: 'Trạng thái', render: (p) => <><Chip tone={PAY_STATUS[p.status].tone ?? 'neutral'}>{PAY_STATUS[p.status].label}</Chip>{p.refund_requested && p.status === 'confirmed' ? <div className="cell-sub">Đã đề nghị hoàn</div> : null}</> },
    { key: 'amount', header: 'Số tiền', numeric: true, sortValue: (p) => p.amount, render: (p) => fmtMoney(p.amount) },
    {
      key: 'act', header: '', className: 'actions',
      render: (p) => (
        <>
          {p.status === 'pending' && <Button small onClick={() => setDlg({ pending: p })}>{p.method === 'vietqr' ? 'Xem QR / xác nhận' : 'Xác nhận'}</Button>}
          {p.status === 'confirmed' && can('payments.refund_request') && !p.refund_requested && <Button small onClick={() => setDlg({ refundReq: p })}>Đề nghị hoàn</Button>}
          {p.status === 'confirmed' && can('payments.refund') && <Button small variant="danger" onClick={() => setDlg({ refund: p })}>Hoàn tiền</Button>}
        </>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title={c.code}
        sub={<><Chip tone={st.tone}>{st.label}</Chip> <BranchTag branch={c.branch} /></>}
        action={<Link className="btn" to="/contracts">Danh sách hợp đồng</Link>}
      />

      <KpiRow>
        <Kpi value={fmtMoney(c.total_amount)} label="Giá trị" />
        <Kpi value={fmtMoney(c.paid_amount)} label="Đã thu" />
        <Kpi value={<span className={c.debt_amount > 0 ? 'text-bad' : ''}>{fmtMoney(c.debt_amount)}</span>} label="Còn nợ" />
        <Kpi value={c.sessions_total != null ? `${c.sessions_left ?? 0}/${c.sessions_total}` : daysLeftText(c.end_date) || '-'} label={c.sessions_total != null ? 'Số buổi còn' : 'Thời hạn còn lại'} />
      </KpiRow>

      <div className="detail-grid">
        <Panel title="Thông tin hợp đồng">
          <dl className="kv">
            <dt>Hội viên</dt><dd><span className="cell-person"><MemberAvatar member={{ id: c.member.id, name: c.member.name, has_photo: mem?.has_photo, photo_version: mem?.photo_version }} size={32} /><span>{c.member.name} ({c.member.code}), {c.member.phone}</span></span></dd>
            <dt>Dịch vụ</dt><dd>{c.package.name}</dd>
            <dt>Bắt đầu</dt><dd>{fmtDate(c.start_date)}</dd>
            <dt>Kết thúc</dt><dd>{fmtDate(c.end_date)}</dd>
            {c.frozen_until && (<><dt>Bảo lưu đến</dt><dd>{fmtDate(c.frozen_until)}</dd></>)}
            <dt>Giảm giá</dt><dd>{fmtMoney(c.discount)}</dd>
            {c.note && (<><dt>Ghi chú</dt><dd>{c.note}</dd></>)}
          </dl>
          {pendingSum > 0 && <div className="pending-box" role="status" style={{ marginTop: 12 }}><Chip tone="warn">Chờ xác nhận</Chip> {fmtMoney(pendingSum)} chưa tính vào đã thu.</div>}
          <div className="actions-area" role="group" aria-label="Thao tác hợp đồng">
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
        </Panel>

        <Panel title="Lịch sử hợp đồng" count={`${(c.events ?? []).length} sự kiện`}>
          <ol className="timeline">
            {(c.events ?? []).slice().reverse().map((e) => (
              <li key={e.id}>
                <b>{EVENT_LABEL[e.type] ?? e.type}</b>
                <div className="cell-sub">{fmtDateTime(e.created_at)}{e.by_user_name ? `, ${e.by_user_name}` : ''}</div>
                {e.reason && <div>{e.type.startsWith('payment') ? `Hình thức: ${(METHOD_LABEL as Record<string, string>)[e.reason] ?? e.reason}` : `Lý do: ${e.reason}`}</div>}
              </li>
            ))}
            {(c.events ?? []).length === 0 && <li className="hint-muted">Chưa có sự kiện</li>}
          </ol>
        </Panel>
      </div>

      <div style={{ marginTop: 16 }}>
        <Panel title="Thanh toán" count={`${pays.length} khoản`} flush>
          <DataTable columns={payCols} rows={pays} rowKey={(p) => p.id} pageSize={25} pageSizes={[25, 50]} emptyText="Chưa có khoản thanh toán" itemLabel="khoản" />
        </Panel>
      </div>

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
