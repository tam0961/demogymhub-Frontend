import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtDateTime } from '../lib/format'
import { LEAD_STATUS, leadErrorText } from '../lib/leads'
import { useAuth } from '../context/AuthContext'
import { useBranch } from '../context/BranchContext'
import { usePermission } from '../context/usePermission'
import { ConfirmDialog } from '../components/Dialogs'
import { Modal } from '../components/Modal'
import { Button, Chip, DataTable, Field, Input, Select, Textarea, useToast, type Column } from '../components/ui'
import type { Branch, Lead, LeadStatus, ListResp } from '../types'

type Tab = 'all' | LeadStatus
const TABS: { value: Tab; label: string }[] = [{ value: 'all', label: 'Tất cả' }, ...(Object.keys(LEAD_STATUS) as LeadStatus[]).map((s) => ({ value: s as Tab, label: LEAD_STATUS[s].label }))]
const EDITABLE: LeadStatus[] = ['new', 'contacted', 'trial_booked', 'lost']

export function leadColumns(actions: { canEdit: boolean; onEdit: (l: Lead) => void; onConvert: (l: Lead) => void; pts?: { id: string; name: string }[]; onAssign?: (l: Lead, ptId: string | null) => void }, _branchOf?: (l: Lead) => Branch | undefined): Column<Lead>[] {
  const ptName = (l: Lead) => actions.pts?.find((p) => p.id === l.assigned_to)?.name ?? ''
  return [
    { key: 'created', header: 'Ngày giờ', sortValue: (l) => l.created_at, render: (l) => fmtDateTime(l.created_at) },
    { key: 'name', header: 'Khách hàng', sortValue: (l) => l.name, render: (l) => <span className="cell-main">{l.name}</span> },
    { key: 'phone', header: 'Số điện thoại', sortValue: (l) => l.phone, render: (l) => l.phone },
    { key: 'source', header: 'Nguồn', sortValue: (l) => l.source ?? '', render: (l) => l.source || '-' },
    { key: 'interest', header: 'Gói quan tâm', sortValue: (l) => l.interest ?? '', render: (l) => l.interest || '-' },
    { key: 'status', header: 'Trạng thái', sortValue: (l) => LEAD_STATUS[l.status].label, render: (l) => <Chip tone={LEAD_STATUS[l.status].tone}>{LEAD_STATUS[l.status].label}</Chip> },
    {
      key: 'assignee', header: 'Sale phụ trách', sortValue: ptName,
      render: (l) => (actions.canEdit && actions.onAssign ? (
        <span onClick={(e) => e.stopPropagation()}>
          <Select aria-label={`Sale phụ trách ${l.name}`} value={l.assigned_to ?? ''} onChange={(e) => actions.onAssign!(l, e.target.value || null)}>
            <option value="">Chưa phân công</option>
            {actions.pts?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </span>
      ) : (ptName(l) || '-')),
    },
    {
      key: 'actions', header: '',
      render: (l) => actions.canEdit && (
        <div className="row-actions" onClick={(e) => e.stopPropagation()}>
          <Button small onClick={() => actions.onEdit(l)}>Sửa</Button>
          {l.status !== 'converted' && <Button small onClick={() => actions.onConvert(l)}>Chuyển hội viên</Button>}
        </div>
      ),
    },
  ]
}

export default function Leads() {
  const { branchId } = useBranch()
  const { can } = usePermission()
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('all')
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Lead | 'new' | null>(null)
  const [converting, setConverting] = useState<Lead | null>(null)
  const [convErr, setConvErr] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get<ListResp<Lead>>('/leads', { params: { limit: 200, branch_id: branchId ?? undefined } })
      setRows(data.data)
    } catch (e) {
      setError(apiError(e).message)
    } finally {
      setLoading(false)
    }
  }, [branchId])
  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase()
    return rows.filter((l) => (tab === 'all' || l.status === tab) && (!k || l.name.toLowerCase().includes(k) || l.phone.includes(k)))
  }, [rows, tab, q])
  const [pts, setPts] = useState<{ id: string; name: string }[]>([])
  useEffect(() => {
    api.get<{ data: { id: string; name: string }[] }>('/contracts/pt-staff', { params: { branch_id: branchId ?? undefined } }).then((r) => setPts(r.data.data)).catch(() => setPts([]))
  }, [branchId])
  const assign = useCallback(async (l: Lead, ptId: string | null) => {
    try {
      await api.patch(`/leads/${l.id}`, { assigned_to: ptId })
      setRows((x) => x.map((r) => (r.id === l.id ? { ...r, assigned_to: ptId } : r)))
    } catch (e) {
      toast(apiError(e).message, true)
    }
  }, [toast])
  const columns = useMemo(
    () => leadColumns({ canEdit: can('leads.update'), onEdit: setEditing, onConvert: (l) => { setConvErr(''); setConverting(l) }, pts, onAssign: assign }),
    [can, pts, assign],
  )

  const convert = async () => {
    if (!converting) return
    setBusy(true)
    setConvErr('')
    try {
      await api.post(`/leads/${converting.id}/convert`)
      setConverting(null)
      toast('Đã chuyển thành hội viên')
      load()
    } catch (e) {
      setConvErr(leadErrorText(apiError(e)).form ?? '')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="page-head members-head">
        <h1>Khách tiềm năng</h1>
        <div className="members-filters">
          <input className="input" type="search" placeholder="Tìm tên, SĐT" aria-label="Tìm khách tiềm năng" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select aria-label="Lọc trạng thái" value={tab} onChange={(e) => setTab(e.target.value as Tab)}>
            {TABS.map((t) => <option key={t.value} value={t.value}>{t.value === 'all' ? 'Mọi trạng thái' : t.label}</option>)}
          </Select>
        </div>
        <div className="page-action">
          <span className="hint-muted">{filtered.length} khách</span>
          {can('leads.create') && <Button variant="primary" onClick={() => setEditing('new')}>Thêm khách</Button>}
        </div>
      </div>
      <div className="card">
        <DataTable columns={columns} rows={filtered} rowKey={(l) => l.id} loading={loading} error={error} emptyText="Chưa có khách tiềm năng" itemLabel="khách" />
      </div>
      {editing && (
        <LeadModal lead={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); toast('Đã lưu'); load() }} />
      )}
      {converting && (
        <ConfirmDialog
          title="Chuyển thành hội viên"
          message={<>Tạo hội viên mới cho <b>{converting.name}</b> ({converting.phone}) tại chi nhánh của khách?{convErr && <div className="form-error" role="alert">{convErr}</div>}</>}
          confirmLabel="Chuyển hội viên"
          busy={busy}
          onConfirm={convert}
          onClose={() => setConverting(null)}
        />
      )}
    </>
  )
}

export function LeadModal({ lead, onClose, onSaved }: { lead: Lead | null; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth()
  const { branchId } = useBranch()
  const branches = user?.branches ?? []
  const [f, setF] = useState({
    name: lead?.name ?? '',
    phone: lead?.phone ?? '',
    email: lead?.email ?? '',
    source: lead?.source ?? '',
    interest: lead?.interest ?? '',
    note: lead?.note ?? '',
    status: lead?.status ?? ('new' as LeadStatus),
    branch_id: lead?.branch_id ?? branchId ?? branches[0]?.id ?? '',
  })
  const [err, setErr] = useState<{ form?: string }>({})
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  const locked = lead?.status === 'converted'

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr({})
    const common = { name: f.name, phone: f.phone, email: f.email || null, source: f.source || null, interest: f.interest || null, note: f.note || null }
    try {
      if (lead) {
        await api.patch(`/leads/${lead.id}`, common)
        if (!locked && f.status !== lead.status) await api.post(`/leads/${lead.id}/status`, { status: f.status })
      } else {
        const r = await api.post('/leads', { ...common, branch_id: f.branch_id })
        if (f.status !== 'new') await api.post(`/leads/${r.data.data.id}/status`, { status: f.status })
      }
      onSaved()
    } catch (x) {
      setErr(leadErrorText(apiError(x)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={lead ? 'Sửa khách tiềm năng' : 'Thêm khách tiềm năng'}
      onClose={onClose}
      footer={<><Button onClick={onClose}>Hủy</Button><Button variant="primary" type="submit" form="lead-form" disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu'}</Button></>}
    >
      <form id="lead-form" className="form-grid" onSubmit={submit}>
        {err.form && <div className="form-error full" role="alert">{err.form}</div>}
        <Field label="Họ tên" htmlFor="l-name" full><Input id="l-name" required value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Số điện thoại" htmlFor="l-phone"><Input id="l-phone" type="tel" inputMode="tel" required value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Email" htmlFor="l-email"><Input id="l-email" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Nguồn" htmlFor="l-source"><Input id="l-source" placeholder="Facebook, Zalo, giới thiệu..." value={f.source} onChange={(e) => set('source', e.target.value)} /></Field>
        <Field label="Gói quan tâm" htmlFor="l-interest"><Input id="l-interest" maxLength={100} placeholder="PT 1:1 - 20 buổi, Member 3 tháng..." value={f.interest} onChange={(e) => set('interest', e.target.value)} /></Field>
        <Field label="Trạng thái" htmlFor="l-status">
          <Select id="l-status" disabled={locked} value={f.status} onChange={(e) => set('status', e.target.value as LeadStatus)}>
            {(locked ? (['converted'] as LeadStatus[]) : EDITABLE).map((s) => <option key={s} value={s}>{LEAD_STATUS[s].label}</option>)}
          </Select>
        </Field>
        {!lead && (
          <Field label="Chi nhánh" htmlFor="l-branch">
            <Select id="l-branch" required value={f.branch_id} onChange={(e) => set('branch_id', e.target.value)}>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Ghi chú" htmlFor="l-note" full><Textarea id="l-note" rows={3} value={f.note} onChange={(e) => set('note', e.target.value)} /></Field>
      </form>
    </Modal>
  )
}
