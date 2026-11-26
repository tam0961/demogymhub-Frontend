import { nameLines } from '../lib/nameLines'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { fetchAll } from '../lib/fetchAll'
import { apiError } from '../lib/errors'
import { CONTRACT_STATUS_OPTIONS, contractStatusLabel, contractsToCSV } from '../lib/contracts'
import { hasHsd } from '../lib/pt'
import { METHOD_LABEL, downloadBlob, fmtDate, fmtMoney } from '../lib/format'
import { useBranch } from '../context/BranchContext'
import { RequirePermission } from '../context/usePermission'
import { Modal } from '../components/Modal'
import { Button, Chip, DataTable, Field, Icon, Input, Select, type Column } from '../components/ui'
import ContractNew from './ContractNew'
import type { Contract } from '../types'

interface ContractFilters {
  pkg: string; kind: string; signFrom: string; signTo: string; startFrom: string; startTo: string; endFrom: string; endTo: string
  debt: string; sessions: string; sale: string
}
const NO_FILTERS: ContractFilters = { pkg: '', kind: '', signFrom: '', signTo: '', startFrom: '', startTo: '', endFrom: '', endTo: '', debt: '', sessions: '', sale: '' }

function applyContractFilters(rows: Contract[], f: ContractFilters): Contract[] {
  return rows.filter((c) => {
    const sign = (c.signed_at ?? c.created_at ?? '').slice(0, 10)
    const start = c.start_date?.slice(0, 10) ?? ''
    const end = c.end_date?.slice(0, 10) ?? ''
    if (f.pkg && c.package.name !== f.pkg) return false
    if (f.kind && c.package.category !== f.kind) return false
    if (f.signFrom && (!sign || sign < f.signFrom)) return false
    if (f.signTo && (!sign || sign > f.signTo)) return false
    if (f.startFrom && (!start || start < f.startFrom)) return false
    if (f.startTo && (!start || start > f.startTo)) return false
    if (f.endFrom && (!end || end < f.endFrom)) return false
    if (f.endTo && (!end || end > f.endTo)) return false
    if (f.debt === 'yes' && !(c.debt_amount > 0)) return false
    if (f.debt === 'no' && c.debt_amount > 0) return false
    if (f.sessions === 'left' && !(c.sessions_total != null && (c.sessions_left ?? 0) > 0)) return false
    if (f.sessions === 'none' && !(c.sessions_total != null && (c.sessions_left ?? 0) <= 0)) return false
    if (f.sale && (c.sale?.name ?? '') !== f.sale) return false
    return true
  })
}

function ContractFilterModal({ value, packages, sales, onApply, onClose }: { value: ContractFilters; packages: string[]; sales: string[]; onApply: (f: ContractFilters) => void; onClose: () => void }) {
  const [f, setF] = useState<ContractFilters>(value)
  const set = (k: keyof ContractFilters) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))
  return (
    <Modal
      title="Bộ lọc hợp đồng"
      onClose={onClose}
      footer={<><Button onClick={() => { setF(NO_FILTERS); onApply(NO_FILTERS) }}>Xóa bộ lọc</Button><Button variant="primary" onClick={() => onApply(f)}>Áp dụng</Button></>}
    >
      <p className="hint-muted" style={{ marginBottom: 12 }}>Chọn điều kiện rồi bấm Áp dụng. Bộ lọc dùng chung với ô tìm kiếm, ô trạng thái và ô PT.</p>
      <div className="form-grid">
        <Field label="Gói" htmlFor="cf-pkg">
          <Select id="cf-pkg" value={f.pkg} onChange={set('pkg')}>
            <option value="">Tất cả gói</option>
            {packages.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </Field>
        <Field label="Loại gói" htmlFor="cf-kind">
          <Select id="cf-kind" value={f.kind} onChange={set('kind')}>
            <option value="">Tất cả</option>
            <option value="member">Gói member</option>
            <option value="pt_1on1">Gói PT 1-1</option>
            <option value="pt_1on2">Gói PT 1-2</option>
            <option value="pt_group">Gói PT nhóm</option>
          </Select>
        </Field>
        <Field label="Ký từ ngày" htmlFor="cf-sf"><Input id="cf-sf" type="date" value={f.signFrom} onChange={set('signFrom')} /></Field>
        <Field label="Ký đến ngày" htmlFor="cf-st"><Input id="cf-st" type="date" value={f.signTo} onChange={set('signTo')} /></Field>
        <Field label="Bắt đầu từ ngày" htmlFor="cf-bf"><Input id="cf-bf" type="date" value={f.startFrom} onChange={set('startFrom')} /></Field>
        <Field label="Bắt đầu đến ngày" htmlFor="cf-bt"><Input id="cf-bt" type="date" value={f.startTo} onChange={set('startTo')} /></Field>
        <Field label="Hết hạn từ ngày" htmlFor="cf-ef"><Input id="cf-ef" type="date" value={f.endFrom} onChange={set('endFrom')} /></Field>
        <Field label="Hết hạn đến ngày" htmlFor="cf-et"><Input id="cf-et" type="date" value={f.endTo} onChange={set('endTo')} /></Field>
        <Field label="Công nợ" htmlFor="cf-debt">
          <Select id="cf-debt" value={f.debt} onChange={set('debt')}>
            <option value="">Tất cả</option>
            <option value="yes">Còn nợ</option>
            <option value="no">Không nợ</option>
          </Select>
        </Field>
        <Field label="Số buổi PT" htmlFor="cf-sessions">
          <Select id="cf-sessions" value={f.sessions} onChange={set('sessions')}>
            <option value="">Tất cả</option>
            <option value="left">Còn buổi</option>
            <option value="none">Hết buổi</option>
          </Select>
        </Field>
        <Field label="Sale" htmlFor="cf-sale">
          <Select id="cf-sale" value={f.sale} onChange={set('sale')}>
            <option value="">Tất cả</option>
            {sales.map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        </Field>
      </div>
    </Modal>
  )
}

export default function Contracts() {
  const { branchId } = useBranch()
  const nav = useNavigate()
  const loc = useLocation()
  const [params] = useSearchParams()
  const creating = loc.pathname === '/contracts/new'
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [ptId, setPtId] = useState('')
  const [filters, setFilters] = useState<ContractFilters>(NO_FILTERS)
  const [filterOpen, setFilterOpen] = useState(false)
  const [pts, setPts] = useState<{ id: string; name: string }[]>([])
  const [rows, setRows] = useState<Contract[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setRows(await fetchAll<Contract>('/contracts', { branch_id: branchId ?? undefined, pt_user_id: ptId || undefined }))
    } catch (e) {
      setError(apiError(e).message)
    } finally {
      setLoading(false)
    }
  }, [branchId, ptId])
  useEffect(() => {
    load()
  }, [load])
  useEffect(() => {
    api.get<{ data: { id: string; name: string }[] }>('/contracts/pt-staff', { params: { branch_id: branchId ?? undefined } }).then((r) => setPts(r.data.data)).catch(() => setPts([]))
  }, [branchId])

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase()
    return applyContractFilters(rows, filters).filter((c) => {
      if (status && contractStatusLabel(c).label !== status) return false
      if (!k) return true
      return c.code.toLowerCase().includes(k) || c.member.name.toLowerCase().includes(k) || c.member.code.toLowerCase().includes(k) || c.member.phone.includes(k)
    })
  }, [rows, q, status, filters])
  const packageNames = useMemo(() => [...new Set(rows.map((c) => c.package.name))].sort(), [rows])
  const saleNames = useMemo(() => [...new Set(rows.flatMap((c) => (c.sale?.name ? [c.sale.name] : [])))].sort(), [rows])
  const activeFilters = Object.values(filters).filter(Boolean).length

  const exportCsv = () => downloadBlob(new Blob(['﻿' + contractsToCSV(filtered)], { type: 'text/csv;charset=utf-8' }), 'hop-dong.csv')

  const columns: Column<Contract>[] = [
    { key: 'code', header: 'Mã HĐ', sortValue: (c) => c.code, render: (c) => <><div className="cell-main">{c.code}{c.bundle_of_id && <> <span className="hint-muted">Kèm PT</span></>}</div><div className="cell-sub">{(c.branch?.name ?? '').replace(/^Chi nhánh\s+/i, '')}</div></> },
    { key: 'member', className: 'col-left', header: 'Hội viên', sortValue: (c) => c.member.name, render: (c) => <><div className="cell-main">{nameLines(c.member.name)}</div><div className="cell-sub">{c.member.code}</div></> },
    { key: 'pkg', className: 'col-left', header: 'Dịch vụ', sortValue: (c) => c.package.name, render: (c) => c.package.name },
    { key: 'signed', header: 'Ngày ký', sortValue: (c) => c.signed_at ?? c.created_at, render: (c) => fmtDate(c.signed_at ?? c.created_at) },
    {
      key: 'end', header: 'Hết hạn', sortValue: (c) => c.end_date,
      render: (c) => <>{fmtDate(c.end_date)}{hasHsd(c.package.category) && c.usage_deadline && <div className="cell-sub">HSD {fmtDate(c.usage_deadline)}</div>}</>,
    },
    {
      key: 'total', header: 'Giá trị', numeric: true, sortValue: (c) => c.total_amount,
      render: (c) => <><div className="cell-main">{c.bundle_of_id && c.total_amount === 0 ? <span className="hint-muted">Kèm gói PT</span> : fmtMoney(c.total_amount)}</div><div className="cell-sub">{c.last_payment_method ? METHOD_LABEL[c.last_payment_method] : ''}</div></>,
    },
    {
      key: 'debt', header: 'Công nợ', numeric: true, sortValue: (c) => c.debt_amount,
      render: (c) => (
        <>
          <div className="cell-main">{c.debt_amount > 0 ? <span className="text-bad">{fmtMoney(c.debt_amount)}</span> : <span className="hint-muted">-</span>}</div>
          {c.debt_amount > 0 && c.due_date && <div className="cell-sub">TT {fmtDate(c.due_date)}{(c.overdue_days ?? 0) > 0 && <> <Chip tone="bad">quá hạn {c.overdue_days} ngày</Chip></>}</div>}
        </>
      ),
    },
    { key: 'status', header: 'Trạng thái', sortValue: (c) => contractStatusLabel(c).label, render: (c) => { const s = contractStatusLabel(c); return <Chip tone={s.tone}>{s.label}</Chip> } },
    { key: 'sale', header: 'Sale', sortValue: (c) => c.sale?.name ?? '', render: (c) => c.sale?.name ?? <span className="hint-muted">-</span> },
    { key: 'pt', header: 'PT phụ trách', sortValue: (c) => c.pt?.name ?? '', render: (c) => c.pt?.name ?? <span className="hint-muted">-</span> },
  ]

  return (
    <>
      <div className="page-head members-head">
        <h1>Hợp đồng</h1>
        <div className="members-filters">
          <input className="input" type="search" placeholder="Tìm mã HĐ, tên, mã hội viên" aria-label="Tìm hợp đồng" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select aria-label="Lọc trạng thái" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Mọi trạng thái</option>
            {CONTRACT_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Select aria-label="Lọc PT phụ trách" value={ptId} onChange={(e) => setPtId(e.target.value)}>
            <option value="">Tất cả PT</option>
            {pts.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
          <Button onClick={() => setFilterOpen(true)}>Bộ lọc{activeFilters ? ` (${activeFilters})` : ''}</Button>
        </div>
        <div className="page-action">
          <span className="hint-muted">{filtered.length} hợp đồng</span>
          <Button onClick={exportCsv} disabled={filtered.length === 0}><Icon name="download" size={16} />Xuất CSV</Button>
          <RequirePermission permission="contracts.create"><Button variant="primary" onClick={() => nav('/contracts/new')}>Tạo hợp đồng mới</Button></RequirePermission>
        </div>
      </div>
      <div className="card contracts-table">
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(c) => c.id}
          onRowClick={(c) => nav(`/contracts/${c.id}`)}
          selectable
          selected={selected}
          onSelectionChange={setSelected}
          loading={loading}
          error={error}
          emptyText="Không có hợp đồng phù hợp"
          defaultSort={{ key: 'signed', dir: 'desc' }}
          itemLabel="hợp đồng"
        />
      </div>
      {filterOpen && <ContractFilterModal value={filters} packages={packageNames} sales={saleNames} onClose={() => setFilterOpen(false)} onApply={(f) => { setFilters(f); setFilterOpen(false) }} />}
      {creating && (
        <RequirePermission permission="contracts.create">
          <ContractNew
            memberId={params.get('member_id')}
            onClose={() => nav('/contracts')}
            onCreated={(id) => { load(); nav(`/contracts/${id}`) }}
          />
        </RequirePermission>
      )}
    </>
  )
}

