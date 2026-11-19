import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { useAuth } from '../context/AuthContext'
import { usePermission } from '../context/usePermission'
import { BranchTag, Button, Chip, PageHeader, Panel, useToast } from '../components/ui'
import type { AdminUser, ListResp, RoleRow } from '../types'

const keyOf = (p: string | { key: string }) => (typeof p === 'string' ? p : p.key)

export function groupPermissions(rows: RoleRow[]): { group: string; keys: string[] }[] {
  const all = [...new Set(rows.flatMap((r) => r.permissions.map(keyOf)))].sort()
  const groups = new Map<string, string[]>()
  all.forEach((k) => groups.set(k.split('.')[0], [...(groups.get(k.split('.')[0]) ?? []), k]))
  return [...groups.entries()].map(([group, keys]) => ({ group, keys }))
}

type Mode = 'fixed' | 'toggle' | 'none'
export interface MatrixRow { label: string; mode: Mode; keys: string[] }
export const MATRIX: MatrixRow[] = [
  { label: 'Xem dữ liệu mọi chi nhánh', mode: 'none', keys: [] },
  { label: 'Chuyển đổi giữa các chi nhánh', mode: 'none', keys: [] },
  { label: 'Quản lý hội viên, ảnh và Face ID', mode: 'fixed', keys: ['members.read'] },
  { label: 'Tạo hợp đồng, ký, kích hoạt', mode: 'fixed', keys: ['contracts.create'] },
  { label: 'Check-in, mở và chốt ca', mode: 'fixed', keys: ['checkins.create'] },
  { label: 'Lịch PT 1:1 và lớp nhóm: xem, đặt, hủy', mode: 'fixed', keys: ['pt_sessions.create'] },
  { label: 'Thu tiền, lập phiếu thu', mode: 'fixed', keys: ['payments.create'] },
  { label: 'Quản lý khách tiềm năng (lead)', mode: 'fixed', keys: ['leads.update'] },
  { label: 'Lập phiếu bảo lưu hợp đồng', mode: 'toggle', keys: ['contracts.freeze'] },
  { label: 'Duyệt phiếu hủy hợp đồng (tắt: phiếu của lễ tân chờ chủ duyệt)', mode: 'toggle', keys: ['contracts.approve', 'contracts.cancel'] },
  { label: 'Hoàn thành buổi PT', mode: 'toggle', keys: ['pt_sessions.complete'] },
  { label: 'Yêu cầu hoàn tiền và xác nhận thu', mode: 'toggle', keys: ['payments.refund_request', 'payments.confirm'] },
  { label: 'Thêm hoặc sửa gói tập', mode: 'toggle', keys: ['packages.create', 'packages.update'] },
  { label: 'Xem báo cáo và chỉ số marketing của chi nhánh mình', mode: 'toggle', keys: ['reports.view'] },
  { label: 'Xem doanh thu toàn hệ thống', mode: 'none', keys: [] },
  { label: 'Quản lý tài khoản đăng nhập, nhập xuất dữ liệu', mode: 'none', keys: [] },
]

const ROLE_LABEL: Record<string, string> = { super_admin: 'Chủ phòng gym', owner: 'Chủ phòng gym', branch_manager: 'Quản lý', receptionist: 'Lễ tân', sales: 'Sales', trainer: 'Huấn luyện viên', accountant: 'Kế toán' }

export default function Roles() {
  const { user } = useAuth()
  const { can } = usePermission()
  const toast = useToast()
  const nav = useNavigate()
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [staff, setStaff] = useState<AdminUser[]>([])
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [r, u] = await Promise.all([api.get<{ data: RoleRow[] }>('/roles'), api.get<ListResp<AdminUser>>('/users', { params: { limit: 100 } })])
      setRoles(r.data.data)
      setStaff(u.data.data.filter((x) => x.roles.some((y) => y.role !== 'member')))
      setError('')
    } catch (e) {
      setError(apiError(e).message)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const recep = useMemo(() => new Set((roles.find((r) => r.key === 'receptionist')?.permissions ?? []).map(keyOf)), [roles])
  const canEdit = can('roles.assign') && !!user && (user.roles.includes('owner') || user.roles.includes('super_admin'))
  const branchOf = (id: string | null) => user?.branches.find((b) => b.id === id)

  const toggleKeys = MATRIX.filter((m) => m.mode === 'toggle').flatMap((m) => m.keys)
  const flip = async (row: MatrixRow) => {
    const on = row.keys.every((k) => recep.has(k))
    const held = toggleKeys.filter((k) => recep.has(k) && !row.keys.includes(k))
    const next = on ? held : [...held, ...row.keys]
    try {
      await api.put('/roles/receptionist/permissions', { permissions: next })
      toast('Đã cập nhật quyền lễ tân')
      await load()
    } catch (e) {
      toast(apiError(e).message)
    }
  }

  return (
    <>
      <PageHeader title="Nhân viên và phân quyền" sub={`Tất cả chi nhánh: ${(user?.branches ?? []).map((b) => b.name).join(', ')}`} action={<Button variant="primary" onClick={() => nav('/staff')}>+ Thêm nhân viên</Button>} />
      {error && <div className="form-error" role="alert">{error}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, alignItems: 'start' }}>
        <Panel title="Nhân viên" flush>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Họ tên</th><th>Vai trò</th><th>Chi nhánh</th><th /></tr></thead>
              <tbody>
                {staff.map((u) => {
                  const r = u.roles.find((x) => x.role !== 'member')!
                  const global = !r.branch_id
                  return (
                    <tr key={u.id}>
                      <td>{u.name}</td>
                      <td>{ROLE_LABEL[r.role] ?? r.role}</td>
                      <td>{global ? <Chip tone="warn">Tất cả chi nhánh</Chip> : <BranchTag branch={branchOf(r.branch_id)} />}</td>
                      <td className="actions"><Button small onClick={() => nav(r.role === 'receptionist' || global ? '/users' : '/staff')}>Sửa</Button></td>
                    </tr>
                  )
                })}
                {staff.length === 0 && <tr><td colSpan={4}>Chưa có nhân viên</td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Quyền theo vai trò" flush>
          <div className="table-wrap">
            <table className="table matrix">
              <caption className="sr-only">Quyền của chủ và lễ tân</caption>
              <thead><tr><th>Quyền</th><th className="num">Chủ</th><th className="num">Lễ tân</th></tr></thead>
              <tbody>
                {MATRIX.map((m) => {
                  const on = m.mode === 'fixed' || (m.mode === 'toggle' && m.keys.every((k) => recep.has(k)))
                  return (
                    <tr key={m.label}>
                      <td>{m.label}</td>
                      <td className="num"><span className="yes">Có</span></td>
                      <td className="num">
                        {m.mode === 'toggle' ? (
                          <label className="check">
                            <input type="checkbox" checked={on} disabled={!canEdit} onChange={() => flip(m)} aria-label={`Lễ tân: ${m.label}`} />
                            {on ? 'Có' : 'Không'}
                          </label>
                        ) : on ? <span className="yes">Có</span> : <span className="no">Không</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
      <p className="muted">Tích vào ô ở cột Lễ tân để cho phép lễ tân dùng chức năng đó; bỏ tích để thu lại ngay. Các quyền không có ô tích là cố định. Huấn luyện viên và nhân viên khác không có tài khoản đăng nhập, chỉ quản lý thông tin ở Nhân sự &gt; Nhân viên.</p>
    </>
  )
}
