import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtDate, fmtTime, reasonText } from '../lib/format'
import { useAuth } from '../context/AuthContext'
import { useBranch } from '../context/BranchContext'
import { usePermission } from '../context/usePermission'
import { FormDialog } from '../components/Dialogs'
import { useToast } from '../components/Toast'
import { Badge, Button, Input } from '../components/ui'
import type { CheckinItem, CheckinResult } from '../types'

const REFRESH_MS = 30000

export default function Today() {
  const { user } = useAuth()
  const { branchId } = useBranch()
  const { can } = usePermission()
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<CheckinResult | null>(null)
  const [err, setErr] = useState('')
  const [live, setLive] = useState<{ count: number; items: CheckinItem[] }>({ count: 0, items: [] })
  const [override, setOverride] = useState(false)
  const [oErr, setOErr] = useState('')
  const canRead = can('checkins.read')

  const loadLive = useCallback(async () => {
    if (!canRead) return
    try {
      const { data } = await api.get('/checkins/live', { params: { branch_id: branchId ?? undefined } })
      setLive(data.data)
    } catch {
      /* keep last */
    }
  }, [canRead, branchId])

  useEffect(() => {
    loadLive()
    const t = setInterval(loadLive, REFRESH_MS)
    return () => clearInterval(t)
  }, [loadLive])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const v = code.trim()
    if (!v) return
    setBusy(true)
    setErr('')
    try {
      const { data } = await api.post('/checkins', { member_code: v, direction: 'in' })
      setRes(data.data)
      loadLive()
    } catch (x) {
      setRes(null)
      const a = apiError(x)
      setErr(a.status === 404 ? 'Không tìm thấy hội viên với mã này' : a.message)
    } finally {
      setBusy(false)
      setCode('')
      inputRef.current?.focus()
    }
  }

  const doOverride = async (reason: string) => {
    if (!res?.member) return
    setOErr('')
    try {
      const { data } = await api.post('/checkins/override', { member_id: res.member.id, reason })
      setRes(data.data)
      setOverride(false)
      toast('Đã mở thủ công')
      loadLive()
    } catch (x) {
      setOErr(apiError(x).message)
    }
  }

  const checkout = async (id: string) => {
    try {
      await api.post(`/checkins/${id}/checkout`)
      loadLive()
    } catch (x) {
      toast(apiError(x).message, true)
    }
  }

  return (
    <>
      <div className="page-head"><h1>Hôm nay</h1></div>
      <p style={{ marginTop: 0, color: 'var(--muted)' }}>Xin chào, {user?.name}.</p>

      {can('checkins.create') && (
        <section className="card checkin">
          <h2>Check-in hội viên</h2>
          <form onSubmit={submit}>
            <Input ref={inputRef} aria-label="Mã hội viên hoặc nội dung QR" placeholder="Quét QR hoặc nhập mã hội viên, nhấn Enter" autoFocus autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} />
            <Button variant="primary" type="submit" disabled={busy}>{busy ? 'Đang kiểm tra...' : 'Check-in'}</Button>
          </form>
        </section>
      )}

      {err && <div className="form-error result-gap" role="alert">{err}</div>}

      {res && (
        <section className={`card result ${res.result === 'allowed' ? 'result-ok' : 'result-bad'}`} role="status" aria-live="assertive">
          <div className="result-title">{res.result === 'allowed' ? 'Cho vào' : 'Từ chối'}</div>
          {res.result === 'denied' && <div className="result-reason">{reasonText(res.reason)}</div>}
          {res.member && <div><b>{res.member.name}</b> - {res.member.code}</div>}
          {res.contract && (
            <div className="result-sub">
              {res.contract.code}
              {res.contract.end_date ? ` - hết hạn ${fmtDate(res.contract.end_date)}` : ''}
              {res.contract.sessions_left != null ? ` - còn ${res.contract.sessions_left} buổi` : ''}
            </div>
          )}
          {res.result === 'denied' && res.member && can('checkins.override') && (
            <div><Button variant="danger" onClick={() => setOverride(true)}>Mở thủ công</Button></div>
          )}
        </section>
      )}

      {canRead && (
        <section className="card pad live">
          <div className="live-head">
            <h2>Đang trong phòng tập</h2>
            <span className="live-count" aria-label="Số người đang tập">{live.count}</span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Hội viên</th><th>Kết quả</th><th className="num">Giờ vào</th><th /></tr></thead>
              <tbody>
                {live.items.map((i) => (
                  <tr key={i.id}>
                    <td><b>{i.member.name}</b> <span className="hint-muted">{i.member.code}</span></td>
                    <td><Badge tone="ok">Đã vào</Badge></td>
                    <td className="num">{fmtTime(i.checked_in_at ?? i.created_at)}</td>
                    <td className="actions">{can('checkins.create') && <Button small onClick={() => checkout(i.id)}>Check-out</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {live.items.length === 0 && <div className="empty">Chưa có ai đang tập</div>}
          </div>
          <span className="hint-muted">Tự làm mới mỗi 30 giây.</span>
        </section>
      )}

      {override && res?.member && (
        <FormDialog
          title={`Mở thủ công cho ${res.member.name}`}
          danger
          confirmLabel="Mở thủ công"
          error={oErr}
          onClose={() => setOverride(false)}
          onSubmit={doOverride}
        />
      )}
    </>
  )
}
