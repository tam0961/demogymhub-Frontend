import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { Panel } from './ui'

const DAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
const HOURS = Array.from({ length: 24 }, (_, h) => h)

interface HeatData { total_checkins: number; heatmap: number[][] }

export function CheckinHeatmap({ branchId }: { branchId?: string }) {
  const [d, setD] = useState<HeatData | null>(null)
  useEffect(() => {
    api.get<{ data: HeatData }>('/reports/checkin-heatmap', { params: { branch_id: branchId } }).then((r) => setD(r.data.data)).catch(() => setD(null))
  }, [branchId])

  const rows = d?.heatmap ?? DAYS.map(() => HOURS.map(() => 0))
  const max = Math.max(1, ...rows.flat())
  return (
    <Panel title="Bản đồ nhiệt check-in" note={`${d?.total_checkins ?? 0} lượt, ô càng đậm càng đông`}>
      <div className="hm" role="img" aria-label="Bản đồ nhiệt check-in theo thứ và giờ trong 30 ngày">
        <div className="hm-row hm-head">
          <span />
          {HOURS.map((h) => <span key={h} className="hm-h">{h % 6 === 0 ? h : ''}</span>)}
        </div>
        {rows.map((r, di) => (
          <div key={DAYS[di]} className="hm-row">
            <span className="hm-d">{DAYS[di]}</span>
            {HOURS.map((h) => {
              const v = r[h] ?? 0
              return <i key={h} className="hm-c" title={`${DAYS[di]}, ${h}h: ${v} lượt`} style={{ background: `color-mix(in srgb, var(--brand) ${v ? Math.max(14, Math.round((v / max) * 100)) : 0}%, #fffaf0)` }} />
            })}
          </div>
        ))}
      </div>
      <p className="hint-muted hm-foot">Dùng để xếp ca lễ tân, huấn luyện viên và định giá khung giờ vàng.</p>
    </Panel>
  )
}
