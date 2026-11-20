import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtDate, fmtMoney } from '../lib/format'
import { POSITION_LABEL, ptSalesTotal } from '../lib/payroll'
import { Chip, EmptyState, Panel } from '../components/ui'
import type { PtStatRow, PtStats } from '../types'

const wrap = { overflowX: 'auto' as const }
const stat = { display: 'flex', flexDirection: 'column' as const, gap: 2, minWidth: 120 }
const h3 = { fontSize: 14, margin: '0 0 6px' }

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={stat}>
      <span className="cell-sub">{label}</span>
      <b style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</b>
    </div>
  )
}

function PtCard({ row, month }: { row: PtStatRow; month: string }) {
  const [open, setOpen] = useState(false)
  const bodyId = `pt-stat-${row.user_id}`
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-md)', background: 'var(--surface)', marginBottom: 10 }}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen(!open)}
        style={{ all: 'unset', boxSizing: 'border-box', width: '100%', cursor: 'pointer', display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', padding: '12px 16px' }}
      >
        <div style={{ minWidth: 150, flex: '1 1 150px' }}>
          <span className="cell-main">{row.name}</span>
          <div className="cell-sub">{POSITION_LABEL[row.position]}</div>
        </div>
        <Stat label="Khách đang dạy" value={String(row.clients.length)} />
        <Stat label="Buổi dạy trong tháng" value={String(row.sessions_taught)} />
        <Stat label="Lớp PT nhóm" value={String(row.group_classes)} />
        <Stat label="Doanh số thực thu" value={fmtMoney(ptSalesTotal(row))} />
        <span aria-hidden="true" className="cell-sub">{open ? 'Thu gọn' : 'Chi tiết'}</span>
      </button>
      {open && (
        <div id={bodyId} style={{ borderTop: '1px solid var(--line)', padding: '12px 16px', display: 'grid', gap: 16 }}>
          <section aria-label={`Khách hàng đang dạy của ${row.name}`}>
            <h3 style={h3}>Khách hàng đang dạy</h3>
            {row.clients.length === 0 ? (
              <EmptyState title="Chưa có khách đang dạy" />
            ) : (
              <div className="table-wrap" style={wrap}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Khách hàng</th>
                      <th>Mã</th>
                      <th>Gói</th>
                      <th className="num">Đã dạy tháng này / còn lại</th>
                      <th className="num">Tổng buổi</th>
                      <th>Hết hạn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.clients.map((c) => (
                      <tr key={c.contract_id}>
                        <td>{c.member_name}</td>
                        <td>{c.member_code}</td>
                        <td>{c.package_name}</td>
                        <td className="num">{c.taught_in_month} / {c.sessions_left ?? 0}</td>
                        <td className="num">{c.sessions_total ?? '-'}</td>
                        <td>{fmtDate(c.end_date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-label={`Lớp PT nhóm của ${row.name}`}>
            <h3 style={h3}>Lớp PT nhóm đã dạy ({row.group_classes})</h3>
            {row.classes.length === 0 ? (
              <div className="cell-sub">Không có lớp nào trong tháng {month}.</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {row.classes.map((k) => (
                  <Chip key={k.id}>{k.title} - {fmtDate(k.start_at)}</Chip>
                ))}
              </div>
            )}
          </section>

          <section aria-label={`Doanh số của ${row.name}`}>
            <h3 style={h3}>
              Doanh số bán gói: {fmtMoney(ptSalesTotal(row))}
              <span className="cell-sub"> (gói member {fmtMoney(row.member_sales)}, gói PT {fmtMoney(row.pt_sales)})</span>
            </h3>
            {row.sales.length === 0 ? (
              <div className="cell-sub">Chưa có khoản thực thu nào trong tháng {month}.</div>
            ) : (
              <div className="table-wrap" style={wrap}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Khách hàng</th>
                      <th>Gói</th>
                      <th>Loại</th>
                      <th className="num">Thực thu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.sales.map((s) => (
                      <tr key={s.contract_id}>
                        <td>{s.member_name}</td>
                        <td>{s.package_name}</td>
                        <td>{s.kind === 'pt' ? 'Gói PT' : 'Gói member'}</td>
                        <td className="num">{fmtMoney(s.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

export function PtStatsSection({ month, branchId }: { month: string; branchId?: string | null }) {
  const [data, setData] = useState<PtStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    setLoading(true)
    setError('')
    api
      .get<{ data: PtStats }>('/payroll/pt-stats', { params: { month, branch_id: branchId ?? undefined } })
      .then(({ data: r }) => {
        if (live) setData(r.data)
      })
      .catch((e) => {
        if (!live) return
        setError(apiError(e).message)
        setData(null)
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [month, branchId])

  return (
    <div style={{ marginTop: 16 }}>
      <Panel title="Thống kê từng PT" count={`${data?.rows.length ?? 0} PT`}>
        {loading && <div className="cell-sub">Đang tải...</div>}
        {!loading && error && <div role="alert" className="text-bad">{error}</div>}
        {!loading && !error && data?.rows.length === 0 && <EmptyState title="Chưa có PT nào được tính lương" />}
        {!loading && !error && data?.rows.map((r) => <PtCard key={r.user_id} row={r} month={month} />)}
      </Panel>
    </div>
  )
}
