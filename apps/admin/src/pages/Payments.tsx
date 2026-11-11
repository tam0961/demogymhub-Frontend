import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { METHODS, METHOD_LABEL, PAY_STATUS, fmtDateTime, fmtMoney } from '../lib/format'
import { useBranch } from '../context/BranchContext'
import { useShift } from '../context/ShiftContext'
import { Field, Pager, PayBadge, Select, Input } from '../components/ui'
import type { ListResp, Payment } from '../types'

const LIMIT = 15

export default function Payments() {
  const { branchId } = useBranch()
  const { shift } = useShift()
  const [date, setDate] = useState('')
  const [method, setMethod] = useState('')
  const [status, setStatus] = useState('')
  const [shiftOnly, setShiftOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<Payment[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get<ListResp<Payment>>('/payments', {
        params: { date: date || undefined, method: method || undefined, status: status || undefined, shift_id: shiftOnly && shift ? shift.id : undefined, branch_id: branchId ?? undefined, page, limit: LIMIT },
      })
      setRows(data.data)
      setTotal(data.meta.total)
    } catch (e) {
      setError(apiError(e).message)
    } finally {
      setLoading(false)
    }
  }, [date, method, status, shiftOnly, shift, branchId, page])
  useEffect(() => {
    load()
  }, [load])

  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setPage(1)
  }
  const confirmedSum = rows.filter((p) => p.status === 'confirmed').reduce((s, p) => s + p.amount, 0)
  const pendingSum = rows.filter((p) => p.status === 'pending').reduce((s, p) => s + p.amount, 0)

  return (
    <>
      <div className="page-head"><h1>Thanh toán</h1></div>
      <div className="filters">
        <Field label="Ngày" htmlFor="f-date"><Input id="f-date" type="date" value={date} onChange={(e) => reset(setDate)(e.target.value)} /></Field>
        <Field label="Phương thức" htmlFor="f-method">
          <Select id="f-method" value={method} onChange={(e) => reset(setMethod)(e.target.value)}>
            <option value="">Tất cả</option>
            {METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
          </Select>
        </Field>
        <Field label="Trạng thái" htmlFor="f-status">
          <Select id="f-status" value={status} onChange={(e) => reset(setStatus)(e.target.value)}>
            <option value="">Tất cả</option>
            {Object.entries(PAY_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </Field>
        <Field label="Ca" htmlFor="f-shift">
          <Select id="f-shift" value={shiftOnly ? 'cur' : ''} onChange={(e) => reset(setShiftOnly)(e.target.value === 'cur')}>
            <option value="">Tất cả ca</option>
            <option value="cur" disabled={!shift}>Ca hiện tại</option>
          </Select>
        </Field>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Thời gian</th><th>Hợp đồng</th><th>Phương thức</th><th>Trạng thái</th><th className="num">Số tiền</th></tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>{fmtDateTime(p.created_at)}</td>
                  <td>{p.contract ? <Link to={`/contracts/${p.contract_id}`}>{p.contract.code}</Link> : p.contract_id}{p.contract?.member ? ` - ${p.contract.member.name}` : ''}</td>
                  <td>{METHOD_LABEL[p.method]}</td>
                  <td><PayBadge status={p.status} /></td>
                  <td className="num">{fmtMoney(p.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={4}>Tổng đã thu (trang này)</td><td className="num"><b>{fmtMoney(confirmedSum)}</b></td></tr>
              {pendingSum > 0 && <tr><td colSpan={4}>Chờ xác nhận (chưa tính)</td><td className="num">{fmtMoney(pendingSum)}</td></tr>}
            </tfoot>
          </table>
          {loading && <div className="empty">Đang tải...</div>}
          {!loading && error && <div className="empty" role="alert">{error}</div>}
          {!loading && !error && rows.length === 0 && <div className="empty">Không có giao dịch</div>}
        </div>
        <Pager page={page} limit={LIMIT} total={total} onPage={setPage} />
      </div>
    </>
  )
}
