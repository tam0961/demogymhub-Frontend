import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtMoney, packageKind } from '../lib/format'
import { useAuth } from '../context/AuthContext'
import { useBranch } from '../context/BranchContext'
import { RequirePermission, usePermission } from '../context/usePermission'
import { Modal } from '../components/Modal'
import { BranchTag, Button, Chip, DataTable, Field, Input, PageHeader, Select, useToast, type Column } from '../components/ui'
import type { ListResp, PackageType, Pkg } from '../types'

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
  const columns: Column<Pkg>[] = [
    { key: 'name', header: 'Tên gói', sortValue: (p) => p.name, render: (p) => <span className="cell-main">{p.name}</span> },
    { key: 'kind', header: 'Loại', sortValue: (p) => packageKind(p.type, p.name), render: (p) => <Chip>{packageKind(p.type, p.name)}</Chip> },
    { key: 'price', header: 'Giá', numeric: true, sortValue: (p) => p.price, render: (p) => fmtMoney(p.price) },
    { key: 'term', header: 'Thời hạn / số buổi', numeric: true, sortValue: (p) => (p.type === 'session' ? p.sessions : p.duration_days), render: (p) => (p.type === 'session' ? `${p.sessions ?? 0} buổi` : `${p.duration_days ?? 0} ngày`) },
    { key: 'vat', header: 'VAT', numeric: true, sortValue: (p) => p.vat_percent, render: (p) => `${p.vat_percent}%` },
    { key: 'branch', header: 'Chi nhánh', sortValue: (p) => user?.branches.find((b) => b.id === p.branch_id)?.name, render: (p) => <BranchTag branch={user?.branches.find((b) => b.id === p.branch_id)} /> },
    { key: 'active', header: 'Trạng thái', sortValue: (p) => (p.active ? 0 : 1), render: (p) => (p.active ? <Chip tone="ok">Đang bán</Chip> : <Chip>Ngưng bán</Chip>) },
  ]

  return (
    <>
      <PageHeader
        title="Gói dịch vụ"
        action={<RequirePermission permission="packages.create"><Button variant="primary" onClick={() => setEditing('new')}>Thêm gói</Button></RequirePermission>}
      />
      <div className="card">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(p) => p.id}
          onRowClick={canEdit ? setEditing : undefined}
          loading={loading}
          error={error}
          emptyText="Chưa có gói dịch vụ"
          itemLabel="gói"
        />
      </div>
      {editing && (
        <PackageModal
          pkg={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            toast('Đã lưu gói dịch vụ')
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
      title={pkg ? 'Sửa gói dịch vụ' : 'Thêm gói dịch vụ'}
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
