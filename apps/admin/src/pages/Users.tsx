import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { diffRoles, needsConfirm } from '../lib/format'
import { useAuth } from '../context/AuthContext'
import { usePermission } from '../context/usePermission'
import { Modal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { Badge, Button, Field, Select } from '../components/ui'
import type { AdminUser, ListResp, RoleRow } from '../types'

export default function Users() {
  const { can } = usePermission()
  const [rows, setRows] = useState<AdminUser[]>([])
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<AdminUser | null>(null)

  const load = useCallback(async () => {
    try {
      const [u, r] = await Promise.all([api.get<ListResp<AdminUser>>('/users', { params: { limit: 100 } }), api.get('/roles')])
      setRows(u.data.data)
      setRoles(r.data.data)
      setError('')
    } catch (e) {
      setError(apiError(e).message)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    load()
  }, [load])

  return (
    <>
      <div className="page-head"><h1>Người dùng</h1></div>
      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Họ tên</th><th>Email</th><th>Vai trò</th><th /></tr></thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td><b>{u.name}</b></td>
                  <td>{u.email}</td>
                  <td>{u.roles.map((r) => <Badge key={r.id}>{r.role}</Badge>)}</td>
                  <td className="actions">{can('roles.assign') && <Button small onClick={() => setEditing(u)}>Sửa vai trò</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && <div className="empty">Đang tải...</div>}
          {!loading && error && <div className="empty" role="alert">{error}</div>}
        </div>
      </div>
      {editing && <RoleEditor user={editing} roles={roles} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </>
  )
}

function RoleEditor({ user, roles, onClose, onSaved }: { user: AdminUser; roles: RoleRow[]; onClose: () => void; onSaved: () => void }) {
  const { user: me } = useAuth()
  const toast = useToast()
  const before = user.roles.map((r) => r.role)
  const [after, setAfter] = useState<string[]>(before)
  const [branch, setBranch] = useState(me?.branches[0]?.id ?? '')
  const [confirming, setConfirming] = useState(false)
  const [sure, setSure] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const diff = diffRoles(before, after)
  const changed = diff.add.length + diff.remove.length > 0
  const risky = needsConfirm(diff)

  const toggle = (r: string) => setAfter((x) => (x.includes(r) ? x.filter((y) => y !== r) : [...x, r]))

  const apply = async () => {
    setBusy(true)
    setErr('')
    try {
      for (const r of diff.add) await api.post(`/users/${user.id}/roles`, { role: r, branch_id: branch || null })
      for (const r of diff.remove) {
        const ref = user.roles.find((x) => x.role === r)
        if (ref) await api.delete(`/users/${user.id}/roles/${ref.id}`)
      }
      toast('Đã cập nhật vai trò')
      onSaved()
    } catch (e) {
      setErr(apiError(e).message)
    } finally {
      setBusy(false)
    }
  }

  const next = () => (risky ? setConfirming(true) : apply())

  return (
    <Modal
      title={`Vai trò của ${user.name}`}
      onClose={onClose}
      footer={
        confirming ? (
          <>
            <Button onClick={() => setConfirming(false)}>Quay lại</Button>
            <Button variant="danger" disabled={!sure || busy} onClick={apply}>{busy ? 'Đang lưu...' : 'Xác nhận thay đổi'}</Button>
          </>
        ) : (
          <>
            <Button onClick={onClose}>Hủy</Button>
            <Button variant="primary" disabled={!changed || busy} onClick={next}>Lưu</Button>
          </>
        )
      }
    >
      <div className="stack">
        {err && <div className="form-error" role="alert">{err}</div>}
        {!confirming && (
          <>
            {roles.map((r) => (
              <label key={r.id} className="check">
                <input type="checkbox" checked={after.includes(r.name)} onChange={() => toggle(r.name)} />
                {r.name}{r.description ? ` - ${r.description}` : ''}
              </label>
            ))}
            {diff.add.length > 0 && (
              <Field label="Chi nhánh áp dụng cho vai trò thêm" htmlFor="ru-branch">
                <Select id="ru-branch" value={branch} onChange={(e) => setBranch(e.target.value)}>
                  {me?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </Field>
            )}
          </>
        )}
        {changed && (
          <div className="diff" aria-label="Thay đổi">
            {diff.add.map((r) => <div key={`+${r}`} className="diff-add">+{r}</div>)}
            {diff.remove.map((r) => <div key={`-${r}`} className="diff-del">-{r}</div>)}
          </div>
        )}
        {confirming && (
          <>
            <div className="form-error">Thay đổi liên quan đến vai trò quản trị. Hãy kiểm tra kỹ.</div>
            <label className="check"><input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} />Tôi hiểu và xác nhận thay đổi này</label>
          </>
        )}
      </div>
    </Modal>
  )
}
