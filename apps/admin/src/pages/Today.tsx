import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtDate, fmtMoney, fmtTime, reasonText } from '../lib/format'
import { buildTasks } from '../lib/tasks'
import { useAuth } from '../context/AuthContext'
import { useBranch } from '../context/BranchContext'
import { usePermission } from '../context/usePermission'
import { FormDialog } from '../components/Dialogs'
import { BranchTag, Button, Chip, EmptyState, Icon, Kpi, KpiRow, PageHeader, Panel, useToast } from '../components/ui'
import type { CheckinItem, CheckinResult, CheckinStats, Dashboard, ListResp, Member, TodayTasks } from '../types'

const REFRESH_MS = 30000
const WEEKDAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy']

export default function Today() {
  const { user } = useAuth()
  const { branchId } = useBranch()
  const { can } = usePermission()
  const toast = useToast()
  const nav = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const branches = useMemo(() => user?.branches ?? [], [user])
  const [code, setCode] = useState('')
  const [matches, setMatches] = useState<Member[]>([])
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<CheckinResult | null>(null)
  const [err, setErr] = useState('')
  const [stats, setStats] = useState<CheckinStats | null>(null)
  const [live, setLive] = useState<{ count: number; items: CheckinItem[] }>({ count: 0, items: [] })
  const [recent, setRecent] = useState<CheckinItem[]>([])
  const [dash, setDash] = useState<Dashboard | null>(null)
  const [tasks, setTasks] = useState<TodayTasks | null>(null)
  const [override, setOverride] = useState(false)
  const [oErr, setOErr] = useState('')
  const canCheckin = !!user?.can_checkin && can('checkins.create')
  const canRead = can('checkins.read')
  const canDash = can('reports.view')
  const canTasks = can('contracts.read')

  const load = useCallback(async () => {
    const params = { branch_id: branchId ?? undefined }
    const jobs: Promise<void>[] = []
    if (canRead) {
      jobs.push(api.get('/checkins/live', { params }).then((r) => setLive(r.data.data)).catch(() => {}))
      jobs.push(api.get<ListResp<CheckinItem>>('/checkins', { params: { ...params, page: 1, limit: 12 } }).then((r) => setRecent(r.data.data)).catch(() => {}))
    }
    if (canRead && !canCheckin) jobs.push(api.get('/reports/checkin-stats', { params }).then((r) => setStats(r.data.data)).catch(() => {}))
    if (canDash) jobs.push(api.get('/reports/dashboard', { params }).then((r) => setDash(r.data.data)).catch(() => {}))
    if (canTasks) jobs.push(api.get('/reports/today-tasks', { params }).then((r) => setTasks(r.data.data)).catch(() => {}))
    await Promise.all(jobs)
  }, [canRead, canCheckin, canDash, canTasks, branchId])

  useEffect(() => {
    load()
    const t = setInterval(load, REFRESH_MS)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    const k = code.trim()
    if (k.length < 2) { setMatches([]); return }
    setSearching(true)
    const t = setTimeout(() => {
      api.get('/members', { params: { q: k, branch_id: branchId ?? undefined, limit: 6 } })
        .then((r) => setMatches(r.data.data as Member[]))
        .catch(() => setMatches([]))
        .finally(() => setSearching(false))
    }, 250)
    return () => clearTimeout(t)
  }, [code, branchId])

  const checkin = async (memberId: string) => {
    setBusy(true)
    setErr('')
    try {
      const { data } = await api.post('/checkins', { member_id: memberId, direction: 'in' })
      setRes(data.data)
      const r: CheckinResult = data.data
      if (r.member) {
        try {
          const pv = await api.get('/attendance/scan-preview', { params: { member_id: r.member.id } })
          window.dispatchEvent(new CustomEvent('gh-scan-popup', { detail: { id: `manual-${Date.now()}`, employee_no: r.member.code, scanned_at: new Date().toISOString(), result: r.result, reason: r.reason, member: pv.data.data.member } }))
        } catch { /* popup là phần phụ: bỏ qua nếu lỗi */ }
      }
      load()
    } catch (x) {
      setRes(null)
      setErr(apiError(x).message)
    } finally {
      setBusy(false)
      setCode('')
      setMatches([])
      inputRef.current?.focus()
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const v = code.trim()
    if (!v) return
    if (matches.length === 1) checkin(matches[0].id)
    else if (matches.length > 1) setErr('Có nhiều hội viên khớp, hãy bấm chọn đúng người trong danh sách')
    else setErr(searching ? 'Đang tìm hội viên...' : 'Không tìm thấy hội viên với tên hoặc số điện thoại này')
  }

  const doOverride = async (reason: string) => {
    if (!res?.member) return
    setOErr('')
    try {
      const { data } = await api.post('/checkins/override', { member_id: res.member.id, reason })
      setRes(data.data)
      setOverride(false)
      toast('Đã mở thủ công')
      load()
    } catch (x) {
      setOErr(apiError(x).message)
    }
  }

  const now = new Date()
  const scope = branchId || branches.length === 1 ? (branches.find((b) => b.id === branchId) ?? branches[0])?.name : `Tất cả chi nhánh: ${branches.map((b) => b.name).join(', ')}`
  const sub = `${WEEKDAYS[now.getDay()]}, ${fmtDate(now.toISOString())}. ${scope ?? ''}`
  const liveIds = new Set(live.items.map((i) => i.id))
  const rows = buildTasks(tasks)

  return (
    <>
      <PageHeader title="Hôm nay" sub={sub} action={can('reports.view') && <Button onClick={() => nav('/reports')}>Hiệu suất kinh doanh</Button>} />

      {!canCheckin && <div className="info-banner" role="note">Chế độ xem thống kê: tài khoản quản trị không thực hiện check-in.</div>}

      {canCheckin && (
        <>
          <form className="checkin-box" onSubmit={submit}>
            <label className="checkin-label" htmlFor="checkin-code"><Icon name="checkin" size={22} />Check-in</label>
            <input id="checkin-code" ref={inputRef} className="input" placeholder="Nhập tên hoặc số điện thoại hội viên" autoFocus autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} />
            <button type="submit" className="go" disabled={busy}>{busy ? 'Đang kiểm tra...' : 'Check-in'}</button>
          </form>
          {matches.length > 0 && (
            <div className="match-list" role="listbox" aria-label="Hội viên khớp">
              {matches.map((m) => (
                <button key={m.id} type="button" role="option" aria-selected={false} className="match-item" disabled={busy} onClick={() => checkin(m.id)}>
                  <span className="cell-main">{m.name}</span>
                  <span className="cell-sub">{m.code} · {m.phone}</span>
                </button>
              ))}
            </div>
          )}
          {user?.checkin_branch && (
            <div className="checkin-at-static">
              <span>Check-in tại</span>
              <BranchTag branch={user.checkin_branch} />
            </div>
          )}
        </>
      )}

      {err && <div className="form-error checkin-result" role="alert">{err}</div>}

      {res && (
        <section className={`card result checkin-result ${res.result === 'allowed' ? 'result-ok' : 'result-bad'}`} role="status" aria-live="assertive">
          <div className="result-title">{res.result === 'allowed' ? 'Cho vào' : 'Từ chối'}</div>
          {res.result === 'denied' && <div className="result-reason">{reasonText(res.reason)}</div>}
          {res.member && <div><b>{res.member.name}</b> - {res.member.code}</div>}
          {res.contract && (
            <div className="result-sub">
              {res.contract.code}
              {res.contract.end_date ? ` - hết hạn ${fmtDate(res.contract.end_date)}` : ''}
              {res.contract.sessions_left != null ? ` - còn ${res.contract.sessions_left} buổi` : ''}
            </div>
          )}
          {res.result === 'denied' && res.member && canCheckin && can('checkins.override') && (
            <div><Button variant="danger" onClick={() => setOverride(true)}>Mở thủ công</Button></div>
          )}
        </section>
      )}

      {!canCheckin && stats ? (
        <>
          <KpiRow>
            <Kpi value={stats.totals.checkins_today} label="Lượt vào hôm nay" />
            <Kpi value={stats.totals.denied_today} label="Từ chối hôm nay" />
            <Kpi value={stats.totals.inside_now} label="Khách đã check-in hôm nay" />
          </KpiRow>
          <div className="branch-panels">
            {stats.branches.map((b, i) => <BranchStat key={b.branch.id} s={b} color={`var(--c${(i % 6) + 1})`} />)}
          </div>
        </>
      ) : (
      <KpiRow>
        <Kpi value={canDash ? dash?.checkins_today ?? '-' : recent.filter((r) => r.result === 'allowed').length} label="Lượt vào hôm nay" />
        <Kpi value={canRead ? live.count : '-'} label="Khách đã check-in hôm nay" />
        <Kpi value={canDash && dash ? fmtMoney(dash.revenue_today) : '-'} label="Thu hôm nay" />
        <Kpi value={canDash ? dash?.new_contracts_today ?? '-' : '-'} label="Hợp đồng mới hôm nay" />
      </KpiRow>
      )}

      <div className="today-grid">
        {canTasks && (
          <Panel title="Cần xử lý hôm nay" count={`${rows.length} việc`} flush>
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
        {canRead && (
          <Panel title="Lượt check-in gần đây" note="Tự làm mới mỗi 30 giây" flush>
            {recent.length === 0 && <EmptyState title="Chưa có lượt check-in" />}
            {recent.map((r) => {
              const inside = liveIds.has(r.id)
              return (
                <div key={r.id} className={`recent ${inside ? 'is-live' : ''}`}>
                  <span className="recent-time">{fmtTime(r.checked_in_at ?? r.created_at)}</span>
                  <div className="recent-main">
                    <div className="cell-main">{r.member.name}</div>
                    <div className="cell-sub">{r.member.code}{r.result === 'denied' ? ` - ${reasonText(r.reason)}` : ''}</div>
                  </div>
                  {r.result === 'denied' ? <Chip tone="bad">Từ chối</Chip> : <Chip tone="ok">Đã check-in</Chip>}
                </div>
              )
            })}
          </Panel>
        )}
      </div>

      {override && res?.member && (
        <FormDialog
          title={`Mở thủ công cho ${res.member.name}`}
          danger
          confirmLabel="Mở thủ công"
          error={oErr}
          onClose={() => setOverride(false)}
          onSubmit={doOverride}
        />
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
