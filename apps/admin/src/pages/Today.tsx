import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { fmtDate, fmtMoney, todayISO } from '../lib/format'
import { buildTasks } from '../lib/tasks'
import { useAuth } from '../context/AuthContext'
import { useBranch } from '../context/BranchContext'
import { usePermission } from '../context/usePermission'
import { BranchTag, Button, EmptyState, Kpi, KpiRow, PageHeader, Panel } from '../components/ui'
import type { CheckinStats, Dashboard, DayTicketList, TodayTasks } from '../types'

const REFRESH_MS = 30000
const WEEKDAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy']

export default function Today() {
  const { user } = useAuth()
  const { branchId } = useBranch()
  const { can } = usePermission()
  const nav = useNavigate()
  const branches = useMemo(() => user?.branches ?? [], [user])
  const [stats, setStats] = useState<CheckinStats | null>(null)
  const [closingTotal, setClosingTotal] = useState<number | null>(null)
  const [tickets, setTickets] = useState<DayTicketList['meta'] | null>(null)
  const [dash, setDash] = useState<Dashboard | null>(null)
  const [tasks, setTasks] = useState<TodayTasks | null>(null)
  const canCheckin = !!user?.can_checkin && can('checkins.create')
  const canRead = can('checkins.read')
  const canDash = can('reports.view')
  const canTasks = can('contracts.read')
  const canRevenue = can('reports.view_revenue')
  const canTickets = can('day_tickets.read')
  const k = dash?.revenue_by_kind
  const revenue = canDash ? (k ? (k.member ?? 0) + (k.pt_1on1 ?? 0) + (k.pt_1on2 ?? 0) + (k.pt_group ?? 0) : null) : closingTotal

  const load = useCallback(async () => {
    const params = { branch_id: branchId ?? undefined }
    const jobs: Promise<void>[] = []
    if (canRead) jobs.push(api.get('/reports/checkin-stats', { params }).then((r) => setStats(r.data.data)).catch(() => {}))
    if (canTickets) jobs.push(api.get<DayTicketList>('/day-tickets', { params: { date: todayISO(), branch_id: branchId ?? undefined } }).then((r) => setTickets(r.data.meta)).catch(() => {}))
    if (canDash) jobs.push(api.get('/reports/dashboard', { params }).then((r) => setDash(r.data.data)).catch(() => {}))
    else if (canRevenue) jobs.push(api.get('/reports/daily-closing', { params }).then((r) => setClosingTotal(r.data.data.total)).catch(() => {}))
    if (canTasks) jobs.push(api.get('/reports/today-tasks', { params }).then((r) => setTasks(r.data.data)).catch(() => {}))
    await Promise.all(jobs)
  }, [canRead, canDash, canRevenue, canTasks, canTickets, branchId])

  useEffect(() => {
    load()
    const t = setInterval(load, REFRESH_MS)
    return () => clearInterval(t)
  }, [load])

  const now = new Date()
  const scope = branchId || branches.length === 1 ? (branches.find((b) => b.id === branchId) ?? branches[0])?.name : `Tất cả chi nhánh: ${branches.map((b) => b.name).join(', ')}`
  const sub = `${WEEKDAYS[now.getDay()]}, ${fmtDate(now.toISOString())}. ${scope ?? ''}`
  const rows = buildTasks(tasks)

  return (
    <>
      <PageHeader title="Hôm nay" sub={sub} action={can('reports.view') && <Button onClick={() => nav('/reports')}>Hiệu suất kinh doanh</Button>} />

      <KpiRow>
        <Kpi value={stats ? stats.totals.checkins_today : '-'} label="Khách check-in" />
        {stats && !canCheckin && <Kpi value={stats.totals.denied_today} label="Từ chối" />}
        <Kpi value={revenue != null ? fmtMoney(revenue) : '-'} label="Doanh thu" />
        <Kpi value={canDash ? dash?.new_contracts_today ?? '-' : '-'} label="Hợp đồng mới" />
        <Kpi value={canTasks && tasks ? fmtMoney(tasks.unpaid.total_debt) : '-'} label="Công nợ cần thu" />
        <Kpi value={canTasks && tasks ? tasks.expiring_in_2_days.count : '-'} label="Khách hết hạn" />
        {canTickets && <Kpi value={tickets ? fmtMoney(tickets.total) : '-'} label="Vé lẻ đã bán" />}
      </KpiRow>

      {!canCheckin && stats && (
        <div className="branch-panels">
          {stats.branches.map((b, i) => <BranchStat key={b.branch.id} s={b} color={`var(--c${(i % 6) + 1})`} />)}
        </div>
      )}

      {canTasks && (
        <Panel title="Cần xử lý" count={`${rows.length} việc`} flush>
          {rows.length === 0 && <EmptyState title="Không có việc cần xử lý" />}
          {rows.map((t) => (
            <div key={t.key} className="task">
              <span className={`task-rank rank-${t.tone}`}>{t.rank}</span>
              <div className="task-main">
                <div className="task-title">{t.title}</div>
                <div className="task-detail">{t.detail}</div>
              </div>
              <Button small onClick={() => nav(t.to)}>{t.actionLabel}</Button>
            </div>
          ))}
        </Panel>
      )}
    </>
  )
}

function BranchStat({ s, color }: { s: CheckinStats['branches'][number]; color: string }) {
  const max = Math.max(1, ...s.by_hour.map((h) => h.count))
  return (
    <section className="panel stat-card" aria-label={`Thống kê ${s.branch.name}`}>
      <div className="stat-head"><BranchTag branch={s.branch} /></div>
      <div className="stat-nums">
        <div><b>{s.checkins_today}</b><span>Lượt vào</span></div>
        <div><b className={s.denied_today ? 'text-bad' : ''}>{s.denied_today}</b><span>Từ chối</span></div>
        <div><b>{s.inside_now}</b><span>Đang tập</span></div>
      </div>
      <svg className="spark" viewBox="0 0 120 28" role="img" aria-label={`Lượt vào theo giờ, ${s.branch.name}`}>
        {s.by_hour.map((h, i) => <rect key={h.hour} x={i * 9} y={28 - (h.count / max) * 26} width={7} height={(h.count / max) * 26} rx={1.5} fill={color}><title>{`${h.hour}h: ${h.count}`}</title></rect>)}
      </svg>
    </section>
  )
}
