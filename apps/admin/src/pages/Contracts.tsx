import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { fetchAll } from '../lib/fetchAll'
import { apiError } from '../lib/errors'
import { CONTRACT_STATUS_OPTIONS, contractStatusLabel, contractsToCSV } from '../lib/contracts'
import { METHOD_LABEL, downloadBlob, fmtDate, fmtMoney } from '../lib/format'
import { useBranch } from '../context/BranchContext'
import { RequirePermission } from '../context/usePermission'
import { Button, Chip, DataTable, Icon, PageHeader, Select, type Column } from '../components/ui'
import ContractNew from './ContractNew'
import type { Contract } from '../types'

export default function Contracts() {
  const { branchId } = useBranch()
  const nav = useNavigate()
  const loc = useLocation()
  const [params] = useSearchParams()
  const creating = loc.pathname === '/contracts/new'
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [rows, setRows] = useState<Contract[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setRows(await fetchAll<Contract>('/contracts', { branch_id: branchId ?? undefined }))
    } catch (e) {
      setError(apiError(e).message)
    } finally {
      setLoading(false)
    }
  }, [branchId])
  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase()
    return rows.filter((c) => {
      if (status && contractStatusLabel(c).label !== status) return false
      if (!k) return true
      return c.code.toLowerCase().includes(k) || c.member.name.toLowerCase().includes(k) || c.member.code.toLowerCase().includes(k) || c.member.phone.includes(k)
    })
  }, [rows, q, status])

  const exportCsv = () => downloadBlob(new Blob(['﻿' + contractsToCSV(filtered)], { type: 'text/csv;charset=utf-8' }), 'hop-dong.csv')

  const columns: Column<Contract>[] = [
    { key: 'code', header: 'Mã HĐ', sortValue: (c) => c.code, render: (c) => <><div className="cell-main">{c.code}</div><div className="cell-sub">{c.branch?.name ?? ''}</div></> },
    { key: 'member', header: 'Hội viên', sortValue: (c) => c.member.name, render: (c) => <><div className="cell-main">{c.member.name}</div><div className="cell-sub">{c.member.code}</div></> },
    { key: 'pkg', header: 'Dịch vụ', sortValue: (c) => c.package.name, render: (c) => c.package.name },
    { key: 'signed', header: 'Ngày ký', sortValue: (c) => c.signed_at ?? c.created_at, render: (c) => fmtDate(c.signed_at ?? c.created_at) },
    { key: 'end', header: 'Hết hạn', sortValue: (c) => c.end_date, render: (c) => fmtDate(c.end_date) },
    {
      key: 'total', header: 'Giá trị', numeric: true, sortValue: (c) => c.total_amount,
      render: (c) => <><div className="cell-main">{fmtMoney(c.total_amount)}</div><div className="cell-sub">{c.last_payment_method ? METHOD_LABEL[c.last_payment_method] : ''}</div></>,
    },
    { key: 'debt', header: 'Còn nợ', numeric: true, sortValue: (c) => c.debt_amount, render: (c) => (c.debt_amount > 0 ? <span className="text-bad cell-main">{fmtMoney(c.debt_amount)}</span> : <span className="hint-muted">-</span>) },
    { key: 'status', header: 'Trạng thái', sortValue: (c) => contractStatusLabel(c).label, render: (c) => { const s = contractStatusLabel(c); return <Chip tone={s.tone}>{s.label}</Chip> } },
  ]

  return (
    <>
      <PageHeader
        title="Hợp đồng"
        action={<RequirePermission permission="contracts.create"><Button variant="primary" onClick={() => nav('/contracts/new')}>Tạo hợp đồng mới</Button></RequirePermission>}
      />
      <div className="toolbar">
        <input className="input" type="search" placeholder="Tìm mã HĐ, tên, mã hội viên" aria-label="Tìm hợp đồng" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select aria-label="Lọc trạng thái" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Mọi trạng thái</option>
          {CONTRACT_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <div className="grow">
          <span className="hint-muted">{filtered.length} hợp đồng</span>
          <Button onClick={exportCsv} disabled={filtered.length === 0}><Icon name="download" size={16} />Xuất CSV</Button>
        </div>
      </div>
      <div className="card">
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

