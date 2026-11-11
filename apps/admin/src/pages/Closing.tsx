import { Fragment, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { METHODS, METHOD_LABEL, fmtDateTime, fmtMoney, todayISO } from '../lib/format'
import { useBranch } from '../context/BranchContext'
import { Field, Input } from '../components/ui'
import type { Closing as ClosingT } from '../types'

export default function Closing() {
  const { branchId } = useBranch()
  const [date, setDate] = useState(todayISO())
  const [d, setD] = useState<ClosingT | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/reports/daily-closing', { params: { date, branch_id: branchId ?? undefined } })
      .then((r) => { setD(r.data.data); setError('') })
      .catch((e) => setError(apiError(e).message))
  }, [date, branchId])

  const itemsSum = d ? d.items.reduce((s, p) => s + p.amount, 0) : 0
  const matches = d ? itemsSum === d.total : true

  return (
    <>
      <div className="page-head"><h1>Chốt ngày</h1></div>
      <div className="filters">
        <Field label="Ngày" htmlFor="cl-date"><Input id="cl-date" type="date" value={date} onChange={(e) => setDate(e.target.value || todayISO())} /></Field>
      </div>
      {error && <div className="empty" role="alert">{error}</div>}
      {d && (
        <>
          <section className="card pad stack">
            <dl className="kv">
              {METHODS.map((m) => (
                <Fragment key={m}><dt>{METHOD_LABEL[m]}</dt><dd className="num">{fmtMoney(d.totals_by_method[m] ?? 0)}</dd></Fragment>
              ))}
              <dt><b>Tổng thu</b></dt><dd className="num"><b>{fmtMoney(d.total)}</b></dd>
            </dl>
            {!matches && <div className="form-error" role="alert">Tổng các dòng ({fmtMoney(itemsSum)}) không khớp tổng thu. Cần kiểm tra lại.</div>}
          </section>
          <h2 className="sec">Các khoản đã xác nhận</h2>
          <div className="card">
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Xác nhận lúc</th><th>Hợp đồng</th><th>Phương thức</th><th className="num">Số tiền</th></tr></thead>
                <tbody>
                  {d.items.map((p) => (
                    <tr key={p.id}>
                      <td>{fmtDateTime(p.confirmed_at)}</td>
                      <td>{p.contract?.code ?? p.contract_id}{p.contract?.member?.name ? ` - ${p.contract.member.name}` : ''}</td>
                      <td>{METHOD_LABEL[p.method]}</td>
                      <td className="num">{fmtMoney(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={3}>Tổng cộng</td><td className="num"><b>{fmtMoney(itemsSum)}</b></td></tr></tfoot>
              </table>
              {d.items.length === 0 && <div className="empty">Không có khoản thu nào</div>}
            </div>
          </div>
        </>
      )}
    </>
  )
}
