import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtDate, fmtMoney } from '../lib/format'
import { useBranch } from '../context/BranchContext'
import { RequirePermission } from '../context/usePermission'
import { ContractBadge, Pager, Tabs } from '../components/ui'
import type { Contract, ContractStatus, ListResp } from '../types'

const LIMIT = 10
type Filter = 'all' | ContractStatus
const TABS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'draft', label: 'Nháp' },
  { value: 'signed', label: 'Đã ký' },
  { value: 'active', label: 'Đang hiệu lực' },
  { value: 'frozen', label: 'Bảo lưu' },
  { value: 'expired', label: 'Hết hạn' },
  { value: 'cancelled', label: 'Đã hủy' },
]

export default function Contracts() {
  const { branchId } = useBranch()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [dq, setDq] = useState('')
  const [status, setStatus] = useState<Filter>('all')
  const [expiring, setExpiring] = useState(false)
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<Contract[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const t = setTimeout(() => {
      setDq(q)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get<ListResp<Contract>>('/contracts', {
        params: { q: dq || undefined, status: status === 'all' ? undefined : status, branch_id: branchId ?? undefined, expiring_within_days: expiring ? 7 : undefined, page, limit: LIMIT },
      })
      setRows(data.data)
      setTotal(data.meta.total)
    } catch (e) {
      setError(apiError(e).message)
    } finally {
      setLoading(false)
    }
  }, [dq, status, expiring, branchId, page])

  useEffect(() => {
    load()
  }, [load])

  return (
    <>
      <div className="page-head">
        <h1>Hợp đồng</h1>
        <RequirePermission permission="contracts.create">
          <Link className="btn btn-primary" to="/contracts/new">Tạo hợp đồng</Link>
        </RequirePermission>
      </div>
      <div className="toolbar">
        <input className="input" type="search" placeholder="Tìm theo mã HĐ, tên, SĐT" aria-label="Tìm hợp đồng" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="check">
          <input type="checkbox" checked={expiring} onChange={(e) => { setExpiring(e.target.checked); setPage(1) }} />
          Sắp hết hạn (7 ngày)
        </label>
      </div>
      <div className="toolbar">
        <Tabs tabs={TABS} value={status} onChange={(v) => { setStatus(v); setPage(1) }} />
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Mã HĐ</th>
                <th>Hội viên</th>
                <th>Gói</th>
                <th>Trạng thái</th>
                <th className="num">Hết hạn</th>
                <th className="num">Tổng tiền</th>
                <th className="num">Còn nợ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="clickable" onClick={() => nav(`/contracts/${c.id}`)}>
                  <td><Link to={`/contracts/${c.id}`} onClick={(e) => e.stopPropagation()}>{c.code}</Link></td>
                  <td><b>{c.member.name}</b><div className="hint-muted">{c.member.code}</div></td>
                  <td>{c.package.name}</td>
                  <td><ContractBadge status={c.status} /></td>
                  <td className="num">{fmtDate(c.end_date)}</td>
                  <td className="num">{fmtMoney(c.total_amount)}</td>
                  <td className={`num ${c.debt_amount > 0 ? 'text-bad' : ''}`}>{fmtMoney(c.debt_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && <div className="empty">Đang tải...</div>}
          {!loading && error && <div className="empty" role="alert">{error}</div>}
          {!loading && !error && rows.length === 0 && <div className="empty">Không có hợp đồng phù hợp</div>}
        </div>
        <Pager page={page} limit={LIMIT} total={total} onPage={setPage} />
      </div>
    </>
  )
}
