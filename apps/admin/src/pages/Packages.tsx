import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { useAuth } from '../context/AuthContext'
import { useBranch } from '../context/BranchContext'
import { RequirePermission, usePermission } from '../context/usePermission'
import { Modal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { Badge, BranchBadge, Button, Field, Input, Select } from '../components/ui'
import type { ListResp, PackageType, Pkg } from '../types'

const TYPE_LABEL: Record<PackageType, string> = { day: 'Theo ngày', month: 'Theo tháng', session: 'Theo buổi' }
const money = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + ' đ'

export default function Packages() {
  const { user } = useAuth()
  const { branchId } = useBranch()
  const { can } = usePermission()
  const toast = useToast()
  const [rows, setRows] = useState<Pkg[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Pkg | 'new' | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get<ListResp<Pkg>>('/packages', { params: { branch_id: branchId ?? undefined, page: 1, limit: 100 } })
      setRows(data.data)
    } catch (e) {
      setError(apiError(e).message)
    } finally {
      setLoading(false)
    }
  }, [branchId])

  useEffect(() => {
    load()
  }, [load])

  const canEdit = can('packages.update')

  return (
    <>
      <div className="page-head">
        <h1>Gói tập</h1>
        <RequirePermission permission="packages.create">
          <Button variant="primary" onClick={() => setEditing('new')}>Thêm gói tập</Button>
        </RequirePermission>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Tên gói</th>
                <th>Loại</th>
                <th className="num">Thời hạn / số buổi</th>
                <th className="num">Giá</th>
                <th className="num">VAT</th>
                <th>Chi nhánh</th>
                <th>Trạng thái</th>
                {canEdit && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className={canEdit ? 'clickable' : ''} onClick={canEdit ? () => setEditing(p) : undefined}>
                  <td><b>{p.name}</b></td>
                  <td>{TYPE_LABEL[p.type]}</td>
                  <td className="num">{p.type === 'session' ? `${p.sessions ?? 0} buổi` : `${p.duration_days ?? 0} ngày`}</td>
                  <td className="num">{money(p.price)}</td>
                  <td className="num">{p.vat_percent}%</td>
                  <td><BranchBadge branch={user?.branches.find((b) => b.id === p.branch_id)} /></td>
                  <td>{p.active ? <Badge tone="ok">Đang bán</Badge> : <Badge>Ngưng bán</Badge>}</td>
                  {canEdit && (
                    <td className="actions">
                      <Button small onClick={(e) => { e.stopPropagation(); setEditing(p) }}>Sửa</Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {loading && <div className="empty">Đang tải...</div>}
          {!loading && error && <div className="empty" role="alert">{error}</div>}
          {!loading && !error && rows.length === 0 && <div className="empty">Chưa có gói tập</div>}
        </div>
      </div>
      {editing && (
        <PackageModal
          pkg={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            toast('Đã lưu gói tập')
            load()
          }}
        />
      )}
    </>
  )
}

interface FormState { name: string; type: PackageType; duration_days: string; sessions: string; price: string; vat_percent: string; branch_id: string; active: boolean }

function PackageModal({ pkg, onClose, onSaved }: { pkg: Pkg | null; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth()
  const [f, setF] = useState<FormState>({
    name: pkg?.name ?? '',
    type: pkg?.type ?? 'month',
    duration_days: String(pkg?.duration_days ?? 30),
    sessions: String(pkg?.sessions ?? 12),
    price: String(pkg?.price ?? ''),
    vat_percent: String(pkg?.vat_percent ?? 8),
    branch_id: pkg?.branch_id ?? (user?.branches.length === 1 ? user.branches[0].id : ''),
    active: pkg?.active ?? true,
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((x) => ({ ...x, [k]: v }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const body = {
      name: f.name,
      type: f.type,
      duration_days: f.type === 'session' ? null : Number(f.duration_days),
      sessions: f.type === 'session' ? Number(f.sessions) : null,
      price: Number(f.price),
      vat_percent: Number(f.vat_percent),
      branch_id: f.branch_id,
      active: f.active,
    }
    try {
      if (pkg) await api.patch(`/packages/${pkg.id}`, body)
      else await api.post('/packages', body)
      onSaved()
    } catch (err) {
      setError(apiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={pkg ? 'Sửa gói tập' : 'Thêm gói tập'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Hủy</Button>
          <Button variant="primary" type="submit" form="package-form" disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu'}</Button>
        </>
      }
    >
      <form id="package-form" className="form-grid" onSubmit={submit}>
        {error && <div className="form-error full" role="alert">{error}</div>}
        <Field label="Tên gói" htmlFor="p-name" full>
          <Input id="p-name" required value={f.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Loại" htmlFor="p-type">
          <Select id="p-type" value={f.type} onChange={(e) => set('type', e.target.value as PackageType)}>
            <option value="day">Theo ngày</option>
            <option value="month">Theo tháng</option>
            <option value="session">Theo buổi</option>
          </Select>
        </Field>
        {f.type === 'session' ? (
          <Field label="Số buổi" htmlFor="p-sessions">
            <Input id="p-sessions" type="number" min={1} required value={f.sessions} onChange={(e) => set('sessions', e.target.value)} />
          </Field>
        ) : (
          <Field label="Số ngày" htmlFor="p-days">
            <Input id="p-days" type="number" min={1} required value={f.duration_days} onChange={(e) => set('duration_days', e.target.value)} />
          </Field>
        )}
        <Field label="Giá (đ)" htmlFor="p-price">
          <Input id="p-price" type="number" min={0} required value={f.price} onChange={(e) => set('price', e.target.value)} />
        </Field>
        <Field label="VAT (%)" htmlFor="p-vat">
          <Input id="p-vat" type="number" min={0} max={100} required value={f.vat_percent} onChange={(e) => set('vat_percent', e.target.value)} />
        </Field>
        <Field label="Chi nhánh" htmlFor="p-branch">
          <Select id="p-branch" required disabled={!!pkg} value={f.branch_id} onChange={(e) => set('branch_id', e.target.value)}>
            <option value="" disabled>Chọn chi nhánh</option>
            {user?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
        <div className="field">
          <label htmlFor="p-active">Trạng thái</label>
          <label className="check">
            <input id="p-active" type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} />
            Đang bán
          </label>
        </div>
      </form>
    </Modal>
  )
}
