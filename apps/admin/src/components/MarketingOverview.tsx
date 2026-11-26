import type { ReactNode } from 'react'
import { fmtMoney, fmtTr } from '../lib/format'
import { Panel } from './ui'

export interface DayPoint { date: string; spend: number; results: number; form: number; msgs: number }
export interface CampLine { name: string; status: string; kind: string | null; spend: number; results: number }
export interface AdsView { has_data: boolean; synced_at: number; spend: number; prev_spend: number; results: number; clicks: number; impressions: number; daily: DayPoint[]; campaigns: CampLine[] }
export interface MapsData {
  has_data: boolean; synced_at: number; data_until: string | null
  totals: { views: number; calls: number; directions: number; web: number; msgs: number; bookings: number }
  prev: { views: number; calls: number; directions: number; web: number }
  daily: { date: string; maps: number; search: number; calls: number; directions: number; web: number }[]
  campaigns: CampLine[]
}
export interface OverviewData { month: string; today: string; days: number; platforms: { facebook: AdsView; google_ads: AdsView; maps: MapsData } }

const C_YELLOW = 'var(--brand)'
const C_BLUE = 'var(--q7)'
const C_TEAL = 'var(--nb)'
const C_BROWN = '#b45309'

const vn = (n: number) => n.toLocaleString('vi-VN')
const tr = (n: number) => (n >= 1e6 ? fmtTr(n) : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n))
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const ago = (t: number, now = Date.now()) => {
  if (!t) return 'chưa có số liệu'
  const m = Math.max(0, Math.round((now - t) / 60000))
  return m < 60 ? `Cập nhật ${m} phút trước` : m < 1440 ? `Cập nhật ${Math.round(m / 60)} giờ trước` : `Cập nhật ${Math.round(m / 1440)} ngày trước`
}
const delta = (cur: number, prev: number) => (prev > 0 ? `${cur >= prev ? '+' : ''}${Math.round(((cur - prev) / prev) * 100)}% so với cùng kỳ tháng trước` : 'Chưa có số liệu tháng trước')

function Stat({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="kpi2">
      <div className="kpi2-label">{label}</div>
      <div className="kpi2-value">{value}</div>
      {note && <div className="kpi2-note">{note}</div>}
    </div>
  )
}

function niceMax(v: number) {
  if (v <= 0) return 4
  const p = 10 ** Math.floor(Math.log10(v))
  const f = v / p
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p
}

export interface Series { key: string; label: string; color: string; values: number[] }

export function DailyChart({ dates, series, fmt = vn, legend = false }: { dates: string[]; series: Series[]; fmt?: (n: number) => string; legend?: boolean }) {
  const W = 760
  const H = 250
  const L = 52
  const B = 28
  const T = 12
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)))
  const x = (i: number) => L + (dates.length > 1 ? (i / (dates.length - 1)) * (W - L - 14) : 0)
  const y = (v: number) => T + (1 - v / max) * (H - T - B)
  return (
    <div>
      {legend && (
        <div className="mo-legend">
          {series.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={series.map((s) => s.label).join(', ')}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`mo-g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        {[0, 1, 2, 3, 4].map((t) => {
          const v = (max / 4) * t
          return <g key={t}><line x1={L} x2={W - 8} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray="4 4" /><text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{fmt(v)}</text></g>
        })}
        {dates.map((d, i) => (i % 3 === 0 ? <text key={d} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">{dm(d)}</text> : null))}
        {series.map((s) => {
          const pts = s.values.map((v, i) => `${x(i)},${y(v)}`)
          return (
            <g key={s.key}>
              {s.values.length > 1 && <polygon points={`${x(0)},${y(0)} ${pts.join(' ')} ${x(s.values.length - 1)},${y(0)}`} fill={`url(#mo-g-${s.key})`} />}
              <polyline points={pts.join(' ')} fill="none" stroke={s.color} strokeWidth={2} />
              {s.values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={3} fill="var(--surface)" stroke={s.color} strokeWidth={2}><title>{`${s.label} ${dm(dates[i])}: ${fmt(v)}`}</title></circle>)}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function BarList({ rows, color, right }: { rows: { label: ReactNode; value: number; text: string }[]; color: string; right?: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <div className="mo-bars">
      {rows.map((r, i) => (
        <div key={i} className="mo-bar">
          <span className="mo-bar-l">{r.label}</span>
          <span className="mo-bar-t"><i style={{ width: `${(r.value / max) * 100}%`, background: color }} /></span>
          <b className={right ? 'mo-bar-r' : 'mo-bar-r'}>{r.text}</b>
        </div>
      ))}
    </div>
  )
}

const campRows = (c: CampLine[]) => c.map((x) => ({ label: <>{x.name}{x.status !== 'active' && <span className="hint-muted"> (tạm dừng)</span>}</>, value: x.spend, text: `${tr(x.spend)}, ${vn(x.results)} kết quả` }))

function SectionHead({ title, right, warn }: { title: string; right?: string; warn?: string }) {
  return (
    <div className="mo-head">
      <h2>{title}</h2>
      <span className="mo-head-r">{right && <span className="hint-muted">{right}</span>}{warn && <span className="mo-warn">{warn}</span>}</span>
    </div>
  )
}

function AdsSection({ title, v, dates, color, kind, now }: { title: string; v: AdsView; dates: string[]; color: string; kind: 'facebook' | 'google'; now: number }) {
  const stale = kind === 'google' && v.synced_at > 0 && now - v.synced_at > 3 * 3600_000
  const cpr = v.results > 0 ? v.spend / v.results : 0
  return (
    <section className="mo-sec">
      <SectionHead title={title} right={ago(v.synced_at, now)} warn={stale ? 'Quá 3 giờ chưa nhận số liệu mới, kiểm tra lịch chạy của tập lệnh Google Ads' : undefined} />
      <div className="kpi-row">
        <Stat label="Đã chi" value={fmtMoney(v.spend)} note={delta(v.spend, v.prev_spend)} />
        <Stat label="Kết quả" value={vn(v.results)} note={kind === 'facebook' ? 'Khách điền form và tin nhắn mới' : 'Cuộc gọi, chỉ đường, đăng ký'} />
        <Stat label="Mỗi kết quả tốn" value={cpr ? fmtMoney(Math.round(cpr)) : '-'} note="Tiền chi chia số kết quả" />
        <Stat label="Lượt nhấp" value={vn(v.clicks)} note={`${vn(v.impressions)} lượt hiển thị`} />
      </div>
      <div className="mo-two">
        <Panel title="Chi tiêu theo ngày"><DailyChart dates={dates} series={[{ key: `${kind}-spend`, label: 'Chi tiêu', color, values: v.daily.map((d) => d.spend) }]} fmt={(n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)))} /></Panel>
        <Panel title="Kết quả theo ngày">
          <DailyChart
            dates={dates}
            legend={kind === 'facebook'}
            series={kind === 'facebook'
              ? [{ key: 'fb-form', label: 'Form', color: C_YELLOW, values: v.daily.map((d) => d.form) }, { key: 'fb-msg', label: 'Tin nhắn', color: C_BLUE, values: v.daily.map((d) => d.msgs) }]
              : [{ key: 'gg-res', label: 'Kết quả', color, values: v.daily.map((d) => d.results) }]}
            fmt={(n) => String(Math.round(n * 10) / 10)}
          />
        </Panel>
      </div>
      {v.campaigns.length > 0 && kind === 'facebook' && (
        <Panel title="Chiến dịch" note={`chi tiêu và kết quả, tháng ${dates[0]?.slice(5, 7)}/${dates[0]?.slice(0, 4)}`}><BarList rows={campRows(v.campaigns)} color={C_YELLOW} /></Panel>
      )}
    </section>
  )
}

function MapsSection({ m, dates, now, month }: { m: MapsData; dates: string[]; now: number; month: string }) {
  const lag = m.data_until ? `Cập nhật ${Math.max(0, Math.round((now - m.synced_at) / 86400000))} ngày trước, Google trễ khoảng 2 ngày, mới có số liệu đến ${dm(m.data_until)}` : 'Chưa có số liệu hồ sơ Google Maps'
  const mm = `tháng ${month.slice(5)}/${month.slice(0, 4)}`
  return (
    <>
      {m.campaigns.length > 0 && (
        <Panel title="Chiến dịch" note={`chi tiêu và kết quả, ${mm}`}>
          <BarList rows={m.campaigns.map((c) => ({ label: <>{c.name}{c.kind && <span className="mo-tag">{c.kind}</span>}</>, value: c.spend, text: `${tr(c.spend)}, ${vn(c.results)} kết quả` }))} color={C_TEAL} />
        </Panel>
      )}
      <div style={{ height: 12 }} />
      <Panel title="Khách đã làm gì" note={mm}>
        <BarList
          color={C_BROWN}
          rows={[
            { label: 'Chỉ đường', value: m.totals.directions, text: vn(m.totals.directions) },
            { label: 'Gọi điện', value: m.totals.calls, text: vn(m.totals.calls) },
            { label: 'Truy cập website', value: m.totals.web, text: vn(m.totals.web) },
            { label: 'Nhắn tin', value: m.totals.msgs, text: vn(m.totals.msgs) },
            { label: 'Đặt chỗ', value: m.totals.bookings, text: vn(m.totals.bookings) },
          ]}
        />
      </Panel>
      <section className="mo-sec" style={{ marginTop: 20 }}>
        <SectionHead title="Hồ sơ Google Maps" right={lag} />
        <div className="kpi-row">
          <Stat label="Lượt xem hồ sơ" value={vn(m.totals.views)} note={delta(m.totals.views, m.prev.views)} />
          <Stat label="Cuộc gọi" value={vn(m.totals.calls)} note={delta(m.totals.calls, m.prev.calls)} />
          <Stat label="Chỉ đường" value={vn(m.totals.directions)} note={delta(m.totals.directions, m.prev.directions)} />
          <Stat label="Truy cập website" value={vn(m.totals.web)} note={delta(m.totals.web, m.prev.web)} />
        </div>
        <div className="mo-two">
          <Panel title="Lượt xem hồ sơ theo ngày"><DailyChart dates={dates} legend series={[{ key: 'mp-maps', label: 'Maps', color: C_TEAL, values: m.daily.map((d) => d.maps) }, { key: 'mp-search', label: 'Tìm kiếm', color: C_BROWN, values: m.daily.map((d) => d.search) }]} /></Panel>
          <Panel title="Khách làm gì theo ngày"><DailyChart dates={dates} legend series={[{ key: 'mp-call', label: 'Gọi', color: C_YELLOW, values: m.daily.map((d) => d.calls) }, { key: 'mp-dir', label: 'Chỉ đường', color: C_TEAL, values: m.daily.map((d) => d.directions) }, { key: 'mp-web', label: 'Website', color: C_BROWN, values: m.daily.map((d) => d.web) }]} /></Panel>
        </div>
      </section>
    </>
  )
}

export function OverviewSections({ data, fallback, now = Date.now() }: { data: OverviewData; fallback: { facebook: ReactNode; google_ads: ReactNode; maps: ReactNode }; now?: number }) {
  const { platforms: p } = data
  const dates = p.facebook.daily.map((d) => d.date)
  return (
    <>
      {p.facebook.has_data ? <AdsSection title="Facebook" v={p.facebook} dates={dates} color={C_YELLOW} kind="facebook" now={now} /> : fallback.facebook}
      {p.google_ads.has_data ? <AdsSection title="Google Ads (gồm Google Maps)" v={p.google_ads} dates={dates} color={C_TEAL} kind="google" now={now} /> : fallback.google_ads}
      {p.maps.has_data ? <MapsSection m={p.maps} dates={dates} now={now} month={data.month} /> : fallback.maps}
      <p className="hint-muted">Số chi tiêu và kết quả lấy trực tiếp từ Facebook và Google, trễ từ vài phút đến vài giờ. Số hợp đồng và doanh thu tính từ khách đã vào hệ thống cùng nguồn quảng cáo.</p>
    </>
  )
}
