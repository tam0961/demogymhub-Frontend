import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { useAuth } from '../context/AuthContext'
import { RequirePermission } from '../context/usePermission'
import { Modal } from '../components/Modal'
import { Button, Chip, DataTable, Field, Input, PageHeader, Select, useToast, type Column } from '../components/ui'
import type { AdminUser, ListResp } from '../types'

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Super Admin', owner: 'Chủ phòng gym', branch_manager: 'Quản lý', receptionist: 'Lễ tân',
  sales: 'Sales', trainer: 'PT', accountant: 'Kế toán', member: 'Hội viên',
}
const CREATABLE = ['trainer', 'receptionist', 'sales', 'accountant', 'branch_manager']
const GLOBAL_ROLES = ['accountant']

export default function Staff() {
  const { user } = useAuth()
  const [rows, setRows] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const toast = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get<ListResp<AdminUser>>('/users', { params: { limit: 100 } })
      setRows(data.data.filter((u) => u.roles.some((r) => r.role !== 'member')))
    } catch (e) {
      setError(apiError(e).message)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const branchName = useMemo(() => new Map((user?.branches ?? []).map((b) => [b.id, b.name])), [user])
  const columns: Column<AdminUser>[] = [
    { key: 'name', header: 'Nhân viên', sortValue: (u) => u.name, render: (u) => <span className="cell-main">{u.name}</span> },
    { key: 'email', header: 'Tên đăng nhập', sortValue: (u) => u.email, render: (u) => u.email },
    {
      key: 'roles',
      header: 'Vai trò',
      render: (u) => (
        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {u.roles.filter((r) => r.role !== 'member').map((r, i) => (
            <Chip key={i}>{ROLE_LABEL[r.role] ?? r.role}{r.branch_id ? ` - ${(branchName.get(r.branch_id) ?? '').replace(/^Chi nhánh\s+/i, '')}` : ''}</Chip>
          ))}
        </span>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Nhân viên"
        sub="Tài khoản nhân viên và vai trò. Phân quyền chi tiết ở mục Cài đặt, Tài khoản và phân quyền."
        action={<RequirePermission permission="roles.assign"><Button variant="primary" onClick={() => setAdding(true)}>Thêm nhân viên</Button></RequirePermission>}
      />
      <div className="card">
        <DataTable columns={columns} rows={rows} rowKey={(u) => u.id} loading={loading} error={error} emptyText="Chưa có nhân viên" itemLabel="nhân viên" />
      </div>
      {adding && <AddModal onClose={() => setAdding(false)} onSaved={(msg) => { setAdding(false); toast(msg); load() }} />}
    </>
  )
}

function AddModal({ onClose, onSaved }: { onClose: () => void; onSaved: (msg: string) => void }) {
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('trainer')
  const [branch, setBranch] = useState(user?.branches.length === 1 ? user.branches[0].id : '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ email: string; password: string } | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { data } = await api.post<{ data: { email: string; password: string | null } }>('/users', {
        name,
        email,
        role,
        branch_id: GLOBAL_ROLES.includes(role) ? null : branch || null,
      })
      if (data.data.password) setDone({ email: data.data.email, password: data.data.password })
      else onSaved('Đã thêm nhân viên')
    } catch (err) {
      setError(apiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <Modal title="Đã tạo tài khoản" onClose={() => onSaved('Đã thêm nhân viên')} footer={<Button variant="primary" onClick={() => onSaved('Đã thêm nhân viên')}>Xong</Button>}>
        <p>Gửi thông tin này cho nhân viên. Mật khẩu chỉ hiện một lần.</p>
        <dl className="kv"><dt>Tên đăng nhập</dt><dd>{done.email}</dd><dt>Mật khẩu tạm</dt><dd><b>{done.password}</b></dd></dl>
      </Modal>
    )
  }

  return (
    <Modal title="Thêm nhân viên" onClose={onClose} footer={<><Button onClick={onClose}>Hủy</Button><Button variant="primary" type="submit" form="staff-form" disabled={busy}>{busy ? 'Đang lưu...' : 'Thêm'}</Button></>}>
      <form id="staff-form" className="form-grid" onSubmit={submit}>
        {error && <div className="form-error full" role="alert">{error}</div>}
        <Field label="Họ tên" htmlFor="s-name" full><Input id="s-name" required value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Tên đăng nhập" htmlFor="s-email" full><Input id="s-email" type="text" autoCapitalize="none" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Vai trò" htmlFor="s-role">
          <Select id="s-role" value={role} onChange={(e) => setRole(e.target.value)}>
            {CREATABLE.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </Select>
        </Field>
        {!GLOBAL_ROLES.includes(role) && (
          <Field label="Chi nhánh" htmlFor="s-branch">
            <Select id="s-branch" required value={branch} onChange={(e) => setBranch(e.target.value)}>
              <option value="" disabled>Chọn chi nhánh</option>
              {user?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
        )}
      </form>
    </Modal>
  )
}
