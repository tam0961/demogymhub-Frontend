import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { fetchAll } from '../lib/fetchAll'
import { apiError } from '../lib/errors'
import { fmtDateTime, fmtTime, reasonText } from '../lib/format'
import { useAuth } from '../context/AuthContext'
import { useBranch } from '../context/BranchContext'
import { usePermission } from '../context/usePermission'
import { BranchTag, Button, Chip, DataTable, EmptyState, Icon, Kpi, KpiRow, PageHeader, Panel, Select, useToast, type Column } from '../components/ui'
import type { CheckinItem, CheckinResult, CheckinStats } from '../types'

const REFRESH_MS = 30000

export default function Access() {
  const { user } = useAuth()
  const { branchId } = useBranch()
  const { can } = usePermission()
  const canCheckin = !!user?.can_checkin && can('checkins.create')
  const toast = useToast()
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
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<CheckinResult | null>(null)
  const [err, setErr] = useState('')
  const [stats, setStats] = useState<CheckinStats | null>(null)
  const [todayCounts, setTodayCounts] = useState({ allowed: 0, denied: 0 })

  const bid = fBranch || branchId || undefined
  const load = useCallback(async () => {
    setError('')
    try {
      const [l, h, t, st] = await Promise.all([
        api.get('/checkins/live', { params: { branch_id: bid } }),
        fetchAll<CheckinItem>('/checkins', { date: date || undefined, result: result || undefined, branch_id: bid }, 5),
        fetchAll<CheckinItem>('/checkins', { date: new Date().toISOString().slice(0, 10), branch_id: bid }, 5),
        api.get('/reports/checkin-stats', { params: { branch_id: bid } }).then((r) => r.data.data as CheckinStats).catch(() => null),
      ])
      setStats(st)
      setLive(l.data.data.items)
      setRows(h)
      const today = new Date().toDateString()
      const td = t.filter((x) => new Date(x.checked_in_at ?? x.created_at).toDateString() === today)
      setTodayCounts({ allowed: td.filter((x) => x.result === 'allowed').length, denied: td.filter((x) => x.result === 'denied').length })
    } catch (e) {
      setError(apiError(e).message)
    } finally {
      setLoading(false)
    }
  }, [bid, date, result])

  useEffect(() => {
    load()
    const t = setInterval(load, REFRESH_MS)
    return () => clearInterval(t)
  }, [load])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const v = code.trim()
    if (!v) return
    setBusy(true)
    setErr('')
    try {
      const inside = live.find((i) => i.member.code.toLowerCase() === v.toLowerCase())
      if (inside) {
        await api.post(`/checkins/${inside.id}/checkout`)
        setRes(null)
        toast(`Đã check-out ${inside.member.name}`)
      } else {
        const { data } = await api.post('/checkins', { member_code: v, direction: 'in' })
        setRes(data.data)
      }
      load()
    } catch (x) {
      setRes(null)
      const a = apiError(x)
      setErr(a.status === 404 ? 'Không tìm thấy hội viên với mã này' : a.message)
    } finally {
      setBusy(false)
      setCode('')
      inputRef.current?.focus()
    }
  }

  const checkout = async (id: string) => {
    try {
      await api.post(`/checkins/${id}/checkout`)
      load()
    } catch (x) {
      toast(apiError(x).message, true)
    }
  }

  const maxHour = Math.max(1, ...(stats?.branches.flatMap((b) => b.by_hour.map((h) => h.count)) ?? [1]))
  const columns: Column<CheckinItem>[] = [
    { key: 'at', header: 'Giờ vào', sortValue: (c) => c.checked_in_at ?? c.created_at, render: (c) => fmtDateTime(c.checked_in_at ?? c.created_at) },
    { key: 'member', header: 'Hội viên', sortValue: (c) => c.member.name, render: (c) => <><div className="cell-main">{c.member.name}</div><div className="cell-sub">{c.member.code}</div></> },
    { key: 'result', header: 'Kết quả', sortValue: (c) => c.result, render: (c) => <Chip tone={c.result === 'allowed' ? 'ok' : 'bad'}>{c.result === 'allowed' ? 'Cho vào' : 'Từ chối'}</Chip> },
    { key: 'reason', header: 'Lý do', render: (c) => (c.result === 'denied' ? reasonText(c.reason) : <span className="hint-muted">-</span>) },
    { key: 'out', header: 'Giờ ra', render: (c) => (c.result === 'allowed' ? (c.checked_out_at ? fmtTime(c.checked_out_at) : <Chip tone="warn">Đang tập</Chip>) : <span className="hint-muted">-</span>) },
  ]

  return (
    <>
      <PageHeader title="Kiểm soát ra vào" sub="Lượt vào ra theo thời gian thực, tự làm mới mỗi 30 giây" />
      <KpiRow>
        <Kpi value={todayCounts.allowed} label="Lượt vào hôm nay" />
        <Kpi value={<span className={todayCounts.denied ? 'text-bad' : ''}>{todayCounts.denied}</span>} label="Từ chối hôm nay" />
        <Kpi value={live.length} label="Đang trong phòng tập" />
      </KpiRow>

      {!canCheckin && <div className="view-note" role="note">Tài khoản quản trị chỉ xem thống kê</div>}

      {stats && (
        <div className="stat-cards">
          {stats.branches.map((b) => (
            <section key={b.branch.id} className="panel stat-card" aria-label={`Thống kê ${b.branch.name}`}>
              <div className="stat-head"><BranchTag branch={b.branch} /></div>
              <div className="stat-nums">
                <div><b>{b.checkins_today}</b><span>Lượt vào</span></div>
                <div><b className={b.denied_today ? 'text-bad' : ''}>{b.denied_today}</b><span>Từ chối</span></div>
                <div><b>{b.inside_now}</b><span>Đang tập</span></div>
              </div>
              <svg className="spark" viewBox="0 0 120 28" role="img" aria-label={`Lượt vào theo giờ, ${b.branch.name}`}>
                {b.by_hour.map((h, i) => <rect key={h.hour} x={i * 9} y={28 - (h.count / maxHour) * 26} width={7} height={(h.count / maxHour) * 26} rx={1.5} fill="var(--c1)"><title>{`${h.hour}h: ${h.count}`}</title></rect>)}
              </svg>
            </section>
          ))}
          <section className="panel stat-card" aria-label="Tổng các chi nhánh">
            <div className="stat-head"><b>Tổng</b></div>
            <div className="stat-nums">
              <div><b>{stats.totals.checkins_today}</b><span>Lượt vào</span></div>
              <div><b>{stats.totals.denied_today}</b><span>Từ chối</span></div>
              <div><b>{stats.totals.inside_now}</b><span>Đang tập</span></div>
            </div>
          </section>
        </div>
      )}

      {canCheckin && (
        <Panel title="Check-in, check-out thủ công" note="Nhập mã hội viên hoặc số điện thoại">
          <form className="inline-form" onSubmit={submit}>
            <label className="sr-only" htmlFor="ac-code">Mã hội viên hoặc số điện thoại</label>
            <input id="ac-code" ref={inputRef} className="input" placeholder="Mã hội viên hoặc số điện thoại" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} />
            <Button variant="primary" type="submit" disabled={busy}><Icon name="checkin" size={16} />{busy ? 'Đang kiểm tra...' : 'Vào / Ra'}</Button>
          </form>
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

      <div style={{ marginTop: 16 }}>
        <Panel title="Đang trong phòng tập" count={`${live.length} người`} flush>
          {live.length === 0 && <EmptyState title="Chưa có ai trong phòng tập" />}
          {live.map((r) => (
            <div key={r.id} className="recent is-live">
              <span className="recent-time">{fmtTime(r.checked_in_at ?? r.created_at)}</span>
              <div className="recent-main">
                <div className="cell-main">{r.member.name}</div>
                <div className="cell-sub">{r.member.code}</div>
              </div>
              {canCheckin && <Button small onClick={() => checkout(r.id)}>Check-out</Button>}
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
