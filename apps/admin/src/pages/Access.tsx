import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { fetchAll } from '../lib/fetchAll'
import { apiError } from '../lib/errors'
import { fmtDateTime, fmtMoney, fmtTime, reasonText } from '../lib/format'
import { useAuth } from '../context/AuthContext'
import { useBranch } from '../context/BranchContext'
import { usePermission } from '../context/usePermission'
import { BranchTag, Button, Chip, DataTable, EmptyState, Icon, Kpi, KpiRow, PageHeader, Panel, Select, type Column } from '../components/ui'
import { DayTicketSale } from '../components/DayTicketSale'
import type { CheckinItem, CheckinResult, CheckinStats, Member } from '../types'

const REFRESH_MS = 30000

function HourChart({ rows }: { rows: { hour: number; count: number }[] }) {
  const max = Math.max(4, ...rows.map((r) => r.count))
  return (
    <div className="hourchart" role="img" aria-label="Lượt vào theo giờ hôm nay">
      <div className="hc-plot">
        {[1, 0.5, 0].map((t) => <div key={t} className="hc-line" style={{ bottom: `${t * 100}%` }}><span>{Math.round(max * t)}</span></div>)}
        <div className="hc-bars">
          {rows.map((r) => <div key={r.hour} className="hc-col" title={`${r.hour}h: ${r.count} lượt`}><i style={{ height: `${(r.count / max) * 100}%` }} /></div>)}
        </div>
      </div>
      <div className="hc-x">{rows.map((r, i) => <span key={r.hour}>{i % 2 === 0 ? `${r.hour}h` : ''}</span>)}</div>
    </div>
  )
}

function AccessLog() {
  const { user } = useAuth()
  const { branchId } = useBranch()
  const { can } = usePermission()
  const canCheckin = !!user?.can_checkin && can('checkins.create')
  const inputRef = useRef<HTMLInputElement>(null)
  const branches = useMemo(() => user?.branches ?? [], [user])
  const [live, setLive] = useState<CheckinItem[]>([])
  const [rows, setRows] = useState<CheckinItem[]>([])
  const [date, setDate] = useState('')
  const [result, setResult] = useState('')
  const [fBranch, setFBranch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [code, setCode] = useState('')
  const [matches, setMatches] = useState<Member[]>([])
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<CheckinResult | null>(null)
  const [err, setErr] = useState('')
  const [stats, setStats] = useState<CheckinStats | null>(null)

  const canPt = can('pt_sessions.read')
  const [ptOut, setPtOut] = useState<number | null>(null)
  const canTickets = can('day_tickets.read')
  const [ticketTotal, setTicketTotal] = useState<number | null>(null)
  const ownBranch = canCheckin ? user?.checkin_branch?.id : undefined
  const bid = ownBranch || fBranch || branchId || undefined
  const load = useCallback(async () => {
    setError('')
    try {
      const day = new Date().toISOString().slice(0, 10)
      const [l, h, st, pt, tk] = await Promise.all([
        api.get('/checkins/live', { params: { branch_id: bid } }),
        fetchAll<CheckinItem>('/checkins', { date: date || undefined, result: result || undefined, branch_id: bid }, 5),
        api.get('/reports/checkin-stats', { params: { branch_id: bid } }).then((r) => r.data.data as CheckinStats).catch(() => null),
        canPt ? api.get<{ data: { status: string }[] }>('/pt/sessions', { params: { from: day, to: day, branch_id: bid } }).then((r) => r.data.data.filter((s) => s.status === 'completed').length).catch(() => null) : Promise.resolve(null),
        canTickets ? api.get<{ meta: { total: number } }>('/day-tickets', { params: { date: day, branch_id: bid } }).then((r) => r.data.meta.total).catch(() => null) : Promise.resolve(null),
      ])
      setTicketTotal(tk)
      setPtOut(pt)
      setStats(st)
      setLive(l.data.data.items)
      setRows(h)
    } catch (e) {
      setError(apiError(e).message)
    } finally {
      setLoading(false)
    }
  }, [bid, date, result, canPt, canTickets])

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
      api.get('/members', { params: { q: k, branch_id: bid, limit: 6 } })
        .then((r) => setMatches(r.data.data as Member[]))
        .catch(() => setMatches([]))
        .finally(() => setSearching(false))
    }, 250)
    return () => clearTimeout(t)
  }, [code, bid])

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

  const shown = (stats?.branches ?? []).filter((b) => !ownBranch || b.branch.id === ownBranch)
  const hourRows = Array.from({ length: 17 }, (_, i) => ({
    hour: 6 + i,
    count: (stats?.branches ?? []).filter((b) => !ownBranch || b.branch.id === ownBranch).reduce((t, b) => t + (b.by_hour.find((h) => h.hour === 6 + i)?.count ?? 0), 0),
  }))
  const columns: Column<CheckinItem>[] = [
    { key: 'at', header: 'Giờ vào', sortValue: (c) => c.checked_in_at ?? c.created_at, render: (c) => fmtDateTime(c.checked_in_at ?? c.created_at) },
    { key: 'member', header: 'Hội viên', sortValue: (c) => c.member.name, render: (c) => <><div className="cell-main">{c.member.name}</div><div className="cell-sub">{c.member.code}</div></> },
    { key: 'result', header: 'Kết quả', sortValue: (c) => c.result, render: (c) => <Chip tone={c.result === 'allowed' ? 'ok' : 'bad'}>{c.result === 'allowed' ? 'Cho vào' : 'Từ chối'}</Chip> },
    { key: 'reason', header: 'Lý do', render: (c) => (c.result === 'denied' ? reasonText(c.reason) : <span className="hint-muted">-</span>) },
  ]

  return (
    <>
      <PageHeader title="Check-in" sub="Lượt check-in theo thời gian thực, tự làm mới mỗi 30 giây" />
      {!canCheckin && <div className="view-note" role="note">Tài khoản quản trị chỉ xem thống kê</div>}

      <div className={`access-top ${can('day_tickets.create') || canCheckin ? 'with-sale' : ''}`}>
      {(can('day_tickets.create') || canCheckin) && (
        <div className="access-left">
          {can('day_tickets.create') && <DayTicketSale />}
          {canCheckin && (
            <Panel title="Check-in thủ công">
              <form className="inline-form" onSubmit={submit}>
                <label className="sr-only" htmlFor="ac-code">Tên hoặc số điện thoại hội viên</label>
                <input id="ac-code" ref={inputRef} className="input" placeholder="Tên hoặc số điện thoại" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} />
                <Button variant="primary" type="submit" disabled={busy}><Icon name="checkin" size={16} />{busy ? 'Đang kiểm tra...' : 'Check-in'}</Button>
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
              {err && <div className="form-error" role="alert" style={{ marginTop: 10 }}>{err}</div>}
              {res && (
                <div className={`mini-result ${res.result === 'allowed' ? 'ok' : 'bad'}`} role="status" aria-live="assertive">
                  <b>{res.result === 'allowed' ? 'Cho vào' : 'Từ chối'}</b>
                  {res.member && <span>{res.member.name} - {res.member.code}</span>}
                  {res.result === 'denied' && <span>{reasonText(res.reason)}</span>}
                </div>
              )}
            </Panel>
          )}
        </div>
      )}
      {stats && (
        <div className="access-stats">
        {shown.length === 1 ? (
          <KpiRow>
            <Kpi value={shown[0].checkins_today} label="Lượt vào" />
            <Kpi value={<span className={shown[0].denied_today ? 'text-bad' : ''}>{shown[0].denied_today}</span>} label="Từ chối" />
            {canPt && <Kpi value={ptOut ?? '-'} label="PT check-out" />}
            {canTickets && <Kpi value={ticketTotal != null ? fmtMoney(ticketTotal) : '-'} label="Vé lẻ" />}
          </KpiRow>
        ) : (
          <div className="stat-cards">
            {shown.map((b) => (
              <section key={b.branch.id} className="panel stat-card" aria-label={`Thống kê ${b.branch.name}`}>
                <div className="stat-head"><BranchTag branch={b.branch} /></div>
                <div className="stat-nums">
                  <div><b>{b.checkins_today}</b><span>Lượt vào</span></div>
                  <div><b className={b.denied_today ? 'text-bad' : ''}>{b.denied_today}</b><span>Từ chối</span></div>
                </div>
              </section>
            ))}
            {!ownBranch && stats.branches.length > 1 && (
              <section className="panel stat-card" aria-label="Tổng các chi nhánh">
                <div className="stat-head"><b>Tổng</b></div>
                <div className="stat-nums">
                  <div><b>{stats.totals.checkins_today}</b><span>Lượt vào</span></div>
                  <div><b>{stats.totals.denied_today}</b><span>Từ chối</span></div>
                </div>
              </section>
            )}
          </div>
        )}
        <Panel title="Lượt vào theo giờ" note="Hôm nay">
          <HourChart rows={hourRows} />
        </Panel>
        </div>
      )}
      </div>

      <div style={{ marginTop: 16 }}>
        <Panel title="Đã check-in hôm nay" count={`${live.length} người`} flush>
          {live.length === 0 && <EmptyState title="Chưa có ai check-in hôm nay" />}
          {live.map((r) => (
            <div key={r.id} className="recent is-live">
              <span className="recent-time">{fmtTime(r.checked_in_at ?? r.created_at)}</span>
              <div className="recent-main">
                <div className="cell-main">{r.member.name}</div>
                <div className="cell-sub">{r.member.code}</div>
              </div>
            </div>
          ))}
        </Panel>
      </div>

      <h2 className="sec">Lịch sử</h2>
      <div className="toolbar">
        <input className="input" type="date" aria-label="Ngày" value={date} onChange={(e) => setDate(e.target.value)} />
        <Select aria-label="Kết quả" value={result} onChange={(e) => setResult(e.target.value)}>
          <option value="">Mọi kết quả</option>
          <option value="allowed">Cho vào</option>
          <option value="denied">Từ chối</option>
        </Select>
        {branches.length > 1 && (
          <Select aria-label="Chi nhánh" value={fBranch} onChange={(e) => setFBranch(e.target.value)}>
            <option value="">Mọi chi nhánh</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        )}
        <div className="grow"><span className="hint-muted">{rows.length} lượt</span></div>
      </div>
      <div className="card">
        <DataTable columns={columns} rows={rows} rowKey={(c) => c.id} defaultSort={{ key: 'at', dir: 'desc' }} loading={loading} error={error} emptyText="Không có lượt ra vào" itemLabel="lượt" />
      </div>
    </>
  )
}

export default function Access() {
  return <AccessLog />
}
