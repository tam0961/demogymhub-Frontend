import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchAll } from '../lib/fetchAll'
import { apiError } from '../lib/errors'
import { sortByDebt, totalDebt } from '../lib/contracts'
import { daysLeftText, fmtDate, fmtMoney, memberStatus } from '../lib/format'
import { useBranch } from '../context/BranchContext'
import { BranchTag, Chip, DataTable, Kpi, KpiRow, PageHeader, type Column } from '../components/ui'
import type { Contract } from '../types'

export default function Debt() {
  const { branchId } = useBranch()
  const nav = useNavigate()
  const [rows, setRows] = useState<Contract[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const all = await fetchAll<Contract>('/contracts', { has_debt: true, branch_id: branchId ?? undefined })
      setRows(sortByDebt(all.filter((c) => c.status !== 'cancelled')))
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
    return k ? rows.filter((c) => c.code.toLowerCase().includes(k) || c.member.name.toLowerCase().includes(k) || c.member.phone.includes(k)) : rows
  }, [rows, q])

  const columns: Column<Contract>[] = [
    { key: 'member', header: 'Hội viên', sortValue: (c) => c.member.name, render: (c) => <><div className="cell-main">{c.member.name}</div><div className="cell-sub">{c.member.code} - {c.member.phone}</div></> },
    { key: 'code', header: 'Hợp đồng', sortValue: (c) => c.code, render: (c) => <><div className="cell-main">{c.code}</div><div className="cell-sub">{c.package.name}</div></> },
    { key: 'branch', header: 'Chi nhánh', render: (c) => <BranchTag branch={c.branch} /> },
    { key: 'total', header: 'Giá trị', numeric: true, sortValue: (c) => c.total_amount, render: (c) => fmtMoney(c.total_amount) },
    { key: 'paid', header: 'Đã thu', numeric: true, sortValue: (c) => c.paid_amount, render: (c) => fmtMoney(c.paid_amount) },
    { key: 'debt', header: 'Còn nợ', numeric: true, sortValue: (c) => c.debt_amount, render: (c) => <span className="text-bad cell-main">{fmtMoney(c.debt_amount)}</span> },
    {
      key: 'end', header: 'Hết hạn', numeric: true, sortValue: (c) => c.end_date,
      render: (c) => (c.end_date ? <><div className="cell-main">{fmtDate(c.end_date)}</div><div className="cell-sub">{daysLeftText(c.end_date)}</div></> : <span className="hint-muted">-</span>),
    },
    { key: 'status', header: 'Trạng thái', render: (c) => { const s = memberStatus(c); return <Chip tone={s.tone}>{s.label}</Chip> } },
  ]

  return (
    <>
      <PageHeader title="Công nợ" sub="Hợp đồng còn thiếu tiền, xếp theo số nợ giảm dần. Bấm dòng để mở hợp đồng và thu tiền." />
      <KpiRow>
        <Kpi value={<span className="text-bad">{fmtMoney(totalDebt(rows))}</span>} label="Tổng công nợ" />
        <Kpi value={rows.length} label="Hợp đồng còn nợ" />
        <Kpi value={fmtMoney(rows[0]?.debt_amount ?? 0)} label="Khoản nợ lớn nhất" />
      </KpiRow>
      <div className="toolbar">
        <input className="input" type="search" placeholder="Tìm mã HĐ, tên, SĐT" aria-label="Tìm công nợ" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="grow"><span className="hint-muted">{filtered.length} hợp đồng</span></div>
      </div>
      <div className="card">
        <DataTable columns={columns} rows={filtered} rowKey={(c) => c.id} onRowClick={(c) => nav(`/contracts/${c.id}`)} defaultSort={{ key: 'debt', dir: 'desc' }} loading={loading} error={error} emptyText="Không có hợp đồng còn nợ" itemLabel="hợp đồng" />
      </div>
    </>
  )
}
