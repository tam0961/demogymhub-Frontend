import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtDateTime } from '../lib/format'
import { setAccessToken } from '../lib/session'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { Avatar, Button, Chip, DataTable, Field, Input, PageHeader, Panel, type Column } from '../components/ui'
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

  const cols: Column<SessionRow>[] = [
    { key: 'dev', header: 'Thiết bị', render: (s) => <>{s.device ?? s.user_agent ?? 'Không rõ'} {s.current && <Chip tone="ok">Phiên này</Chip>}</> },
    { key: 'ip', header: 'IP', render: (s) => s.ip ?? '-' },
    { key: 'c', header: 'Tạo lúc', sortValue: (s) => s.created_at, render: (s) => fmtDateTime(s.created_at) },
    { key: 'l', header: 'Dùng gần nhất', sortValue: (s) => s.last_used_at, render: (s) => fmtDateTime(s.last_used_at) },
    { key: 'a', header: '', className: 'actions', render: (s) => !s.current && <Button small variant="danger" onClick={() => revoke(s.id)}>Thu hồi</Button> },
  ]

  return (
    <>
      <PageHeader title="Tài khoản của tôi" />
      <div className="grid-2">
        <Panel title="Hồ sơ">
          <div className="cell-person" style={{ marginBottom: 12 }}>
            <Avatar name={user?.name ?? '?'} size={48} />
            <div><div className="cell-main">{user?.name}</div><div className="cell-sub">{user?.email}</div></div>
          </div>
          <dl className="kv">
            <dt>Vai trò</dt><dd className="chips">{user?.roles.map((r) => <Chip key={r}>{r}</Chip>)}</dd>
            <dt>Chi nhánh</dt><dd>{user?.branches.map((b) => b.name).join(', ') || '-'}</dd>
          </dl>
        </Panel>
        <Panel title="Đổi mật khẩu">
          <form className="stack" onSubmit={change}>
            {err && <div className="form-error" role="alert">{err}</div>}
            <Field label="Mật khẩu hiện tại" htmlFor="pw-cur"><Input id="pw-cur" type="password" autoComplete="current-password" required value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
            <Field label="Mật khẩu mới" htmlFor="pw-new" hint="Tối thiểu 8 ký tự"><Input id="pw-new" type="password" autoComplete="new-password" required value={nw} onChange={(e) => setNw(e.target.value)} /></Field>
            <Field label="Nhập lại mật khẩu mới" htmlFor="pw-new2"><Input id="pw-new2" type="password" autoComplete="new-password" required value={nw2} onChange={(e) => setNw2(e.target.value)} /></Field>
            <div><Button variant="primary" type="submit" disabled={busy}>{busy ? 'Đang lưu...' : 'Đổi mật khẩu'}</Button></div>
          </form>
        </Panel>
      </div>
      <div style={{ marginTop: 16 }}>
        <Panel title="Phiên đăng nhập" count={`${sessions.length} phiên`} flush>
          {sErr && <div className="form-error" role="alert" style={{ margin: 12 }}>{sErr}</div>}
          <DataTable columns={cols} rows={sessions} rowKey={(s) => s.id} pageSize={25} pageSizes={[25, 50]} emptyText="Không có phiên" itemLabel="phiên" />
        </Panel>
      </div>
    </>
  )
}
