import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtMoney } from '../lib/format'
import { useBranch } from '../context/BranchContext'
import { DataTable, PageHeader, Panel, Select, type Column } from '../components/ui'

interface Item { name: string; group: 'gym' | 'pt'; contracts: number; revenue: number; average: number | null; share: number }
interface Data { days: number; total: number; groups: { key: 'gym' | 'pt'; revenue: number }[]; items: Item[] }

const RANGES = [{ v: 7, label: '7 ngày qua' }, { v: 30, label: '30 ngày qua' }, { v: 90, label: '90 ngày qua' }, { v: 365, label: '12 tháng qua' }]
const GROUP: Record<string, { label: string; color: string }> = { gym: { label: 'Gym', color: 'var(--brand)' }, pt: { label: 'PT', color: 'var(--c2)' } }
const pct = (x: number) => `${(x * 100).toFixed(1).replace('.', ',')}%`
const compact = (n: number) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} tr` : fmtMoney(n))

function Donut({ parts, total }: { parts: { color: string; value: number }[]; total: number }) {
  const r = 52
  const c = 2 * Math.PI * r
  let acc = 0
  return (
    <svg viewBox="0 0 140 140" width={150} height={150} role="img" aria-label="Tỷ trọng doanh thu">
      <circle cx="70" cy="70" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="22" />
      {total > 0 && parts.filter((p) => p.value > 0).map((p, i) => {
        const len = (p.value / total) * c
        const el = <circle key={i} cx="70" cy="70" r={r} fill="none" stroke={p.color} strokeWidth="22" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-acc} transform="rotate(-90 70 70)" />
        acc += len
        return el
      })}
      <text x="70" y="64" textAnchor="middle" fontSize="11" fill="var(--muted)">Tổng</text>
      <text x="70" y="84" textAnchor="middle" fontSize="16" fontWeight="700" fill="var(--ink)">{compact(total)}</text>
    </svg>
  )
}

export default function RevenueServices() {
  const { branchId } = useBranch()
  const [days, setDays] = useState(30)
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const r = await api.get<{ data: Data }>('/reports/revenue-services', { params: { days, branch_id: branchId ?? undefined } })
      setData(r.data.data)
    } catch (e) {
      setError(apiError(e).message)
    } finally {
      setLoading(false)
    }
  }, [days, branchId])
  useEffect(() => { load() }, [load])

  const columns: Column<Item>[] = [
    { key: 'name', header: 'Dịch vụ', sortValue: (i) => i.name, render: (i) => <><span className="cell-main">{i.name}</span><div className="cell-sub">{GROUP[i.group].label}</div></> },
    { key: 'contracts', header: 'Hợp đồng', className: 'num', sortValue: (i) => i.contracts, render: (i) => i.contracts },
    { key: 'revenue', header: 'Doanh thu', className: 'num', sortValue: (i) => i.revenue, render: (i) => fmtMoney(i.revenue) },
    { key: 'avg', header: 'Bình quân', className: 'num', sortValue: (i) => i.average ?? 0, render: (i) => (i.average == null ? '-' : fmtMoney(i.average)) },
    { key: 'share', header: 'Tỷ trọng', className: 'num', sortValue: (i) => i.share, render: (i) => pct(i.share) },
  ]

  return (
    <>
      <PageHeader
        title="Doanh thu theo dịch vụ"
        sub="Dịch vụ nào đang gánh doanh thu."
        action={<Select aria-label="Khoảng thời gian" value={days} onChange={(e) => setDays(Number(e.target.value))}>{RANGES.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}</Select>}
      />
      {error && <div className="form-error" role="alert">{error}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, alignItems: 'start' }}>
        <Panel title="Tỷ trọng">
          {data && (
            <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
              <Donut total={data.total} parts={data.groups.map((g) => ({ color: GROUP[g.key].color, value: g.revenue }))} />
              <ul className="plain-list" style={{ flex: 1, minWidth: 200 }}>
                {data.groups.map((g) => (
                  <li key={g.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                    <span><i className="ptg-sw" style={{ background: GROUP[g.key].color, display: 'inline-block', marginRight: 8 }} />{GROUP[g.key].label}</span>
                    <b>{compact(g.revenue)} ({pct(data.total > 0 ? g.revenue / data.total : 0)})</b>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
        <Panel title="Ghi chú">
          <p className="muted">Số liệu lấy từ các khoản thanh toán đã ghi nhận, đã trừ tiền hoàn. "Hợp đồng" là số hợp đồng có thanh toán trong kỳ. Bình quân là doanh thu chia cho số hợp đồng.</p>
        </Panel>
      </div>
      <div style={{ marginTop: 16 }}>
        <Panel title="Chi tiết theo gói" flush>
          <DataTable columns={columns} rows={data?.items ?? []} rowKey={(i) => `${i.group}-${i.name}`} loading={loading} error={error} emptyText="Chưa có doanh thu trong kỳ" itemLabel="gói" />
        </Panel>
      </div>
    </>
  )
}
