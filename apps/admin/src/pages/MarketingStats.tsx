import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtDateTime, fmtMoney } from '../lib/format'
import { useAuth } from '../context/AuthContext'
import { useBranch } from '../context/BranchContext'
import { usePermission } from '../context/usePermission'
import { Button, Chip, Field, Input, MoneyInput, PageHeader, Panel, Select, Tabs, useToast } from '../components/ui'
import { MarketingAutoPanel } from '../components/MarketingAutoPanel'
import { OverviewSections, type AdsView, type OverviewData } from '../components/MarketingOverview'
import type { Lead, ListResp } from '../types'

type Channel = 'facebook_ads' | 'google_ads' | 'google_maps'
type Platform = 'facebook' | 'google_ads' | 'maps'
type Tab = 'overview' | 'ads' | 'zalo'
type AdsTab = Platform | 'general' | 'auto'
interface Metric { month: string; channel: Channel; spend: number; impressions: number; clicks: number; leads: number; note: string; source?: 'auto' | 'manual' }
type AdsCfg = Record<Platform, { account_id: string; has_token: boolean }>
interface ZnsLog { id: string; event: string; phone: string; status: string; error: string | null; created_at: string }

const CHANNELS: { key: Channel; label: string }[] = [
  { key: 'facebook_ads', label: 'Facebook Ads' },
  { key: 'google_ads', label: 'Google Ads' },
  { key: 'google_maps', label: 'Google Maps' },
]
const PLATFORMS: Record<Platform, { title: string; idLabel: string; idHint: string; tokenLabel: string; tokenHint: string; guide: string[] }> = {
  facebook: {
    title: 'Facebook Ads', idLabel: 'ID tài khoản quảng cáo', idHint: 'act_1234567890', tokenLabel: 'Mã truy cập (token)', tokenHint: 'Dán token đọc quảng cáo',
    guide: ['Vào Meta Business Suite, tạo ứng dụng và bật quyền ads_read.', 'Tạo mã truy cập dài hạn cho tài khoản quảng cáo.', 'Dán ID tài khoản (bắt đầu bằng act_) và token vào hai ô trên.'],
  },
  google_ads: {
    title: 'Google Ads (gồm Google Maps)', idLabel: 'ID khách hàng Google Ads', idHint: '123-456-7890', tokenLabel: 'Mã nhà phát triển (developer token)', tokenHint: 'Dán developer token',
    guide: ['Vào Google Ads, mục Trung tâm API, xin developer token.', 'Lấy ID khách hàng (10 chữ số) ở góc trên bên phải.', 'Dán hai giá trị vào các ô trên.'],
  },
  maps: {
    title: 'Hồ sơ Google Maps', idLabel: 'Place ID của phòng gym', idHint: 'ChIJ...', tokenLabel: 'Khóa API', tokenHint: 'Dán khóa API Business Profile',
    guide: ['Cần Google duyệt quyền Business Profile API trước, có thể mất vài ngày.', 'Lấy Place ID bằng công cụ Place ID Finder của Google.', 'Dán Place ID và khóa API vào các ô trên.'],
  },
}
const EMPTY_ADS: AdsView = { has_data: false, synced_at: 0, spend: 0, prev_spend: 0, results: 0, clicks: 0, impressions: 0, daily: [], campaigns: [] }
const EMPTY_OVERVIEW = (month: string): OverviewData => ({
  month, today: '', days: 0,
  platforms: { facebook: EMPTY_ADS, google_ads: EMPTY_ADS, maps: { has_data: false, synced_at: 0, data_until: null, totals: { views: 0, calls: 0, directions: 0, web: 0, msgs: 0, bookings: 0 }, prev: { views: 0, calls: 0, directions: 0, web: 0 }, daily: [], campaigns: [] } },
})
const CHANNEL_OF: Record<Platform, Channel> = { facebook: 'facebook_ads', google_ads: 'google_ads', maps: 'google_maps' }
const BRANCH_COLOR: Record<string, string> = { nb: 'var(--nb)', q7: 'var(--q7)', q2: 'var(--q2)' }

const thisMonth = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).slice(0, 7)
const monthOptions = () => {
  const [y, m] = thisMonth().split('-').map(Number)
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(y, m - 1 - i, 1)
    const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return { v, label: `Tháng ${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}${i === 0 ? ' (tháng này)' : ''}` }
  })
}
const blank = (month: string, channel: Channel): Metric => ({ month, channel, spend: 0, impressions: 0, clicks: 0, leads: 0, note: '' })
const num = (v: string) => Math.max(0, parseInt(v.replace(/\D/g, ''), 10) || 0)
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '-')
const k = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))
const ZNS_EVENT: Record<string, string> = { new_contract: 'Đăng ký gói mới', renewal: 'Gia hạn', payment_due: 'Nhắc thanh toán', expiring: 'Nhắc hết hạn', pt_signed: 'Xác nhận buổi PT' }

function Dot({ code }: { code: string }) {
  return <span aria-hidden="true" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 999, background: BRANCH_COLOR[code] ?? 'var(--brand)', marginRight: 6 }} />
}

function StatCard({ label, value, lines, foot }: { label: string; value: ReactNode; lines: { code: string; text: string }[]; foot?: string }) {
  return (
    <div className="kpi2">
      <div className="kpi2-label">{label}</div>
      <div className="kpi2-value">{value}</div>
      {lines.map((l) => <div key={l.code} className="kpi2-note"><Dot code={l.code} />{l.text}</div>)}
      {foot && <div className="kpi2-note">{foot}</div>}
    </div>
  )
}

function ChannelForm({ value, canEdit, onSave }: { value: Metric; canEdit: boolean; onSave: (m: Metric) => Promise<void> }) {
  const [m, setM] = useState(value)
  const [busy, setBusy] = useState(false)
  useEffect(() => setM(value), [value])
  const label = CHANNELS.find((c) => c.key === m.channel)!.label
  const id = `mk-${m.channel}`
  return (
    <Panel title={label} note={`CPL ${m.leads > 0 ? fmtMoney(m.spend / m.leads) : '-'} · CTR ${pct(m.clicks, m.impressions)}`}>
      <form className="form-grid" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await onSave(m) } finally { setBusy(false) } }}>
        <Field label="Chi phí" htmlFor={`${id}-spend`}><MoneyInput id={`${id}-spend`} disabled={!canEdit} value={m.spend} onValueChange={(d) => setM({ ...m, spend: num(d) })} /></Field>
        <Field label="Lượt hiển thị" htmlFor={`${id}-imp`}><Input id={`${id}-imp`} disabled={!canEdit} inputMode="numeric" value={m.impressions} onChange={(e) => setM({ ...m, impressions: num(e.target.value) })} /></Field>
        <Field label="Lượt nhấp" htmlFor={`${id}-clk`}><Input id={`${id}-clk`} disabled={!canEdit} inputMode="numeric" value={m.clicks} onChange={(e) => setM({ ...m, clicks: num(e.target.value) })} /></Field>
        <Field label="Khách tiềm năng thu được" htmlFor={`${id}-ld`}><Input id={`${id}-ld`} disabled={!canEdit} inputMode="numeric" value={m.leads} onChange={(e) => setM({ ...m, leads: num(e.target.value) })} /></Field>
        <Field label="Ghi chú" htmlFor={`${id}-note`} full><Input id={`${id}-note`} disabled={!canEdit} maxLength={300} value={m.note} onChange={(e) => setM({ ...m, note: e.target.value })} /></Field>
        {canEdit && <div className="full" style={{ display: 'flex', justifyContent: 'flex-end' }}><Button type="submit" variant="primary" disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu'}</Button></div>}
      </form>
    </Panel>
  )
}

function ConnectForm({ platform, cfg, canEdit, onSaved }: { platform: Platform; cfg: AdsCfg[Platform]; canEdit: boolean; onSaved: (c: AdsCfg) => void }) {
  const toast = useToast()
  const def = PLATFORMS[platform]
  const [accountId, setAccountId] = useState(cfg.account_id)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => setAccountId(cfg.account_id), [cfg.account_id])
  const connected = !!cfg.account_id && cfg.has_token

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      const { data } = await api.put<{ data: AdsCfg }>('/marketing/ads', { platform, account_id: accountId.trim(), token: token.trim() || undefined })
      setToken('')
      onSaved(data.data)
      toast(platform === 'facebook' ? 'Đã lưu thông tin kết nối. Hệ thống tự kéo số liệu Facebook mỗi 15 phút, xem mục Kết nối tự động.' : 'Đã lưu thông tin kết nối. Google gửi số liệu vào qua mục Kết nối tự động.')
    } catch (e2) {
      setErr(apiError(e2).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Panel title={def.title} note={<Chip tone={connected ? 'ok' : 'neutral'}>{connected ? 'Đã lưu thông tin' : 'Chưa kết nối'}</Chip>}>
        <form onSubmit={submit} style={{ maxWidth: 560, display: 'grid', gap: 12 }}>
          <Field label={def.idLabel} htmlFor={`ad-${platform}-id`}><Input id={`ad-${platform}-id`} disabled={!canEdit} placeholder={def.idHint} value={accountId} onChange={(e) => setAccountId(e.target.value)} /></Field>
          <Field label={def.tokenLabel} htmlFor={`ad-${platform}-tk`} hint={cfg.has_token ? 'Đã lưu trên máy chủ, để trống để giữ nguyên.' : undefined}>
            <Input id={`ad-${platform}-tk`} type="password" autoComplete="off" disabled={!canEdit} placeholder={def.tokenHint} value={token} onChange={(e) => setToken(e.target.value)} />
          </Field>
          {err && <div className="form-error" role="alert">{err}</div>}
          <div><Button type="submit" variant="primary" disabled={!canEdit || busy || !accountId.trim()}>{busy ? 'Đang lưu...' : 'Lưu và kéo số liệu'}</Button></div>
          <p className="hint-muted">{platform === 'facebook' ? 'Facebook được kéo tự động mỗi 15 phút. Tháng nào đã có số liệu tự động thì thay cho số nhập tay.' : 'Google gửi số liệu vào bằng khóa riêng ở mục Kết nối tự động. Tháng chưa có số liệu thì nhập tay ở mục Chung.'}</p>
          <details>
            <summary>Cách lấy token (khoảng 10 phút)</summary>
            <ol style={{ margin: '8px 0 0', paddingLeft: 20 }}>{def.guide.map((g) => <li key={g}>{g}</li>)}</ol>
          </details>
        </form>
      </Panel>
      <div style={{ height: 16 }} />
      <Panel title={platform === 'facebook' ? 'Chiến dịch Facebook' : platform === 'google_ads' ? 'Chiến dịch Google Ads' : 'Chỉ số hồ sơ Google Maps'} note="30 ngày qua" flush>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Nền tảng</th><th>Chiến dịch</th><th>Chi nhánh</th><th>Trạng thái</th><th className="num">Chi tiêu</th><th className="num">Hiển thị</th><th className="num">Nhấp</th><th className="num">CTR</th><th className="num">Kết quả</th><th className="num">Chi phí mỗi kết quả</th></tr></thead>
            <tbody><tr><td colSpan={10}>Chưa có chiến dịch nào. Số liệu chiến dịch sẽ hiện khi hệ thống được nối tự động với nền tảng.</td></tr></tbody>
          </table>
        </div>
      </Panel>
    </>
  )
}

function ZaloCampaign() {
  const [logs, setLogs] = useState<ZnsLog[] | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    api.get<{ data: ZnsLog[] }>('/zalo/logs').then((r) => setLogs(r.data.data)).catch((e) => setErr(apiError(e).message))
  }, [])
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
  const sentToday = (logs ?? []).filter((l) => l.created_at.slice(0, 10) === today).length
  const sent = (logs ?? []).filter((l) => l.status === 'sent').length
  const failed = (logs ?? []).filter((l) => l.status === 'failed').length
  if (err) return <div className="form-error" role="alert">{err}</div>
  return (
    <>
      <div className="kpi-row">
        <div className="kpi2"><div className="kpi2-label">Gửi hôm nay</div><div className="kpi2-value">{sentToday}</div><div className="kpi2-note">Mọi trạng thái</div></div>
        <div className="kpi2"><div className="kpi2-label">Đã gửi thành công</div><div className="kpi2-value">{sent}</div><div className="kpi2-note">Trong 100 tin gần nhất</div></div>
        <div className="kpi2"><div className="kpi2-label">Lỗi</div><div className="kpi2-value">{failed}</div><div className="kpi2-note">Kiểm tra mẫu tin hoặc token</div></div>
      </div>
      <Panel title="Nhật ký gửi tin" note={<Link to="/settings/zns" className="btn secondary btn-sm">Cấu hình Zalo</Link>} flush>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Thời gian</th><th>Sự kiện</th><th>Số điện thoại</th><th>Trạng thái</th><th>Ghi chú</th></tr></thead>
            <tbody>
              {(logs ?? []).map((l) => (
                <tr key={l.id}>
                  <td>{fmtDateTime(l.created_at)}</td>
                  <td>{ZNS_EVENT[l.event] ?? l.event}</td>
                  <td>{l.phone}</td>
                  <td><Chip tone={l.status === 'sent' ? 'ok' : l.status === 'failed' ? 'bad' : 'warn'}>{l.status === 'sent' ? 'Đã gửi' : l.status === 'failed' ? 'Lỗi' : 'Bỏ qua'}</Chip></td>
                  <td>{l.error ?? ''}</td>
                </tr>
              ))}
              {logs && logs.length === 0 && <tr><td colSpan={5}>Chưa gửi tin nào.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  )
}

export default function MarketingStats() {
  const { user } = useAuth()
  const { branchId } = useBranch()
  const { can } = usePermission()
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('overview')
  const [adsTab, setAdsTab] = useState<AdsTab>('facebook')
  const [month, setMonth] = useState(thisMonth)
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [ads, setAds] = useState<AdsCfg>({ facebook: { account_id: '', has_token: false }, google_ads: { account_id: '', has_token: false }, maps: { account_id: '', has_token: false } })
  const [error, setError] = useState('')
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const canEdit = can('system.manage_settings')

  const load = useCallback(async () => {
    setError('')
    try {
      const [m, l, a, o] = await Promise.all([
        api.get<{ data: Metric[] }>('/marketing/metrics', { params: { month } }),
        api.get<ListResp<Lead>>('/leads', { params: { limit: 200, branch_id: branchId ?? undefined } }),
        api.get<{ data: AdsCfg }>('/marketing/ads'),
        api.get<{ data: OverviewData }>('/marketing/overview', { params: { month } }).then((r) => r.data.data).catch(() => null),
      ])
      setOverview(o)
      setMetrics(m.data.data)
      setLeads(l.data.data)
      setAds(a.data.data)
    } catch (e) {
      setError(apiError(e).message)
    }
  }, [month, branchId])
  useEffect(() => { load() }, [load])

  const branches = useMemo(() => (user?.branches ?? []).filter((b) => !branchId || b.id === branchId), [user, branchId])
  const inMonth = useMemo(() => leads.filter((l) => l.created_at.slice(0, 7) === month), [leads, month])
  const signed = inMonth.filter((l) => l.status === 'converted')
  const autoSpend = { facebook_ads: overview?.platforms.facebook.spend ?? 0, google_ads: overview?.platforms.google_ads.spend ?? 0, google_maps: (overview?.platforms.maps.campaigns ?? []).reduce((s, c) => s + c.spend, 0) }
  const spendOf = (c: Channel) => autoSpend[c] || (metrics.find((x) => x.channel === c)?.spend ?? 0)
  const totalSpend = spendOf('facebook_ads') + spendOf('google_ads') + spendOf('google_maps')
  const byBranch = (rows: Lead[]) => branches.map((b) => ({ code: b.code, text: `${b.name} ${rows.filter((l) => l.branch_id === b.id).length}` }))
  const monthLabel = `${month.slice(5)}/${month.slice(0, 4)}`

  const save = async (m: Metric) => {
    try {
      await api.put('/marketing/metrics', m)
      toast('Đã lưu chỉ số')
      await load()
    } catch (e) {
      toast(apiError(e).message)
    }
  }
  const platformStatus = (p: Platform) => {
    if (ads[p].account_id && ads[p].has_token) return 'Đã lưu thông tin'
    return metrics.some((m) => m.channel === CHANNEL_OF[p] && (m.spend > 0 || m.clicks > 0 || m.leads > 0)) ? 'Đã nhập tay' : 'Chưa kết nối'
  }
  const goConnect = (p: Platform) => { setAdsTab(p); setTab('ads') }

  const section = (p: Platform, title: string, text: string, button: string) => (
    <section style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 style={{ fontSize: 18, margin: '0 0 8px' }}>{title}</h2>
        <span className="hint-muted">{platformStatus(p)}</span>
      </div>
      <div className="panel" style={{ padding: 16 }}>
        <p style={{ margin: '0 0 12px' }}>{text}</p>
        <Button variant="primary" onClick={() => goConnect(p)}>{button}</Button>
      </div>
    </section>
  )

  return (
    <>
      <PageHeader
        title={`Quảng cáo tháng ${monthLabel}`}
        sub={`Từ ngày 1 đến hôm nay. Tất cả chi nhánh: ${(user?.branches ?? []).map((b) => b.name).join(', ')}`}
        action={<Select aria-label="Tháng" value={month} onChange={(e) => setMonth(e.target.value)}>{monthOptions().map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}</Select>}
      />
      {error && <div className="form-error" role="alert">{error}</div>}
      <Tabs<Tab> tabs={[{ value: 'overview', label: 'Tổng quan' }, { value: 'ads', label: 'Cài đặt quảng cáo' }, { value: 'zalo', label: 'Chiến dịch Zalo' }]} value={tab} onChange={setTab} />
      <div style={{ height: 12 }} />

      {tab === 'overview' && (
        <>
          <div className="kpi-row">
            <StatCard label="Đã chi quảng cáo" value={fmtMoney(totalSpend)} lines={[]} foot={`Facebook ${k(spendOf('facebook_ads'))}, Google ${k(spendOf('google_ads'))}`} />
            <StatCard label="Khách quan tâm" value={inMonth.length} lines={byBranch(inMonth)} foot={inMonth.length === 0 ? 'Chưa có khách' : undefined} />
            <StatCard label="Khách đã ký hợp đồng" value={signed.length} lines={byBranch(signed)} foot={signed.length === 0 ? 'Chưa có hợp đồng' : undefined} />
            <StatCard label="Doanh thu từ quảng cáo" value={fmtMoney(0)} lines={[]} foot="Chưa nối doanh thu với nguồn quảng cáo" />
          </div>
          <OverviewSections
            data={overview ?? EMPTY_OVERVIEW(month)}
            fallback={{
              facebook: section('facebook', 'Facebook', platformStatus('facebook') === 'Chưa kết nối' ? 'Chưa có số liệu Facebook. Kết nối hoặc nhập tay để xem chi tiêu và kết quả.' : 'Đã có thông tin Facebook cho tháng này. Mở cài đặt để xem hoặc sửa.', 'Kết nối Facebook'),
              google_ads: section('google_ads', 'Google Ads (gồm Google Maps)', platformStatus('google_ads') === 'Chưa kết nối' ? 'Chưa có số liệu Google Ads. Kết nối hoặc nhập tay để xem chi tiêu và kết quả.' : 'Đã có thông tin Google Ads cho tháng này. Mở cài đặt để xem hoặc sửa.', 'Kết nối Google Ads'),
              maps: section('maps', 'Hồ sơ Google Maps', 'Chưa có số liệu hồ sơ Google Maps (lượt xem, cuộc gọi, chỉ đường, đánh giá). Cần Google duyệt quyền API trước, có thể mất vài ngày.', 'Xem hướng dẫn'),
            }}
          />
        </>
      )}

      {tab === 'ads' && (
        <>
          <Tabs<AdsTab> tabs={[{ value: 'facebook', label: 'Facebook' }, { value: 'google_ads', label: 'Google Ads' }, { value: 'maps', label: 'Hồ sơ Google Maps' }, { value: 'auto', label: 'Kết nối tự động' }, { value: 'general', label: 'Chung' }]} value={adsTab} onChange={setAdsTab} />
          <div style={{ height: 12 }} />
          {adsTab === 'auto' && <MarketingAutoPanel canEdit={canEdit} />}
          {adsTab !== 'general' && adsTab !== 'auto' && <ConnectForm key={adsTab} platform={adsTab} cfg={ads[adsTab]} canEdit={canEdit} onSaved={setAds} />}
          {adsTab === 'general' && (
            <>
              <p className="hint-muted" style={{ marginTop: 0 }}>Nhập số liệu quảng cáo tháng {monthLabel} theo từng kênh cho đến khi có kết nối tự động.</p>
              {CHANNELS.map((c) => <ChannelForm key={`${month}-${c.key}`} value={metrics.find((r) => r.channel === c.key) ?? blank(month, c.key)} canEdit={canEdit} onSave={save} />)}
            </>
          )}
        </>
      )}

      {tab === 'zalo' && <ZaloCampaign />}
    </>
  )
}
