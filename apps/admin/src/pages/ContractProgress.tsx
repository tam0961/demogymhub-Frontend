import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtDate, fmtMoney, fmtTr } from '../lib/format'
import { useBranch } from '../context/BranchContext'
import { Chip, DataTable, Kpi, KpiRow, PageHeader, Panel, type Column, type ChipTone } from '../components/ui'

interface Recent { id: string; code: string; status: 'draft' | 'signed' | 'active' | 'frozen'; created_at: string; package: string; member: { name: string; code: string }; progress: number }
interface Data {
  summary: { total_value: number; paid: number; debt: number; debt_contracts: number; running: number; average_progress: number }
  buckets: number[]
  recent: Recent[]
}

const compact = (n: number) => (Math.abs(n) >= 1e6 ? fmtTr(n) : fmtMoney(n))
const STATUS: Record<Recent['status'], { label: string; tone: ChipTone }> = {
  active: { label: 'Còn hạn', tone: 'ok' },
  frozen: { label: 'Bảo lưu', tone: 'neutral' },
  draft: { label: 'Chờ ký', tone: 'warn' },
  signed: { label: 'Chưa kích hoạt', tone: 'warn' },
}
const BUCKETS = ['Mới dùng dưới 25%', '25 đến 50%', '50 đến 75%', 'Trên 75%, sắp hết']

function Bar({ ratio }: { ratio: number }) {
  return <div style={{ height: 8, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden', flex: 1 }}><div style={{ width: `${Math.round(ratio * 100)}%`, height: '100%', background: 'var(--brand)' }} /></div>
}

export default function ContractProgress() {
  const { branchId } = useBranch()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const r = await api.get<{ data: Data }>('/reports/contract-progress', { params: { branch_id: branchId ?? undefined } })
      setData(r.data.data)
    } catch (e) {
      setError(apiError(e).message)
    } finally {
      setLoading(false)
    }
  }, [branchId])
  useEffect(() => { load() }, [load])

  const s = data?.summary
  const max = Math.max(1, ...(data?.buckets ?? [0]))
  const columns: Column<Recent>[] = [
    { key: 'member', header: 'Hội viên', sortValue: (r) => r.member.name, render: (r) => <><span className="cell-main">{r.member.name}</span><div className="cell-sub">{r.member.code}</div></> },
    { key: 'code', header: 'Mã HĐ', render: (r) => <Link to={`/contracts/${r.id}`}>{r.code}</Link> },
    { key: 'date', header: 'Ngày ký', sortValue: (r) => r.created_at, render: (r) => fmtDate(r.created_at) },
    { key: 'pkg', header: 'Dịch vụ', render: (r) => r.package },
    { key: 'progress', header: 'Tiến độ', sortValue: (r) => r.progress, render: (r) => <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 160 }}><Bar ratio={r.progress} /><b style={{ width: 40, textAlign: 'right' }}>{Math.round(r.progress * 100)}%</b></div> },
    { key: 'status', header: 'Trạng thái', render: (r) => <Chip tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Chip> },
  ]

  return (
    <>
      <PageHeader title="Tiến độ hợp đồng" sub="Hợp đồng đã dùng tới đâu, còn lại bao nhiêu." />
      {error && <div className="form-error" role="alert">{error}</div>}
      <KpiRow>
        <Kpi value={s ? compact(s.total_value) : '-'} label="Tổng giá trị hợp đồng" note={s ? `${s.running} hợp đồng đang chạy` : undefined} />
        <Kpi value={s ? compact(s.paid) : '-'} label="Đã thanh toán" note={s && s.total_value > 0 ? `${((s.paid / s.total_value) * 100).toFixed(1).replace('.', ',')}%` : undefined} />
        <Kpi value={s ? compact(s.debt) : '-'} label="Còn nợ" note={s ? `${s.debt_contracts} hợp đồng` : undefined} />
        <Kpi value={s ? `${Math.round(s.average_progress * 100)}%` : '-'} label="Tiến độ sử dụng trung bình" note={s ? `Còn lại ${100 - Math.round(s.average_progress * 100)}% giá trị` : undefined} />
      </KpiRow>
      <Panel title="Phân bố tiến độ sử dụng" note="Hợp đồng gần hết mà chưa gia hạn là nhóm cần gọi trước">
        <div style={{ display: 'grid', gap: 10 }}>
          {BUCKETS.map((label, i) => (
            <div key={label} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 60px', gap: 12, alignItems: 'center' }}>
              <span>{label}</span>
              <Bar ratio={(data?.buckets[i] ?? 0) / max} />
              <b style={{ textAlign: 'right' }}>{data?.buckets[i] ?? 0} HĐ</b>
            </div>
          ))}
        </div>
      </Panel>
      <div style={{ marginTop: 16 }}>
        <Panel title="Hợp đồng ký gần đây" flush>
          <DataTable columns={columns} rows={data?.recent ?? []} rowKey={(r) => r.id} loading={loading} error={error} emptyText="Chưa có hợp đồng" itemLabel="hợp đồng" />
        </Panel>
      </div>
    </>
  )
}
