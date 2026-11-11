import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { METHODS, METHOD_LABEL, fmtDateTime, fmtMoney, todayISO } from '../lib/format'
import { useBranch } from '../context/BranchContext'
import { Chip, DataTable, Input, Kpi, KpiRow, PageHeader, Panel, type Column } from '../components/ui'
import type { Closing as ClosingT, Payment } from '../types'

export default function Closing() {
  const { branchId } = useBranch()
  const [date, setDate] = useState(todayISO())
  const [d, setD] = useState<ClosingT | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/reports/daily-closing', { params: { date, branch_id: branchId ?? undefined } })
      .then((r) => {
        const raw = r.data.data
        setD({ ...raw, totals_by_method: raw.totals_by_method ?? raw.by_method ?? {}, items: raw.items ?? raw.transactions ?? [] })
        setError('')
      })
      .catch((e) => setError(apiError(e).message))
  }, [date, branchId])

  const itemsSum = d ? d.items.reduce((s, p) => s + p.amount, 0) : 0
  const matches = d ? itemsSum === d.total : true
  const cols: Column<Payment>[] = [
    { key: 'at', header: 'Xác nhận lúc', sortValue: (p) => p.confirmed_at, render: (p) => fmtDateTime(p.confirmed_at) },
    { key: 'c', header: 'Hợp đồng', render: (p) => <><div className="cell-main">{p.contract?.code ?? p.contract_id}</div><div className="cell-sub">{p.contract?.member?.name ?? ''}</div></> },
    { key: 'm', header: 'Hình thức', render: (p) => METHOD_LABEL[p.method] },
    { key: 'a', header: 'Số tiền', numeric: true, sortValue: (p) => p.amount, render: (p) => fmtMoney(p.amount) },
  ]

  return (
    <>
      <PageHeader title="Chốt ngày" sub="Các khoản đã xác nhận trong ngày" action={<Input aria-label="Ngày chốt" type="date" value={date} onChange={(e) => setDate(e.target.value || todayISO())} />} />
      {error && <div className="form-error" role="alert">{error}</div>}
      {d && (
        <>
          <KpiRow>
            <Kpi value={fmtMoney(d.total)} label="Tổng thu" />
            {METHODS.map((m) => <Kpi key={m} value={fmtMoney(d.totals_by_method[m] ?? 0)} label={METHOD_LABEL[m]} />)}
            <Kpi value={<Chip tone={matches ? 'ok' : 'bad'}>{matches ? 'Khớp' : 'Lệch'}</Chip>} label="Đối chiếu các dòng" />
          </KpiRow>
          {!matches && <div className="form-error" role="alert" style={{ marginBottom: 12 }}>Tổng các dòng ({fmtMoney(itemsSum)}) không khớp tổng thu. Cần kiểm tra lại.</div>}
          <Panel title="Các khoản đã xác nhận" count={`${d.items.length} khoản`} flush>
            <DataTable columns={cols} rows={d.items} rowKey={(p) => p.id} emptyText="Không có khoản thu nào" itemLabel="khoản" />
            <div className="totals-row"><span>Tổng cộng</span><b className="num">{fmtMoney(itemsSum)}</b></div>
          </Panel>
        </>
      )}
    </>
  )
}
