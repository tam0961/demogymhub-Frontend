import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { useAuth } from '../context/AuthContext'
import { useBranch } from '../context/BranchContext'
import { RequirePermission, usePermission } from '../context/usePermission'
import { Modal } from '../components/Modal'
import { QRImage } from '../components/QRImage'
import { Link } from 'react-router-dom'
import { useToast } from '../components/Toast'
import { BranchBadge, Button, Field, Input, Pager, Select, StatusBadge, Tabs } from '../components/ui'
import type { Gender, ListResp, Member, MemberStatus } from '../types'

const LIMIT = 10
type Filter = 'all' | MemberStatus
const TABS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'active', label: 'Đang hiệu lực' },
  { value: 'expired', label: 'Hết hạn' },
  { value: 'frozen', label: 'Tạm dừng' },
]
const fmtDate = (s: string) => new Date(s).toLocaleDateString('vi-VN')

export default function Members() {
  const { user } = useAuth()
  const { branchId } = useBranch()
  const { can } = usePermission()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const urlQ = params.get('q') ?? ''
  const [q, setQ] = useState(urlQ)
  const [status, setStatus] = useState<Filter>('all')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<Member[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Member | 'new' | null>(null)

  useEffect(() => setQ(urlQ), [urlQ])

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1)
      if (q !== urlQ) setParams(q ? { q } : {}, { replace: true })
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get<ListResp<Member>>('/members', {
        params: { q: urlQ || undefined, status: status === 'all' ? undefined : status, branch_id: branchId ?? undefined, page, limit: LIMIT },
      })
      setRows(data.data)
      setTotal(data.meta.total)
    } catch (e) {
      setError(apiError(e).message)
    } finally {
      setLoading(false)
    }
  }, [urlQ, status, branchId, page])

  useEffect(() => {
    load()
  }, [load])

  const branchOf = (id: string) => user?.branches.find((b) => b.id === id)
  const canEdit = can('members.update')

  return (
    <>
      <div className="page-head">
        <h1>Hội viên</h1>
        <RequirePermission permission="members.create">
          <Button variant="primary" onClick={() => setEditing('new')}>Thêm hội viên</Button>
        </RequirePermission>
      </div>
      <div className="toolbar">
        <input className="input" type="search" placeholder="Tìm theo tên, SĐT, mã" aria-label="Tìm hội viên" value={q} onChange={(e) => setQ(e.target.value)} />
        <Tabs tabs={TABS} value={status} onChange={(v) => { setStatus(v); setPage(1) }} />
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Mã</th>
                <th>Họ tên</th>
                <th>SĐT</th>
                <th>Trạng thái</th>
                <th>Chi nhánh</th>
                <th className="num">Ngày tạo</th>
                {canEdit && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className={canEdit ? 'clickable' : ''} onClick={canEdit ? () => setEditing(m) : undefined}>
                  <td>{m.code}</td>
                  <td><b>{m.name}</b></td>
                  <td>{m.phone}</td>
                  <td><StatusBadge status={m.status} /></td>
                  <td><BranchBadge branch={branchOf(m.branch_id)} /></td>
                  <td className="num">{fmtDate(m.created_at)}</td>
                  {canEdit && (
                    <td className="actions">
                      {can('contracts.create') && <Link className="btn btn-sm" to={`/contracts/new?member_id=${m.id}`} onClick={(e) => e.stopPropagation()}>Tạo hợp đồng</Link>}{' '}
                      <Button small onClick={(e) => { e.stopPropagation(); setEditing(m) }}>Sửa</Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {loading && <div className="empty">Đang tải...</div>}
          {!loading && error && <div className="empty" role="alert">{error}</div>}
          {!loading && !error && rows.length === 0 && <div className="empty">Không có hội viên phù hợp</div>}
        </div>
        <Pager page={page} limit={LIMIT} total={total} onPage={setPage} />
      </div>
      {editing && (
        <MemberModal
          member={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            toast('Đã lưu hội viên')
            load()
          }}
        />
      )}
    </>
  )
}

interface FormState { name: string; phone: string; email: string; gender: Gender | ''; dob: string; status: MemberStatus; branch_id: string }

export function MemberModal({ member, onClose, onSaved }: { member: Member | null; onClose: () => void; onSaved: (m?: Member) => void }) {
  const { user } = useAuth()
  const { branchId } = useBranch()
  const branches = user?.branches ?? []
  const [f, setF] = useState<FormState>({
    name: member?.name ?? '',
    phone: member?.phone ?? '',
    email: member?.email ?? '',
    gender: member?.gender ?? '',
    dob: member?.dob?.slice(0, 10) ?? '',
    status: member?.status ?? 'active',
    branch_id: member?.branch_id ?? branchId ?? branches[0]?.id ?? '',
  })
  const [errs, setErrs] = useState<{ phone?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((x) => ({ ...x, [k]: v }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErrs({})
    const body = { ...f, email: f.email || null, gender: f.gender || null, dob: f.dob || null }
    try {
      if (member) {
        const r = await api.patch(`/members/${member.id}`, body)
        onSaved(r.data.data)
      } else {
        const r = await api.post('/members', body)
        onSaved(r.data.data)
      }
    } catch (err) {
      const a = apiError(err)
      if (a.status === 409 || a.code.includes('PHONE') || a.code.includes('DUPLICATE')) setErrs({ phone: 'Số điện thoại đã tồn tại' })
      else setErrs({ form: a.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={member ? 'Sửa hội viên' : 'Thêm hội viên'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Hủy</Button>
          <Button variant="primary" type="submit" form="member-form" disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu'}</Button>
        </>
      }
    >
      <form id="member-form" className="form-grid" onSubmit={submit}>
        {errs.form && <div className="form-error full" role="alert">{errs.form}</div>}
        <Field label="Họ tên" htmlFor="m-name" full>
          <Input id="m-name" required value={f.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Số điện thoại" htmlFor="m-phone" error={errs.phone}>
          <Input id="m-phone" type="tel" inputMode="tel" required invalid={!!errs.phone} value={f.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="Email" htmlFor="m-email">
          <Input id="m-email" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Giới tính" htmlFor="m-gender">
          <Select id="m-gender" value={f.gender} onChange={(e) => set('gender', e.target.value as Gender | '')}>
            <option value="">Chưa chọn</option>
            <option value="male">Nam</option>
            <option value="female">Nữ</option>
            <option value="other">Khác</option>
          </Select>
        </Field>
        <Field label="Ngày sinh" htmlFor="m-dob">
          <Input id="m-dob" type="date" value={f.dob} onChange={(e) => set('dob', e.target.value)} />
        </Field>
        <Field label="Trạng thái" htmlFor="m-status">
          <Select id="m-status" value={f.status} onChange={(e) => set('status', e.target.value as MemberStatus)}>
            <option value="active">Đang hiệu lực</option>
            <option value="expired">Hết hạn</option>
            <option value="frozen">Tạm dừng</option>
          </Select>
        </Field>
        {member && (
          <div className="full qr-box">
            <QRImage text={member.code} size={140} />
            <div>
              <b>Mã QR check-in</b>
              <div className="hint-muted">{member.code}</div>
              <Button small onClick={() => window.print()}>In mã</Button>
            </div>
          </div>
        )}
        <Field label="Chi nhánh" htmlFor="m-branch">
          <Select id="m-branch" required value={f.branch_id} onChange={(e) => set('branch_id', e.target.value)}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
      </form>
    </Modal>
  )
}
