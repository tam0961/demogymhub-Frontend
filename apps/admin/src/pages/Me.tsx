import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtDateTime } from '../lib/format'
import { setAccessToken } from '../lib/session'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { Badge, Button, Field, Input } from '../components/ui'
import type { SessionRow } from '../types'

export default function Me() {
  const { user } = useAuth()
  const toast = useToast()
  const [cur, setCur] = useState('')
  const [nw, setNw] = useState('')
  const [nw2, setNw2] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [sErr, setSErr] = useState('')

  const loadSessions = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/sessions')
      setSessions(data.data)
      setSErr('')
    } catch (e) {
      setSErr(apiError(e).message)
    }
  }, [])
  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  const change = async (e: FormEvent) => {
    e.preventDefault()
    setErr('')
    if (nw.length < 8) return setErr('Mật khẩu mới tối thiểu 8 ký tự')
    if (nw !== nw2) return setErr('Mật khẩu nhập lại không khớp')
    setBusy(true)
    try {
      const { data } = await api.post('/auth/change-password', { current: cur, new: nw })
      if (data.data?.access_token) setAccessToken(data.data.access_token)
      toast('Đã đổi mật khẩu')
      setCur('')
      setNw('')
      setNw2('')
      loadSessions()
    } catch (x) {
      setErr(apiError(x).message)
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (id: string) => {
    try {
      await api.delete(`/auth/sessions/${id}`)
      toast('Đã thu hồi phiên')
      loadSessions()
    } catch (x) {
      toast(apiError(x).message, true)
    }
  }

  return (
    <>
      <div className="page-head"><h1>Tài khoản của tôi</h1></div>
      <section className="card pad stack">
        <dl className="kv">
          <dt>Họ tên</dt><dd>{user?.name}</dd>
          <dt>Email</dt><dd>{user?.email}</dd>
          <dt>Vai trò</dt><dd>{user?.roles.map((r) => <Badge key={r}>{r}</Badge>)}</dd>
        </dl>
      </section>

      <h2 className="sec">Đổi mật khẩu</h2>
      <form className="card pad stack narrow" onSubmit={change}>
        {err && <div className="form-error" role="alert">{err}</div>}
        <Field label="Mật khẩu hiện tại" htmlFor="pw-cur"><Input id="pw-cur" type="password" autoComplete="current-password" required value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
        <Field label="Mật khẩu mới" htmlFor="pw-new"><Input id="pw-new" type="password" autoComplete="new-password" required value={nw} onChange={(e) => setNw(e.target.value)} /></Field>
        <Field label="Nhập lại mật khẩu mới" htmlFor="pw-new2"><Input id="pw-new2" type="password" autoComplete="new-password" required value={nw2} onChange={(e) => setNw2(e.target.value)} /></Field>
        <div><Button variant="primary" type="submit" disabled={busy}>{busy ? 'Đang lưu...' : 'Đổi mật khẩu'}</Button></div>
      </form>

      <h2 className="sec">Phiên đăng nhập</h2>
      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Thiết bị</th><th>IP</th><th>Tạo lúc</th><th>Dùng gần nhất</th><th /></tr></thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td>{s.device ?? s.user_agent ?? 'Không rõ'} {s.current && <Badge tone="ok">Phiên này</Badge>}</td>
                  <td>{s.ip ?? '-'}</td>
                  <td>{fmtDateTime(s.created_at)}</td>
                  <td>{fmtDateTime(s.last_used_at)}</td>
                  <td className="actions">{!s.current && <Button small variant="danger" onClick={() => revoke(s.id)}>Thu hồi</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sErr && <div className="empty" role="alert">{sErr}</div>}
        </div>
      </div>
    </>
  )
}
