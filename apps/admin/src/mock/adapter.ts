import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import { ptUsageDeadline } from '../lib/pt'
import type { Ticket, Lead, PtSession, AuditRow, BundledContract, CheckinItem, Contract, Me, Member, PayMethod, Payment, Pkg, PtContract, PtEligibility, RoleRow, SessionRow, Shift } from '../types'

const branches = [
  { id: 'b-q2', code: 'Q2', name: 'Chi nhánh Quận 2' },
  { id: 'b-nb', code: 'NB', name: 'Chi nhánh Nhà Bè' },
  { id: 'b-q7', code: 'Q7', name: 'Chi nhánh Quận 7' },
]

const P = {
  members: ['members.read', 'members.create', 'members.update'],
  packages: ['packages.read', 'packages.create', 'packages.update'],
  contracts: ['contracts.create', 'contracts.read', 'contracts.sign', 'contracts.activate'],
  payments: ['payments.create', 'payments.read', 'payments.refund_request'],
  shifts: ['shifts.open', 'shifts.close'],
  checkins: ['checkins.create', 'checkins.read'],
  pt: ['pt_sessions.read', 'pt_sessions.create', 'pt_sessions.complete', 'pt_sessions.cancel'],
  leads: ['leads.read', 'leads.create', 'leads.update'],
}
const MANAGER_EXTRA = ['contracts.approve', 'contracts.freeze', 'contracts.cancel', 'payments.confirm', 'payments.refund', 'checkins.override', 'reports.view', 'reports.view_revenue', 'reports.export']
const ALL = [...Object.values(P).flat(), ...MANAGER_EXTRA, 'roles.read', 'roles.assign', 'system.view_audit_log', 'system.manage_settings', 'attendance.read', 'attendance.manage', 'devices.manage', 'payroll.read', 'payroll.manage']

const ptTrainers = [{ id: 'pt1', name: 'PT Đạt', branches: [{ id: 'b-nb', name: 'Chi nhánh Nhà Bè' }] }, { id: 'pt2', name: 'PT Tuấn', branches: [{ id: 'b-q7', name: 'Chi nhánh Quận 7' }] }, { id: 'pt3', name: 'PT Ánh', branches: [{ id: 'b-q7', name: 'Chi nhánh Quận 7' }] }]
const mockOffs: { trainer_id: string; date: string }[] = []
const ptDay = (h: number, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString() }
const ptRow = (id: string, t: number, h: number, name: string | null, status: PtSession['status']): PtSession => ({ id, branch_id: 'b-nb', trainer: ptTrainers[t], member: name ? { id: 'm-' + id, code: 'M' + id, name, phone: '0900000000' } : null, contract_id: null, contract_code: null, sessions_left: null, start_at: ptDay(h), end_at: ptDay(h + 1), status, source: name ? 'manual' : 'zalo', note: null, completed_at: null })
const ptSessions: PtSession[] = [ptRow('a', 0, 9, 'Nguyễn Minh Khoa', 'completed'), ptRow('b', 1, 10, null, 'scheduled'), ptRow('c', 1, 17, 'Tô Ngọc Diệp', 'scheduled'), ptRow('d', 0, 18, 'Trần Thị Thu Hà', 'cancelled'), ptRow('e', 2, 19, 'Lê Văn An', 'no_show')]

const users: Record<string, { pw: string; me: Me }> = {
  'admin@gymhub.vn': { pw: 'admin123', me: { id: 'u1', email: 'admin@gymhub.vn', name: 'Chủ phòng', roles: ['super_admin'], permissions: ALL, branches, can_checkin: false, checkin_branch: null } },
  'quanly@gymhub.vn': {
    pw: 'quanly123',
    me: { id: 'u3', email: 'quanly@gymhub.vn', name: 'Phạm Minh Quân', roles: ['manager'], permissions: [...Object.values(P).flat(), ...MANAGER_EXTRA], branches: [branches[1]], can_checkin: true, checkin_branch: branches[1] },
  },
  'letan@gymhub.vn': {
    pw: 'letan123',
    me: { id: 'u2', email: 'letan@gymhub.vn', name: 'Lê Thu Hà', roles: ['receptionist'], permissions: [...Object.values(P).flat()], branches: [branches[2]], can_checkin: true, checkin_branch: branches[2] },
  },
}

const roleDefs: RoleRow[] = [
  { id: 'r1', key: 'super_admin', name: 'super_admin', description: 'Toàn quyền', permissions: ALL },
  { id: 'r2', key: 'owner', name: 'owner', description: 'Chủ phòng tập', permissions: ALL },
  { id: 'r3', key: 'manager', name: 'manager', description: 'Quản lý chi nhánh', permissions: [...Object.values(P).flat(), ...MANAGER_EXTRA] },
  { id: 'r4', key: 'receptionist', name: 'receptionist', description: 'Lễ tân', permissions: Object.values(P).flat() },
  { id: 'r5', key: 'accountant', name: 'accountant', description: 'Kế toán', permissions: ['payments.read', 'payments.confirm', 'reports.view', 'reports.view_revenue', 'reports.export', 'contracts.read'] },
]
let scanDemoShown = false
const printDefaults: Record<string, { title: string; body: string }> = {
  contract_member: { title: 'HỢP ĐỒNG HỘI VIÊN', body: 'TH GYM & FITNESS - {{chi_nhanh}}\n\nSố hợp đồng: {{ma_hop_dong}}\nHội viên: {{ten_hoi_vien}} - SĐT: {{sdt}}\nGói tập: {{goi_tap}}\nHiệu lực: {{ngay_bat_dau}} đến {{ngay_het_han}}\nCòn thiếu: {{con_thieu}}' },
  contract_pt: { title: 'HỢP ĐỒNG HUẤN LUYỆN CÁ NHÂN (PT)', body: 'Số hợp đồng: {{ma_hop_dong}}\nHội viên: {{ten_hoi_vien}}\nGói PT: {{goi_tap}}\nPT phụ trách: {{pt_phu_trach}}' },
  contract_deposit: { title: 'HỢP ĐỒNG ĐẶT CỌC', body: 'Số hợp đồng: {{ma_hop_dong}}\nHội viên: {{ten_hoi_vien}}\nĐã cọc: {{da_thanh_toan}} / {{tong_tien}}' },
  freeze_form: { title: 'PHIẾU BẢO LƯU HỢP ĐỒNG', body: 'Hợp đồng: {{ma_hop_dong}}\nHội viên: {{ten_hoi_vien}}\nSố ngày bảo lưu: {{so_ngay_bao_luu}}\nLý do: {{ly_do}}' },
  transfer_form: { title: 'PHIẾU CHUYỂN NHƯỢNG HỢP ĐỒNG', body: 'Người chuyển: {{ten_hoi_vien}}\nNgười nhận: {{nguoi_nhan}}\nHợp đồng: {{ma_hop_dong}}\nPhí: {{phi_chuyen_nhuong}}' },
}
const printTpls: Record<string, { title: string; body: string }> = JSON.parse(JSON.stringify(printDefaults))
const printEdited = new Set<string>()
const sheetsCfg = { leads: { name: '', url: '' }, payroll: { name: '', url: '' }, pt_group: { name: '', url: '' } }
const mktMetrics: { month: string; channel: string; spend: number; impressions: number; clicks: number; leads: number; note: string }[] = []
const znsCfg = {
  app_id: '', oa_id: '', test_phone: '', has_secret_key: false, has_access_token: false, has_refresh_token: false,
  events: {
    new_contract: { enabled: false, template_id: '', days: [] as number[], params: {} as Record<string, string> },
    renewal: { enabled: false, template_id: '', days: [] as number[], params: {} as Record<string, string> },
    expiring: { enabled: true, template_id: '123456', days: [30, 14, 7], params: { ten_khach: 'customer_name', ngay_het_han: 'end_date' } as Record<string, string> },
    pt_signed: { enabled: false, template_id: '', days: [] as number[], params: {} as Record<string, string> },
  },
}
const znsLogs = [
  { id: 'zl1', event: 'expiring', phone: '84903000111', status: 'sent', error: null as string | null, created_at: new Date(Date.now() - 3600_000).toISOString() },
  { id: 'zl2', event: 'new_contract', phone: '84903000222', status: 'failed', error: '-118 user not found' as string | null, created_at: new Date(Date.now() - 7200_000).toISOString() },
]
const botCfg = {
  enabled: false, has_token: false, bot_name: 'Bot AI TH Gym', pt_group: '', branch_id: '', group_trainer: 'Thịnh', group_windows: '06:30-07:45, 20:00-21:15',
  state: { lastPollAt: null as string | null, lastError: null as string | null, lastItemAt: null as string | null, chats: [{ id: 'zgr-demo1', type: 'GROUP', name: 'Nhóm PT TH Gym', at: new Date().toISOString() }] },
}
const attDevices = [{ id: 'dv1', name: 'Cổng chính', branch_id: 'b-nb', branch_name: 'Chi nhánh Nhà Bè', device_key: 'a1b2c3d4e5f60718293a4b5c6d7e8f90', last_seen_at: null as string | null }]
const attDay = (d: number, a: string, b: string | null) => {
  const day = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10)
  return { date: day, first: `${day}T${a}:00+07:00`, last: `${day}T${b ?? a}:00+07:00`, count: b ? 2 : 1, hours: b ? Math.round(((Date.parse(`${day}T${b}:00+07:00`) - Date.parse(`${day}T${a}:00+07:00`)) / 3600000) * 100) / 100 : 0 }
}

const payrollTiers = (a: [number | null, number][]) => a.map(([upTo, rate]) => ({ upTo, rate }))
const payrollSettings = {
  memberTiers: payrollTiers([[15_000_000, 1.5], [25_000_000, 2.5], [35_000_000, 3.5], [null, 4.5]]),
  ptTiers: payrollTiers([[30_000_000, 25], [50_000_000, 27], [65_000_000, 30], [null, 35]]),
  marketingTiers: payrollTiers([[129_000_000, 1.5], [179_000_000, 3], [null, 4]]),
  ptImmediateShare: 0.4,
  ptSessionShare: 0.6,
  classRate: 100000,
  insuranceRate: 10.5,
  partTimeTaxRate: 10,
  taxBrackets: [] as { upTo: number | null; rate: number }[],
  personalDeduction: null as number | null,
  dependentDeduction: null as number | null,
}
const payrollStaff = [
  { user_id: 'pr-khanh', name: 'Khánh', email: 'khanh@thgym.com', roles: ['trainer'], branch_codes: ['q7'], profile: { position: 'pt_fulltime', base_salary: 8_000_000, has_insurance: true, tax_mode: 'progressive', dependents: 0, active: true } as Record<string, unknown> | null },
  { user_id: 'pr-trang', name: 'Trang', email: 'trang@thgym.com', roles: ['trainer'], branch_codes: ['q7'], profile: { position: 'pt_fulltime', base_salary: 8_000_000, has_insurance: true, tax_mode: 'progressive', dependents: 1, active: true } as Record<string, unknown> | null },
  { user_id: 'pr-thinh', name: 'Thịnh', email: 'thinh@thgym.com', roles: ['trainer'], branch_codes: ['q7'], profile: { position: 'pt_parttime', base_salary: 0, has_insurance: false, tax_mode: 'flat10', dependents: 0, active: true } as Record<string, unknown> | null },
  { user_id: 'pr-tam', name: 'Trần Trí Tâm', email: 'tam@thgym.com', roles: ['sales'], branch_codes: ['q7'], profile: { position: 'marketing', base_salary: 12_000_000, has_insurance: true, tax_mode: 'progressive', dependents: 0, active: true } as Record<string, unknown> | null },
]
const payrollAdj: Record<string, { penalty: number; adjustment: number; note: string | null }> = {}
const payrollClosed = new Set<string>()
const prTier = (v: number, tiers: { upTo: number | null; rate: number }[]) => {
  let left = v
  let from = 0
  let sum = 0
  for (const t of tiers) {
    const top = t.upTo ?? Infinity
    const part = Math.max(0, Math.min(left, top - from))
    sum += (part * t.rate) / 100
    left -= part
    from = top
    if (left <= 0) break
  }
  return Math.round(sum)
}
function payrollRows(month: string) {
  const seed: Record<string, { member: number; pt: number; taught: number; classes: number }> = {
    'pr-khanh': { member: 18_000_000, pt: 36_000_000, taught: 22, classes: 0 },
    'pr-trang': { member: 9_000_000, pt: 22_000_000, taught: 16, classes: 8 },
    'pr-thinh': { member: 4_000_000, pt: 0, taught: 6, classes: 20 },
    'pr-tam': { member: 31_000_000, pt: 5_000_000, taught: 0, classes: 0 },
  }
  const s = payrollSettings
  return payrollStaff.filter((u) => u.profile && u.profile.active).map((u) => {
    const p = u.profile as { position: string; base_salary: number; has_insurance: boolean; tax_mode: string }
    const d = seed[u.user_id]
    const adj = payrollAdj[`${u.user_id}:${month}`] ?? { penalty: 0, adjustment: 0, note: null }
    const ptRate = d.pt > 0 ? (s.ptTiers.find((t) => t.upTo == null || d.pt <= t.upTo) as { rate: number }).rate : 0
    const marketing = p.position === 'marketing' ? prTier(120_000_000, s.marketingTiers) : 0
    const memberCommission = prTier(d.member, s.memberTiers)
    const ptImmediate = Math.round((d.pt * ptRate * s.ptImmediateShare) / 100)
    const ptSession = p.position === 'marketing' ? 0 : Math.round(d.taught * 41_000)
    const groupPay = p.position === 'marketing' ? 0 : d.classes * s.classRate
    const gross = p.base_salary + memberCommission + marketing + ptImmediate + ptSession + groupPay
    const insurance = p.has_insurance ? Math.round((p.base_salary * s.insuranceRate) / 100) : 0
    const taxPending = p.tax_mode === 'progressive' && s.taxBrackets.length === 0
    const tax = p.tax_mode === 'flat10' ? Math.round((gross * s.partTimeTaxRate) / 100) : 0
    return {
      user_id: u.user_id, name: u.name, position: p.position, base_salary: p.base_salary,
      member_sales: d.member, member_commission: memberCommission, marketing_commission: marketing,
      pt_sales: d.pt, pt_rate: ptRate, pt_immediate: ptImmediate, pt_session_pay: ptSession, pt_sessions_taught: d.taught,
      group_classes: d.classes, group_pay: groupPay, gross, insurance, tax, tax_pending: taxPending,
      penalty: adj.penalty, adjustment: adj.adjustment, net: gross - insurance - tax - adj.penalty + adj.adjustment, note: adj.note,
    }
  })
}
const attRows = [
  { user_id: 'u2', name: 'Lê Thu Hà', employee_no: '12', linked: true, days: [attDay(2, '08:02', '17:05'), attDay(1, '08:10', '17:00'), attDay(0, '07:58', null)] },
  { user_id: 'u3', name: 'Phạm Minh Quân', employee_no: '15', linked: true, days: [attDay(1, '09:00', '18:10')] },
  { user_id: null, name: 'Chưa gán (mã 21)', employee_no: '21', linked: false, days: [attDay(0, '10:00', '12:00')] },
].map((r) => ({ ...r, total_days: r.days.length, total_hours: Math.round(r.days.reduce((a, d) => a + d.hours, 0) * 100) / 100 }))
const adminUsers = [
  { id: 'u1', email: 'admin@gymhub.vn', name: 'Chủ phòng', roles: [{ id: 'ur1', role: 'super_admin', branch_id: null as string | null }] },
  { id: 'u3', email: 'quanly@gymhub.vn', name: 'Phạm Minh Quân', roles: [{ id: 'ur3', role: 'manager', branch_id: 'b-nb' as string | null }] },
  { id: 'u2', email: 'letan@gymhub.vn', name: 'Lê Thu Hà', roles: [{ id: 'ur2', role: 'receptionist', branch_id: 'b-q7' as string | null }] },
  { id: 'u5', email: 'ketoan@gymhub.vn', name: 'Kế toán', roles: [{ id: 'ur5', role: 'accountant', branch_id: null as string | null }] },
]

let rnd = 7
const rand = (n: number) => {
  rnd = (rnd * 1103515245 + 12345) & 0x7fffffff
  return rnd % n
}
const last = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Ngô', 'Dương', 'Lý']
const mid = ['Văn', 'Thị', 'Minh', 'Gia', 'Thanh', 'Hồng', 'Quốc', 'Ngọc', 'Anh', 'Thùy']
const first = ['An', 'Bình', 'Cường', 'Đức', 'Hà', 'Huy', 'Lan', 'Khang', 'Mai', 'Tuấn', 'Linh', 'Long', 'Yến', 'Phúc', 'Vy', 'Châu', 'Dũng', 'Nhi', 'Hiếu', 'Trinh']
const members: Member[] = Array.from({ length: 60 }, (_, i) => {
  const female = i % 3 === 1 || mid[(i * 7) % 10] === 'Thị' || mid[(i * 7) % 10] === 'Ngọc'
  return {
    id: `m${i + 1}`,
    code: `HV${String(i + 1).padStart(4, '0')}`,
    name: `${last[(i * 4 + 1) % 15]} ${female && i % 2 ? 'Thị' : mid[(i * 7) % 10]} ${first[(i * 3 + 2) % 20]}`,
    phone: `09${String(10000000 + ((i * 913577) % 89999999)).slice(0, 8)}`,
    email: i % 3 === 0 ? `hv${i + 1}@example.com` : null,
    dob: `199${i % 10}-0${(i % 9) + 1}-15`,
    gender: female ? 'female' : 'male',
    status: 'active',
    branch_id: i % 7 === 5 ? 'b-q2' : i % 5 < 2 ? 'b-q7' : 'b-nb',
    avatar_url: null,
    created_at: new Date(Date.now() - (i * 9 + 3) * 86400000).toISOString(),
  }
})

interface PkgTpl { key: string; name: string; category: Pkg['category']; type: Pkg['type']; duration_days: number | null; sessions: number | null; price: number; gift?: string; checkin_before?: string; bundle_only?: boolean; bundle?: string }
const PKG_TPLS: PkgTpl[] = [
  { key: 'm1', name: 'MEMBER 1 THÁNG', category: 'member', type: 'month', duration_days: 30, sessions: null, price: 700000 },
  { key: 'm3', name: 'MEMBER 3 THÁNG + 1', category: 'member', type: 'month', duration_days: 120, sessions: null, price: 1990000 },
  { key: 'm6', name: 'MEMBER 6 THÁNG + 4', category: 'member', type: 'month', duration_days: 300, sessions: null, price: 3990000, gift: 'Túi tote' },
  { key: 'm12', name: 'GÓI 12 THÁNG (TẶNG 6 THÁNG)', category: 'member', type: 'month', duration_days: 540, sessions: null, price: 6590000, gift: 'Ô gấp' },
  { key: 'e1', name: 'ECO 1 THÁNG', category: 'member', type: 'month', duration_days: 30, sessions: null, price: 700000, checkin_before: '14:00' },
  { key: 'e3', name: 'ECO 3 THÁNG', category: 'member', type: 'month', duration_days: 90, sessions: null, price: 1100000, checkin_before: '14:00' },
  { key: 'e6', name: 'ECO 6 THÁNG + 1', category: 'member', type: 'month', duration_days: 210, sessions: null, price: 2200000, gift: 'Túi tote', checkin_before: '14:00' },
  { key: 'e12', name: 'ECO 12 THÁNG + 3', category: 'member', type: 'month', duration_days: 450, sessions: null, price: 4000000, gift: 'Ô gấp', checkin_before: '14:00' },
  { key: 'b1', name: 'Member PT 10b', category: 'member', type: 'month', duration_days: 30, sessions: null, price: 0, bundle_only: true },
  { key: 'b2', name: 'Member PT 20b', category: 'member', type: 'month', duration_days: 60, sessions: null, price: 0, bundle_only: true },
  { key: 'b3', name: 'MEMBER PT 30b', category: 'member', type: 'month', duration_days: 90, sessions: null, price: 0, bundle_only: true },
  { key: 'b6', name: 'Member PT 60b', category: 'member', type: 'month', duration_days: 180, sessions: null, price: 0, bundle_only: true },
  { key: 'b8', name: 'Member PT 100b', category: 'member', type: 'month', duration_days: 240, sessions: null, price: 0, bundle_only: true },
  { key: 'pt10', name: 'PT 1:1 - 10b', category: 'pt_1on1', type: 'session', duration_days: 30, sessions: 10, price: 5850000, bundle: 'b1' },
  { key: 'pt20', name: 'PT 1:1 - 20b', category: 'pt_1on1', type: 'session', duration_days: 60, sessions: 20, price: 9900000, bundle: 'b2', gift: 'Túi Tote' },
  { key: 'pt30', name: 'PT 1:1 - 30b', category: 'pt_1on1', type: 'session', duration_days: 30, sessions: 30, price: 14250000, bundle: 'b3', gift: 'Ô gấp' },
  { key: 'pt60', name: 'PT 1:1 - 60 BUỔI', category: 'pt_1on1', type: 'session', duration_days: 30, sessions: 60, price: 25200000, bundle: 'b6', gift: 'Ô Gấp' },
  { key: 'pt100', name: 'PT 1:1 - 100 BUỔI', category: 'pt_1on1', type: 'session', duration_days: 30, sessions: 100, price: 35800000, bundle: 'b8', gift: 'Ô Gấp' },
  { key: 'grp10', name: 'PT NHÓM 10 BUỔI', category: 'pt_group', type: 'session', duration_days: 30, sessions: 10, price: 2350000, bundle: 'b1' },
  { key: 'grp20', name: 'PT NHÓM 20 BUỔI', category: 'pt_group', type: 'session', duration_days: 30, sessions: 20, price: 4050000, bundle: 'b2', gift: 'Túi Tote' },
]
const LEGACY_IDS: Record<string, Record<string, string>> = {
  'b-nb': { m1: 'p2', m3: 'p7', m6: 'p19', m12: 'p9', pt10: 'p3' },
  'b-q7': { m1: 'p5', m3: 'p17', m6: 'p6', m12: 'p8', pt10: 'p10', pt30: 'p15', pt60: 'p16', grp20: 'p18' },
  'b-q2': { m1: 'p11', m3: 'p12', m12: 'p13', pt10: 'p14' },
}
const packages: Pkg[] = []
const bundleIds = new Map<string, string>()
const PKG_ID: Record<string, Record<string, string>> = {}
for (const br of branches) {
  PKG_ID[br.id] = {}
  for (const t of PKG_TPLS) PKG_ID[br.id][t.key] = LEGACY_IDS[br.id]?.[t.key] ?? `d-${br.code.toLowerCase()}-${t.key}`
  for (const t of PKG_TPLS) {
    const id = PKG_ID[br.id][t.key]
    packages.push({ id, name: t.name, category: t.category, type: t.type, duration_days: t.duration_days, sessions: t.sessions, price: t.price, vat_percent: 0, branch_id: br.id, active: true, bundle_only: !!t.bundle_only, gift: t.gift ?? null, checkin_before: t.checkin_before ?? null, display_group: null })
    if (t.bundle) bundleIds.set(id, PKG_ID[br.id][t.bundle])
  }
}
packages.push(
  { id: 'p4', name: 'GÓI 3 THÁNG (cũ)', category: 'member', type: 'month', duration_days: 90, sessions: null, price: 1500000, vat_percent: 0, branch_id: 'b-q7', active: false },
  { id: 'p20', name: 'PT 1:2 - 12 BUỔI (cũ)', category: 'pt_1on2', type: 'session', duration_days: null, sessions: 12, price: 2400000, vat_percent: 0, branch_id: 'b-nb', active: false },
  { id: 'p21', name: 'GÓI 1 THÁNG KHUYẾN MÃI HÈ (cũ)', category: 'member', type: 'month', duration_days: 30, sessions: null, price: 500000, vat_percent: 0, branch_id: 'b-nb', active: false },
  { id: 'p22', name: 'GÓI 1 THÁNG KHUYẾN MÃI THU (cũ)', category: 'member', type: 'month', duration_days: 30, sessions: null, price: 550000, vat_percent: 0, branch_id: 'b-nb', active: false, replaces_id: 'p21' },
  { id: 'p23', name: 'PT 1:1 - 8 BUỔI (cũ)', category: 'pt_1on1', type: 'session', duration_days: null, sessions: 8, price: 2400000, vat_percent: 0, branch_id: 'b-nb', active: false },
)

const DAY = 86400000
const iso = (offsetDays = 0) => new Date(Date.now() + offsetDays * DAY).toISOString()
const day = (offsetDays = 0) => iso(offsetDays).slice(0, 10)
let seq = 100
const leads: Lead[] = [
  { id: 'ld1', name: 'Phạm Quốc Bảo', phone: '0911000111', email: null, source: 'Facebook', status: 'new', note: null, branch_id: 'b-nb', assigned_to: null, trial_at: null, member_id: null, created_at: iso(-2), updated_at: iso(-2) },
  { id: 'ld2', name: 'Võ Thị Mai', phone: '0911000222', email: null, source: 'Giới thiệu', status: 'trial_booked', note: 'Hẹn thứ 7', branch_id: 'b-q7', assigned_to: null, trial_at: null, member_id: null, created_at: iso(-5), updated_at: iso(-5) },
]
const nid = (p: string) => `${p}${++seq}`

const contracts: Contract[] = []
const payments: Payment[] = []
const shifts: Shift[] = []
const checkins: (CheckinItem & { branch_id: string; direction: string })[] = []
const audit: AuditRow[] = []

function pkgOf(id: string) {
  return packages.find((p) => p.id === id) as Pkg
}
function pkgOut(p: Pkg): Pkg {
  const n = contracts.filter((c) => c.package_id === p.id).length
  const b = bundleIds.get(p.id)
  const bp = b ? packages.find((x) => x.id === b) : undefined
  return { ...p, replaces_id: p.replaces_id ?? null, contracts_count: n, in_use: n > 0, bundled_member_package: bp ? { id: bp.id, name: bp.name, duration_days: bp.duration_days, price: bp.price } : null }
}
function memberOf(id: string) {
  return members.find((m) => m.id === id) as Member
}
const ORDER = ['active', 'frozen', 'signed', 'draft', 'expired', 'cancelled']
const isPt = (c: Contract) => c.package.category.startsWith('pt_')
function currentOf(memberId: string) {
  const cs = contracts.filter((c) => c.member_id === memberId && !isPt(c))
  return ORDER.map((st) => cs.find((c) => c.status === st)).find(Boolean) ?? null
}
function ptOf(memberId: string) {
  const cs = contracts.filter((c) => c.member_id === memberId && isPt(c) && !['draft', 'signed', 'cancelled'].includes(c.status))
  return ORDER.map((st) => cs.find((c) => c.status === st)).find(Boolean) ?? null
}
const usageDeadlineOf = (c: Contract) => (c.package.category === 'pt_1on1' ? ptUsageDeadline(c.end_date, c.sessions_total) : null)
function ptOut(c: Contract): PtContract {
  const dl = usageDeadlineOf(c)
  return {
    id: c.id, code: c.code, status: c.status, package_name: c.package.name, start_date: c.start_date, end_date: c.end_date,
    package_category: c.package.category, sessions_total: c.sessions_total, sessions_left: c.sessions_left, usage_deadline: dl,
    usage_valid: c.package.category === 'pt_1on1' ? ['active', 'expired'].includes(c.status) && (dl ? dl >= day(0) : true) : c.status === 'active' && (c.end_date ? c.end_date >= day(0) : true),
  }
}
function eligibilityOf(memberId: string): PtEligibility {
  const mc = currentOf(memberId)
  const pc = ptOf(memberId)
  const memberOk = !!mc && mc.status === 'active' && !!mc.end_date && mc.end_date >= day(0)
  const pt = pc ? ptOut(pc) : null
  const reasons: PtEligibility['reasons'] = []
  if (!memberOk) reasons.push('MEMBER_PACKAGE_EXPIRED')
  if (!pt) reasons.push('NO_PT_PACKAGE')
  else if (!pt.usage_valid) reasons.push(pt.package_category === 'pt_1on1' ? 'PT_USAGE_EXPIRED' : 'PT_PACKAGE_EXPIRED')
  return {
    eligible: reasons.length === 0,
    reasons,
    member_package: { ok: memberOk, contract_code: mc?.code ?? null, end_date: mc?.end_date ?? null },
    pt_package: { category: pt?.package_category ?? null, ok: !!pt?.usage_valid, contract_code: pc?.code ?? null, end_date: pc?.end_date ?? null, usage_deadline: pt?.usage_deadline ?? null, sessions_left: pc?.sessions_left ?? null },
  }
}
const photos = new Map<string, { content_type: string; image_base64: string; version: number }>()
const bonusDays = new Map<string, number>()
function memberOut(m: Member): Member {
  const c = currentOf(m.id)
  const ptContract = ptOf(m.id)
  const b = branches.find((x) => x.id === m.branch_id)
  const ph = photos.get(m.id)
  return {
    ...m,
    face_id: m.face_id ?? null,
    has_photo: !!ph,
    photo_version: ph?.version ?? null,
    status: c?.status === 'active' ? 'active' : c?.status === 'frozen' ? 'frozen' : 'expired',
    branch: b ?? null,
    current_contract: c ? { id: c.id, code: c.code, status: c.status, package_name: c.package.name, package_type: c.package.type, start_date: c.start_date, end_date: c.end_date, sessions_left: c.sessions_left } : null,
    pt_contract: ptContract ? ptOut(ptContract) : null,
  }
}
const mockTickets: Ticket[] = []
function mockTicketQuote(c: Contract, type: string, packageId: string, canApprove: boolean) {
  const old = packages.find((x) => x.id === c.package_id)
  const nw = packages.find((x) => x.id === packageId)
  const r1000 = (n: number) => Math.round(n / 1000) * 1000
  const ratio = c.sessions_total ? (c.sessions_left ?? 0) / c.sessions_total : 0.5
  let fee = 0
  let approval = false
  let note: string | null = null
  if (type === 'upgrade' || type === 'convert') {
    if (!nw) return { type, fee: 0, requires_approval: false, new_end_date: null, new_sessions_total: null, new_sessions_left: null, refund: null, note: 'Chọn gói mới' }
    fee = type === 'upgrade' ? Math.max(0, nw.price - (old?.price ?? 0)) : Math.max(0, nw.price - r1000((old?.price ?? 0) * ratio))
  } else if (type === 'downgrade') {
    approval = true
    fee = nw ? -r1000(Math.max(0, (old?.price ?? 0) - nw.price) * ratio) : 0
    note = 'Hạ cấp tính theo phần còn lại của gói cũ'
  } else if (type === 'transfer') {
    approval = true
    fee = 500000
    note = 'Phí chuyển nhượng cố định'
  } else if (type === 'cancel') {
    approval = true
    fee = -r1000(c.paid_amount * ratio * 0.9)
    note = 'Hoàn phần còn lại, trừ 10% phí'
  }
  const days = nw?.duration_days ?? null
  const end = days ? new Date(Date.now() + days * 86400000).toISOString().slice(0, 10) : null
  return { type, fee, requires_approval: approval && !canApprove, new_end_date: nw ? end : null, new_sessions_total: nw?.sessions ?? null, new_sessions_left: nw?.sessions ?? null, refund: fee < 0 ? -fee : null, note }
}
function contractOut(c: Contract): Contract {
  const last = payments.filter((p) => p.contract_id === c.id && p.status === 'confirmed').sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  const bundled: BundledContract[] = contracts.filter((x) => x.bundle_of_id === c.id).map((x) => ({ id: x.id, code: x.code, status: x.status, start_date: x.start_date, end_date: x.end_date, package: x.package }))
  return { ...c, bundle_of_id: c.bundle_of_id ?? null, bundled_contracts: isPt(c) ? bundled : undefined, usage_deadline: c.package.category === 'pt_1on1' ? usageDeadlineOf(c) : undefined, last_payment_method: last?.method ?? null, last_paid_at: last?.created_at ?? null, branch: branches.find((b) => b.id === c.branch_id) ?? null }
}
function log(actor: string, action: string, resource: string, result = 'ALLOW', ago = 0) {
  audit.unshift({ id: nid('a'), actor_email: actor, actor, action, resource, result, ip: '127.0.0.1', created_at: new Date(Date.now() - ago).toISOString() })
}
function addEvent(c: Contract, type: string, by: string, reason: string | null = null, diff: unknown = null) {
  c.events = c.events ?? []
  c.events.push({ id: nid('e'), type, by_user: by, reason, diff, created_at: new Date().toISOString() })
}
function recalc(c: Contract) {
  c.paid_amount = payments.filter((p) => p.contract_id === c.id && p.status === 'confirmed').reduce((s, p) => s + p.amount, 0)
  c.debt_amount = Math.max(0, c.total_amount - c.paid_amount)
}
function seedContract(memberId: string, packageId: string, status: Contract['status'], paid: number, startOffset: number | null, by = 'Hệ thống') {
  const m = memberOf(memberId)
  const pk = pkgOf(packageId)
  const total = Math.round(pk.price * (1 + pk.vat_percent / 100))
  const start = startOffset == null ? null : day(startOffset)
  const c: Contract = {
    id: nid('c'), code: `HD${String(contracts.length + 1).padStart(5, '0')}`, member_id: m.id, package_id: pk.id, branch_id: m.branch_id, status,
    total_amount: total, discount: 0, paid_amount: 0, debt_amount: total, start_date: start,
    end_date: start && pk.duration_days ? day(startOffset! + pk.duration_days) : start ? day(startOffset! + 30) : null,
    sessions_total: pk.sessions, sessions_left: pk.sessions, signed_at: status === 'draft' ? null : iso(-10), activated_at: ['active', 'frozen', 'expired'].includes(status) ? iso(-10) : null,
    frozen_until: status === 'frozen' ? day(10) : null, renewed_from_id: null, note: null, created_at: iso(-12),
    member: { id: m.id, code: m.code, name: m.name, phone: m.phone }, package: { id: pk.id, name: pk.name, type: pk.type, category: pk.category }, events: [],
  }
  addEvent(c, 'created', by)
  if (status !== 'draft') addEvent(c, 'signed', by)
  if (paid > 0) {
    payments.push({ id: nid('pay'), contract_id: c.id, method: 'cash', amount: paid, status: 'confirmed', ref: null, shift_id: null, note: null, created_by: by, created_at: iso(-(startOffset == null ? 1 : -startOffset)), confirmed_at: iso(-(startOffset == null ? 1 : -startOffset)) })
  }
  contracts.unshift(c)
  recalc(c)
  return c
}
const PKG_BY_BRANCH: Record<string, string[]> = Object.fromEntries(branches.map((br) => [br.id, ['m1', 'm3', 'm6', 'm12'].map((k) => PKG_ID[br.id][k])]))
const REMAIN = [1, 1, 2, 3, 5, 6, 9, 15, 20, 28, 45, 70, 120, 200, 300]
seedContract('m3', 'p2', 'expired', 648000, -45)
seedContract('m4', 'p2', 'frozen', 648000, -15)
for (let k = 1; k <= 60; k++) {
  if (k === 3 || k === 4 || k === 9) continue
  const m = memberOf(`m${k}`)
  const pid = PKG_BY_BRANCH[m.branch_id][rand(4)]
  const pk = pkgOf(pid)
  const dur = pk.duration_days ?? 30
  const total = Math.round(pk.price * (1 + pk.vat_percent / 100))
  const r = rand(100)
  const part = rand(5) === 0 ? Math.round(total / 2) : total
  if (r < 58) seedContract(m.id, pid, 'active', part, Math.min(REMAIN[rand(15)], dur - 1) - dur)
  else if (r < 70) seedContract(m.id, pid, 'expired', total, -(dur + 5 + rand(40)))
  else if (r < 77) seedContract(m.id, pid, 'frozen', total, -(Math.min(dur, 30) - 5))
  else if (r < 85) seedContract(m.id, pid, 'signed', Math.round(total / 2), null)
  else if (r < 91) seedContract(m.id, pid, 'draft', 0, null).created_at = iso(0)
  else if (r < 94) seedContract(m.id, pid, 'cancelled', 0, -20)
}
;([-6, -5, -4, -3, -2, -1].forEach((d, i) =>
  payments.push({ id: nid('pay'), contract_id: contracts[i % contracts.length].id, method: (['cash', 'transfer', 'vietqr', 'cash', 'ewallet', 'cash'] as PayMethod[])[i], amount: 400000 + i * 120000, status: 'confirmed', ref: null, shift_id: null, note: null, created_by: 'Hệ thống', created_at: iso(d), confirmed_at: iso(d) }),
))
payments.push(
  { id: nid('pay'), contract_id: contracts[0].id, method: 'cash', amount: 700000, status: 'confirmed', ref: null, shift_id: null, note: null, created_by: 'Hệ thống', created_at: iso(0), confirmed_at: iso(0) },
  { id: nid('pay'), contract_id: contracts[1].id, method: 'transfer', amount: 100000, status: 'confirmed', ref: null, shift_id: null, note: null, created_by: 'Hệ thống', created_at: iso(0), confirmed_at: iso(0) },
)
contracts.slice(0, 2).forEach(recalc)
payments[3].refund_requested = true
const todayStart = new Date().setHours(0, 0, 0, 0)
members
  .filter((m) => contracts.some((c) => c.member_id === m.id && c.status === 'active'))
  .slice(0, 12)
  .forEach((m, k) => {
    const at = Math.max(todayStart + 60000, Date.now() - (15 * k + 5) * 60000)
    checkins.push({
      id: nid('ci'), member: { id: m.id, code: m.code, name: m.name }, result: 'allowed', reason: null, created_at: new Date(at).toISOString(),
      checked_out_at: k < 2 ? null : new Date(at + 50 * 60000).toISOString(), branch_id: m.branch_id, direction: 'in',
    })
  })
log('admin@gymhub.vn', 'auth.login', 'session', 'ALLOW', 3600000)
log('letan@gymhub.vn', 'contracts.cancel', 'contract', 'DENY', 7200000)
log('quanly@gymhub.vn', 'payments.confirm', 'payment', 'ALLOW', 9000000)

const METHOD_CYCLE: PayMethod[] = ['cash', 'transfer', 'vietqr', 'ewallet', 'cash', 'transfer']
for (let k = 0; k < 60; k++) {
  const mi = (k * 7) % 60 + 1
  if (mi === 3 || mi === 4 || mi === 9) continue
  const m = memberOf(`m${mi}`)
  const pid = PKG_BY_BRANCH[m.branch_id][rand(4)]
  const pk = pkgOf(pid)
  const dur = pk.duration_days ?? 30
  const total = Math.round(pk.price * (1 + pk.vat_percent / 100))
  const r = rand(100)
  const ago = 5 + rand(150)
  const part = rand(4) === 0 ? Math.round(total * 0.4) : total
  const c =
    r < 55 ? seedContract(m.id, pid, 'active', part, -Math.min(ago, dur - 2))
    : r < 80 ? seedContract(m.id, pid, 'expired', total, -(dur + ago))
    : r < 88 ? seedContract(m.id, pid, 'frozen', total, -Math.min(dur - 3, 20))
    : r < 94 ? seedContract(m.id, pid, 'signed', Math.round(total / 2), null)
    : seedContract(m.id, pid, 'cancelled', 0, -ago)
  c.signed_at = iso(c.start_date ? -Math.max(1, Math.round((Date.now() - new Date(c.start_date).getTime()) / DAY)) : -2)
  c.created_at = c.signed_at
  payments.filter((p) => p.contract_id === c.id).forEach((p, i) => {
    p.method = METHOD_CYCLE[(k + i) % METHOD_CYCLE.length]
    p.created_at = c.signed_at as string
    p.confirmed_at = c.signed_at
    p.ref = p.method === 'cash' ? null : `GD${100000 + k * 37 + i}`
  })
  recalc(c)
}
const PT_BY_BRANCH: Record<string, string[]> = Object.fromEntries(branches.map((br) => [br.id, ['pt10', 'pt20', 'pt30', 'pt60', 'grp20', 'pt100'].map((k) => PKG_ID[br.id][k])]))
function seedPt(m: Member, pid: string, endOffset: number, left: number) {
  const pk = pkgOf(pid)
  const c = seedContract(m.id, pid, 'active', Math.round(pk.price * (1 + pk.vat_percent / 100)), endOffset - 90)
  c.end_date = day(endOffset)
  c.sessions_left = Math.min(left, pk.sessions ?? left)
  return c
}
const PT_END = [20, 45, -15, -40, -130, -75, 8, -100]
members.filter((m) => currentOf(m.id)?.status === 'active').slice(0, 26).forEach((m, i) => {
  const list = PT_BY_BRANCH[m.branch_id]
  const pid = list[i % list.length]
  seedPt(m, pid, PT_END[i % PT_END.length], Math.max(0, 9 - (i % 5) * 2))
})
members.filter((m) => currentOf(m.id)?.status === 'expired').slice(0, 4).forEach((m, i) => {
  const list = PT_BY_BRANCH[m.branch_id]
  seedPt(m, list[0], [-10, 15, -10, 15][i], 5)
})

// ---- Kịch bản mẫu: mỗi hội viên "TEST ..." đại diện một trường hợp để chỉnh giao diện ----
let scenarioNo = 0
function addScenario(name: string, branch: string, extra: Partial<Member> = {}): Member {
  scenarioNo += 1
  const m: Member = {
    id: `ms${scenarioNo}`, code: `HV9${String(scenarioNo).padStart(3, '0')}`, name: `TEST ${name}`, phone: `0988${String(100000 + scenarioNo * 137).slice(0, 6)}`,
    email: `test${scenarioNo}@example.com`, dob: '1995-05-20', gender: scenarioNo % 2 ? 'male' : 'female', status: 'active', branch_id: branch, avatar_url: null,
    created_at: new Date(Date.now() - (30 + scenarioNo * 5) * DAY).toISOString(), ...extra,
  }
  members.push(m)
  return m
}
const Q7 = 'b-q7'
const pid = (br: string, key: string) => PKG_ID[br][key]
const startFor = (days: number, endInDays: number) => endInDays - days
addScenario('Chưa có hợp đồng', Q7)
addScenario('Member còn hạn dài', Q7, { face_id: 'FACE-0001' })
seedContract(`ms2`, pid(Q7, 'm3'), 'active', 1990000, startFor(120, 110))
addScenario('Sắp hết hạn 2 ngày', Q7)
seedContract('ms3', pid(Q7, 'm1'), 'active', 700000, startFor(30, 2))
addScenario('Hết hạn hôm nay', Q7)
seedContract('ms4', pid(Q7, 'm1'), 'active', 700000, startFor(30, 0))
addScenario('Đã hết hạn', Q7)
seedContract('ms5', pid(Q7, 'm1'), 'expired', 700000, -50)
addScenario('Đang bảo lưu', Q7)
seedContract('ms6', pid(Q7, 'm3'), 'frozen', 1990000, -40)
addScenario('Chờ ký (nháp)', Q7)
seedContract('ms7', pid(Q7, 'm1'), 'draft', 0, null)
addScenario('Đã ký, chưa kích hoạt', Q7)
seedContract('ms8', pid(Q7, 'm6'), 'signed', 1000000, null)
addScenario('Hợp đồng đã hủy', Q7)
seedContract('ms9', pid(Q7, 'm1'), 'cancelled', 0, -20)
addScenario('Nợ một phần', Q7)
seedContract('ms10', pid(Q7, 'm6'), 'active', 1500000, -20)
addScenario('Nợ toàn bộ', Q7)
seedContract('ms11', pid(Q7, 'm3'), 'active', 0, -5)
addScenario('Đã thu đủ', Q7)
seedContract('ms12', pid(Q7, 'm12'), 'active', 6590000, -60)
addScenario('Thanh toán chờ xác nhận', Q7)
{
  const c = seedContract('ms13', pid(Q7, 'm1'), 'signed', 700000, null)
  const pay = payments.find((x) => x.contract_id === c.id)
  if (pay) { pay.status = 'pending'; pay.method = 'vietqr'; pay.confirmed_at = null; pay.ref = 'GDTEST0013'; recalc(c) }
}
addScenario('Yêu cầu hoàn tiền', Q7)
{
  const c = seedContract('ms14', pid(Q7, 'm1'), 'active', 700000, -10)
  const pay = payments.find((x) => x.contract_id === c.id)
  if (pay) { pay.refund_requested = true; pay.method = 'transfer'; pay.ref = 'GDTEST0014' }
}
addScenario('Gói ECO vào trước 14h', Q7)
seedContract('ms15', pid(Q7, 'e3'), 'active', 1100000, -15)
addScenario('PT 1:1 còn nhiều buổi', Q7)
seedContract('ms16', pid(Q7, 'm3'), 'active', 1990000, -30)
seedPt(memberOf('ms16'), pid(Q7, 'pt30'), 60, 24)
addScenario('PT 1:1 hết buổi', Q7)
seedContract('ms17', pid(Q7, 'm3'), 'active', 1990000, -30)
seedPt(memberOf('ms17'), pid(Q7, 'pt10'), 40, 0)
addScenario('PT hết hạn, còn HSD', Q7)
seedContract('ms18', pid(Q7, 'm3'), 'active', 1990000, -30)
seedPt(memberOf('ms18'), pid(Q7, 'pt10'), -15, 6).status = 'expired'
addScenario('PT quá HSD', Q7)
seedContract('ms19', pid(Q7, 'm1'), 'active', 700000, -10)
seedPt(memberOf('ms19'), pid(Q7, 'pt10'), -130, 4).status = 'expired'
addScenario('PT nhóm', Q7)
seedContract('ms20', pid(Q7, 'm3'), 'active', 1990000, -30)
seedPt(memberOf('ms20'), pid(Q7, 'grp20'), 45, 14)
addScenario('PT 60 buổi (HSD +6 tháng)', Q7)
seedContract('ms21', pid(Q7, 'm6'), 'active', 3990000, -100)
seedPt(memberOf('ms21'), pid(Q7, 'pt60'), -100, 33)
addScenario('Có PT nhưng member hết hạn', Q7)
seedContract('ms22', pid(Q7, 'm1'), 'expired', 700000, -50)
seedPt(memberOf('ms22'), pid(Q7, 'pt10'), 20, 7)
addScenario('Mua PT kèm member tặng', Q7)
{
  const c = seedPt(memberOf('ms23'), pid(Q7, 'pt20'), 90, 18)
  const child = seedContract('ms23', pid(Q7, 'b2'), 'active', 0, -1)
  child.bundle_of_id = c.id
  child.end_date = day(60 - 1)
}
addScenario('Gia hạn hợp đồng', Q7)
{
  const old = seedContract('ms24', pid(Q7, 'm1'), 'expired', 700000, -60)
  const nw = seedContract('ms24', pid(Q7, 'm3'), 'active', 1990000, -10)
  nw.renewed_from_id = old.id
}
addScenario('Không email, không SĐT hợp lệ', Q7, { email: null, phone: '0900000000' })
seedContract('ms25', pid(Q7, 'm1'), 'active', 700000, -5)
addScenario('Khách chi nhánh Nhà Bè', 'b-nb')
seedContract('ms26', pid('b-nb', 'm3'), 'active', 1990000, -30)
addScenario('Khách chi nhánh Quận 2', 'b-q2')
seedContract('ms27', pid('b-q2', 'm1'), 'expired', 700000, -45)
addScenario('Tên rất dài để kiểm tra cắt chữ trong bảng và hộp thoại hội viên', Q7)
seedContract('ms28', pid(Q7, 'm12'), 'active', 3000000, -200)
const pendingSeed = payments.filter((p) => p.status === 'confirmed' && p.method === 'vietqr').slice(0, 3)
pendingSeed.forEach((p) => {
  p.status = 'pending'
  p.confirmed_at = null
  recalc(contracts.find((x) => x.id === p.contract_id) as Contract)
})
const VIEW_ONLY_MSG = 'Tài khoản quản trị chỉ xem thống kê, không thực hiện check-in.'
const REASONS: CheckinItem['reason'][] = ['EXPIRED', 'NO_ACTIVE_CONTRACT', 'FROZEN', 'WRONG_BRANCH', 'NO_SESSIONS']
for (let k = 0; k < 90; k++) {
  const m = members[(k * 11) % 60]
  const at = Date.now() - (1 + Math.floor(k / 6)) * DAY - rand(10 * 3600000)
  const denied = k % 9 === 4
  checkins.push({
    id: nid('ci'), member: { id: m.id, code: m.code, name: m.name }, result: denied ? 'denied' : 'allowed', reason: denied ? REASONS[k % REASONS.length] : null,
    created_at: new Date(at).toISOString(), checked_out_at: denied ? null : new Date(at + (40 + rand(50)) * 60000).toISOString(), branch_id: m.branch_id, direction: 'in',
  })
}
checkins.sort((a, b) => b.created_at.localeCompare(a.created_at))
const ACTIONS = ['contracts.create', 'contracts.sign', 'contracts.activate', 'payments.create', 'payments.confirm', 'members.update', 'checkins.override', 'shifts.open', 'shifts.close', 'contracts.cancel']
for (let k = 0; k < 40; k++) {
  const who = ['letan@gymhub.vn', 'quanly@gymhub.vn', 'admin@gymhub.vn'][k % 3]
  log(who, ACTIONS[k % ACTIONS.length], `HD${String(10 + k).padStart(5, '0')}`, k % 11 === 5 ? 'DENY' : 'ALLOW', (k + 1) * 5400000 + rand(3600000))
}
audit.sort((a, b) => b.created_at.localeCompare(a.created_at))

const sessions: SessionRow[] = [
  { id: 's1', user_agent: 'Chrome trên Windows', ip: '127.0.0.1', created_at: iso(-1), last_used_at: iso(0), current: true },
  { id: 's2', user_agent: 'Safari trên iPhone', ip: '10.0.0.8', created_at: iso(-3), last_used_at: iso(-2) },
]

const RT = 'gymhub_mock_rt'
const getRt = () => {
  try {
    return sessionStorage.getItem(RT)
  } catch {
    return null
  }
}
const setRt = (v: string | null) => {
  try {
    if (v) sessionStorage.setItem(RT, v)
    else sessionStorage.removeItem(RT)
  } catch {
    /* ignore */
  }
}

function fail(config: InternalAxiosRequestConfig, status: number, code: string, message: string): never {
  const response = { data: { error: { code, message } }, status, statusText: '', headers: {}, config }
  throw new AxiosError(message, 'ERR_BAD_REQUEST', config, null, response)
}

const pdfBlob = (c: Contract) =>
  new Blob([`%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 100]>>endobj\ntrailer<</Root 1 0 R>>\n% ${c.code}`], { type: 'application/pdf' })

const MOCK_NAMES: [string, string][] = [
  ['Cao Trần Nguyên Tiên', '0901000001'], ['Đỗ Ngọc Anh Thư', '0901000002'], ['Lê Thị Mỹ Tiên', '0901000003'], ['Trần Thị Thuỳ Anh', '0901000004'],
  ['Nguyễn Ngọc Ánh', '0901000005'], ['Nguyễn Uyển Hạ Vy', '0901000006'], ['Nguyễn Khánh Phương', '0901000007'], ['Nguyễn Thị Diệu Thanh', '0901000008'], ['Phan Ngọc Trâm', '0901000009'],
]
const MOCK_TITLES = ['Core + Cardio', 'Mông + Đùi + Tổng hợp', 'Lưng + Vai + Tay sau']

function mockPtGroupContract(k: number, category = 'pt_group') {
  const [name, phone] = MOCK_NAMES[k]
  return {
    id: category === 'pt_group' ? `pg-${k}` : `po-${category}-${k}`, code: `HD26${phone.slice(-3)}`, member_id: `m-${phone}`, branch_id: 'b1', status: k === 7 ? 'expired' : 'active', sessions_total: 12, sessions_left: 4 + k, start_date: '2026-09-01', end_date: k === 7 ? '2026-11-10' : '2027-02-28',
    total_amount: 3600000, discount: 0, paid_amount: k % 3 === 0 ? 2000000 : 3600000, debt_amount: k % 3 === 0 ? 1600000 : 0, usage_deadline: null,
    member: { id: `m-${phone}`, code: `HV0${300 + k}`, name, phone, email: k % 3 === 2 ? null : `hv${300 + k}@gmail.com` },
    package: { id: 'pk-g', name: category === 'pt_group' ? 'PT NHÓM 12 BUỔI' : 'PT 1 KÈM 1 - 10 BUỔI', type: 'sessions', category },
    payments: [{ id: `pay-${k}`, created_at: '2026-09-01T09:00:00.000Z', method: 'cash', status: 'confirmed', amount: k % 3 === 0 ? 2000000 : 3600000 }],
  }
}

function mockGroupWeek(from: string, to: string) {
  const pad2 = (n: number) => String(n).padStart(2, '0')
  const classes: { id: string; title: string; start_at: string; end_at: string; capacity: number; registered: number; status: string; [k: string]: unknown }[] = []
  const regs: Record<string, unknown>[] = []
  if (!from || !to) return { classes, regs }
  const now = Date.now()
  const trainer = { id: 'tr-1', name: 'Nguyễn Phú Thịnh' }
  let i = 0
  for (let d = new Date(`${from}T12:00:00`); d <= new Date(`${to}T12:00:00`); d.setDate(d.getDate() + 1)) {
    const wd = d.getDay()
    if (wd === 0) continue
    const date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
    for (const [slot, startH] of [['06:30', 6.5], ['20:00', 20]] as [string, number][]) {
      i += 1
      if ((wd + startH) % 4 === 0) continue
      const start = new Date(`${date}T${slot}:00`)
      const end = new Date(start.getTime() + 75 * 60000)
      const n = (i * 7 + wd) % 4
      const members = Array.from({ length: n }, (_, k) => MOCK_NAMES[(i + k * 2) % MOCK_NAMES.length])
      const id = `gc-${date}-${slot}`
      const done = end.getTime() < now
      const cls = { id, branch_id: 'b1', title: MOCK_TITLES[(i + wd) % 3], muscle_group: null, trainer, start_at: start.toISOString(), end_at: end.toISOString(), capacity: 3, registered: n, status: done ? 'completed' : 'scheduled', completed_at: null }
      classes.push(cls)
      members.forEach(([name, phone], k) => regs.push({
        id: `${id}-${k}`, member_id: `m-${phone}`, name, phone, email: null, status: done ? (k === 0 && i % 5 === 0 ? 'absent' : 'attended') : 'booked',
        deducted: true, contract_code: `HD26${phone.slice(-3)}`, sessions_left: 4 + ((i + k) % 8), created_at: start.toISOString(), cancel_count: (i + k) % 6 === 0 ? 1 : 0,
        class: { id, title: cls.title, muscle_group: null, start_at: cls.start_at, end_at: cls.end_at, status: cls.status, trainer },
      }))
    }
  }
  return { classes, regs }
}

export const mockAdapter: AxiosAdapter = async (config) => {
  await new Promise((r) => setTimeout(r, 150))
  const url = (config.url ?? '').split('?')[0]
  const method = (config.method ?? 'get').toLowerCase()
  const body = typeof config.data === 'string' && config.data ? JSON.parse(config.data) : (config.data ?? {})
  const params = (config.params ?? {}) as Record<string, string | number | undefined>
  const ok = (data: unknown, extra: object = {}) => ({ data: { data, ...extra }, status: 200, statusText: 'OK', headers: {}, config })

  if (url === '/auth/login' && method === 'post') {
    const u = users[body.email]
    if (!u || u.pw !== body.password) fail(config, 401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng')
    setRt(body.email)
    return ok({ access_token: 'mock-' + Date.now(), user: { id: u.me.id, email: u.me.email, name: u.me.name } })
  }
  if (url === '/auth/renew' && method === 'post') {
    if (!getRt()) fail(config, 401, 'TOKEN_INVALID', 'Phiên đã hết hạn')
    return ok({ access_token: 'mock-' + Date.now() })
  }
  if (url === '/auth/logout') {
    setRt(null)
    return ok(null)
  }
  if (url === '/auth/forgot-password') return ok({ sent: true })
  if (url === '/auth/reset-password') {
    if (!body.token || body.token === 'bad') fail(config, 400, 'TOKEN_INVALID', 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn')
    return ok({ reset: true })
  }

  if (url === '/public/classes' && method === 'get') {
    const mon = new Date(); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7))
    const iso = (d: Date) => d.toISOString().slice(0, 10)
    const day = (n: number) => { const d = new Date(mon); d.setDate(d.getDate() + n); return iso(d) }
    const mk = (n: number, st: string, en: string, g: string, left: number) => ({ id: `c${n}${st}`, date: day(n), start: st, end: en, muscle_group: g, capacity: 3, left })
    return ok({ branch: { code: 'q7', name: 'Chi nhánh Quận 7' }, sessions: [mk(1, '06:30', '07:45', 'Core + Cardio', 3), mk(1, '20:00', '21:15', 'Mông + Đùi + Tổng hợp', 1), mk(2, '06:30', '07:45', 'Lưng + Vai + Tay sau', 0), mk(2, '20:00', '21:15', 'Core + Cardio', 2), mk(3, '20:00', '21:15', 'Mông + Đùi + Tổng hợp', 3), mk(5, '06:30', '07:45', 'Lưng + Vai + Tay sau', 3)], max_pick: 5, week: { from: day(0), to: day(6) }, now: new Date().toISOString() })
  }
  if (url === '/public/member' && method === 'get') return ok(String(params.phone).replace(/\D/g, '').endsWith('906682737') ? { found: true, name: 'Nguyễn Thị Hải Linh', email: 'ha***@gmail.com' } : { found: false })
  if (url === '/public/book' && method === 'post') return ok({ name: 'Nguyễn Thị Hải Linh', booked: (body.class_ids as string[]).map((id) => ({ class_id: id, date: '2026-11-18', start: '20:00', end: '21:15', muscle_group: 'Core + Cardio' })) })
  const rt = getRt()
  const auth = config.headers?.get?.('Authorization')
  if (!rt || !auth) fail(config, 401, 'TOKEN_INVALID', 'Chưa đăng nhập')
  const rec = users[rt as string]
  const me = rec.me
  const isSuper = me.roles.includes('super_admin')
  const need = (p: string) => {
    if (!isSuper && !me.permissions.includes(p)) {
      log(me.email, p, url, 'DENY')
      fail(config, 403, 'FORBIDDEN', 'Không đủ quyền')
    }
  }
  const branchFilter = String(params.branch_id ?? config.headers?.get?.('X-Branch-Id') ?? '')
  const page = Number(params.page ?? 1)
  const limit = Number(params.limit ?? 10)
  const paged = <T>(rows: T[]) => ok(rows.slice((page - 1) * limit, page * limit), { meta: { page, limit, total: rows.length } })
  const myBranch = (id: string) => me.branches.some((b) => b.id === id) && (!branchFilter || branchFilter === id)

  if (url === '/me') return ok(me)
  const tkq = /^\/contracts\/([^/]+)\/ticket-quote$/.exec(url)
  if (tkq && method === 'get') {
    const c = contracts.find((x) => x.id === tkq[1])
    if (!c) fail(config, 404, 'NOT_FOUND', 'Không tìm thấy hợp đồng')
    return ok(mockTicketQuote(c as Contract, String(params.type), String(params.package_id ?? ''), me.permissions.includes('contracts.approve') || isSuper))
  }
  const tkc = /^\/contracts\/([^/]+)\/tickets$/.exec(url)
  if (tkc && method === 'post') {
    need('contracts.create')
    const c = contracts.find((x) => x.id === tkc[1])
    if (!c) fail(config, 404, 'NOT_FOUND', 'Không tìm thấy hợp đồng')
    const q = mockTicketQuote(c as Contract, String(body.type), String(body.package_id ?? ''), me.permissions.includes('contracts.approve') || isSuper)
    const t: Ticket = {
      id: nid('tk'), contract_id: c!.id, contract_code: c!.code, member_name: c!.member.name, member_code: c!.member.code,
      type: body.type as Ticket['type'], status: q.requires_approval ? 'pending' : 'applied', fee: q.fee, payload: body,
      reason: (body.reason as string) ?? null, requested_by: me.id, requested_by_name: me.name, decided_by: null, decided_by_name: null,
      decided_at: null, created_at: new Date().toISOString(),
    }
    mockTickets.unshift(t)
    log(me.email, 'ticket.' + t.type, c!.code)
    return { ...ok({ ticket: t, contract: contractOut(c as Contract) }), status: 201 }
  }
  if (url === '/tickets' && method === 'get') {
    need('contracts.approve')
    const rows = mockTickets.filter((t) => !params.status || t.status === params.status)
    return paged(rows)
  }
  const tka = /^\/tickets\/([^/]+)\/(approve|reject)$/.exec(url)
  if (tka && method === 'post') {
    need('contracts.approve')
    const t = mockTickets.find((x) => x.id === tka[1])
    if (!t) fail(config, 404, 'NOT_FOUND', 'Không tìm thấy phiếu')
    if (t!.status !== 'pending') fail(config, 409, 'INVALID_STATE', 'Phiếu đã được xử lý')
    t!.status = tka[2] === 'approve' ? 'applied' : 'rejected'
    t!.decided_by = me.id
    t!.decided_by_name = me.name
    t!.decided_at = new Date().toISOString()
    if (tka[2] === 'reject') t!.reason = (body.reason as string) ?? t!.reason
    return ok({ ticket: t, contract: contracts.find((x) => x.id === t!.contract_id) ? contractOut(contracts.find((x) => x.id === t!.contract_id) as Contract) : null })
  }

  if (url === '/auth/change-password' && method === 'post') {
    if (body.current !== rec.pw) fail(config, 400, 'INVALID_CREDENTIALS', 'Mật khẩu hiện tại không đúng')
    if (String(body.new ?? '').length < 8) fail(config, 422, 'VALIDATION', 'Mật khẩu mới tối thiểu 8 ký tự')
    rec.pw = body.new
    return ok({ access_token: 'mock-' + Date.now() })
  }
  if (url === '/auth/sessions' && method === 'get') return ok(sessions)
  const sm = url.match(/^\/auth\/sessions\/(.+)$/)
  if (sm && method === 'delete') {
    const i = sessions.findIndex((s) => s.id === sm[1])
    if (i >= 0) sessions.splice(i, 1)
    return ok(null)
  }

  if (url === '/members' && method === 'get') {
    const q = String(params.q ?? '').toLowerCase()
    let rows = members.filter((m) => me.branches.some((b) => b.id === m.branch_id))
    if (branchFilter) rows = rows.filter((m) => m.branch_id === branchFilter)
    if (params.status) rows = rows.filter((m) => m.status === params.status)
    if (q) rows = rows.filter((m) => m.name.toLowerCase().includes(q) || m.phone.includes(q) || m.code.toLowerCase().includes(q))
    return paged(rows.map(memberOut))
  }
  if (url === '/members' && method === 'post') {
    need('members.create')
    if (members.some((m) => m.phone === body.phone)) fail(config, 409, 'DUPLICATE_PHONE', 'Số điện thoại đã tồn tại')
    if (body.face_id && members.some((m) => m.face_id === body.face_id)) fail(config, 409, 'DUPLICATE_FACE_ID', 'Face ID đã được dùng cho hội viên khác')
    const m: Member = { id: `m${++seq}`, code: `HV${String(seq).padStart(4, '0')}`, avatar_url: null, created_at: new Date().toISOString(), ...body, face_id: body.face_id ?? null }
    members.unshift(m)
    return ok(memberOut(m))
  }
  const pm0 = url.match(/^\/members\/([^/]+)\/photo$/)
  if (pm0) {
    const m = members.find((x) => x.id === pm0[1])
    if (!m) fail(config, 404, 'NOT_FOUND', 'Không tìm thấy')
    if (method === 'get') {
      need('members.read')
      const ph = photos.get(pm0[1])
      if (!ph) fail(config, 404, 'NOT_FOUND', 'Hội viên chưa có ảnh')
      const bin = atob((ph as { image_base64: string }).image_base64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      return { data: new Blob([bytes], { type: (ph as { content_type: string }).content_type }), status: 200, statusText: 'OK', headers: { 'content-type': (ph as { content_type: string }).content_type }, config }
    }
    need('members.update')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(body.content_type) || !body.image_base64) fail(config, 400, 'INVALID_IMAGE', 'Ảnh không hợp lệ')
    if (String(body.image_base64).length > 400 * 1024) fail(config, 413, 'PHOTO_TOO_LARGE', 'Ảnh quá lớn')
    photos.set(pm0[1], { content_type: body.content_type, image_base64: body.image_base64, version: Date.now() })
    return ok(memberOut(m as Member))
  }
  const pe = url.match(/^\/members\/([^/]+)\/pt-eligibility$/)
  if (pe && method === 'get') {
    need('members.read')
    const m = members.find((x) => x.id === pe[1])
    if (!m) fail(config, 404, 'NOT_FOUND', 'Không tìm thấy')
    return ok(eligibilityOf((m as Member).id))
  }
  const mm = url.match(/^\/members\/(.+)$/)
  if (mm) {
    const m = members.find((x) => x.id === mm[1])
    if (!m) fail(config, 404, 'NOT_FOUND', 'Không tìm thấy')
    if (method === 'get') return ok(memberOut(m as Member))
    need('members.update')
    if (body.phone && members.some((x) => x.phone === body.phone && x.id !== m?.id)) fail(config, 409, 'DUPLICATE_PHONE', 'Số điện thoại đã tồn tại')
    if (body.face_id && members.some((x) => x.face_id === body.face_id && x.id !== m?.id)) fail(config, 409, 'DUPLICATE_FACE_ID', 'Face ID đã được dùng cho hội viên khác')
    Object.assign(m as Member, body)
    return ok(memberOut(m as Member))
  }

  if (url === '/leads' && method === 'get') {
    need('leads.read')
    const q = String(params.q ?? '').toLowerCase()
    let rows = leads.filter((l) => me.branches.some((b) => b.id === l.branch_id) && (!branchFilter || l.branch_id === branchFilter))
    if (params.status) rows = rows.filter((l) => l.status === params.status)
    if (q) rows = rows.filter((l) => l.name.toLowerCase().includes(q) || l.phone.includes(q))
    return paged(rows)
  }
  if (url === '/leads' && method === 'post') {
    need('leads.create')
    const now = new Date().toISOString()
    const l: Lead = { id: nid('ld'), email: null, source: null, note: null, assigned_to: null, trial_at: null, member_id: null, ...body, status: 'new', created_at: now, updated_at: now }
    leads.unshift(l)
    return ok(l)
  }
  const lm = url.match(/^\/leads\/([^/]+)(?:\/(status|convert))?$/)
  if (lm) {
    const l = leads.find((x) => x.id === lm[1])
    if (!l) fail(config, 404, 'NOT_FOUND', 'Không tìm thấy')
    need('leads.update')
    const cur = l as Lead
    if (lm[2] === 'convert') {
      if (cur.status === 'converted') fail(config, 409, 'ALREADY_CONVERTED', 'Khách đã được chuyển')
      if (members.some((m) => m.phone === cur.phone)) fail(config, 409, 'DUPLICATE_PHONE', 'Số điện thoại đã tồn tại')
      const m: Member = { id: `m${++seq}`, code: `HV${String(seq).padStart(4, '0')}`, name: cur.name, phone: cur.phone, email: cur.email, gender: null, dob: null, status: 'active', branch_id: cur.branch_id, avatar_url: null, face_id: null, created_at: new Date().toISOString() }
      members.unshift(m)
      Object.assign(cur, { status: 'converted', member_id: m.id })
      return ok({ lead: cur, member: m })
    }
    if (lm[2] === 'status') {
      if (cur.status === 'converted') fail(config, 409, 'ALREADY_CONVERTED', 'Khách đã được chuyển')
      cur.status = body.status
    } else Object.assign(cur, body)
    return ok(cur)
  }
  if (url === '/reports/expiring' && method === 'get') {
    need('reports.view')
    const days = Number(params.days ?? 7)
    const rows = members
      .filter((m) => me.branches.some((b) => b.id === m.branch_id) && (!branchFilter || m.branch_id === branchFilter))
      .map((m) => ({ m, c: m.current_contract }))
      .filter((x) => x.c && x.c.status === 'active' && x.c.end_date)
      .map((x) => ({ member_id: x.m.id, member_code: x.m.code, name: x.m.name, phone: x.m.phone, package_name: x.c!.package_name, end_date: x.c!.end_date as string, days_left: Math.round((Date.parse(x.c!.end_date as string) - Date.parse(day())) / DAY), branch: branches.find((b) => b.id === x.m.branch_id)! }))
      .filter((r) => r.days_left >= 0 && r.days_left <= days)
      .sort((a, b) => a.days_left - b.days_left)
    return ok(rows)
  }
  if (url === '/pt/trainers' && method === 'get') return ok(ptTrainers)
  if (url === '/pt/sessions' && method === 'get') {
    const f = String(params.from ?? ''), t = String(params.to ?? '')
    return ok(ptSessions.filter((x) => (!f || x.start_at.slice(0, 10) >= f) && (!t || x.start_at.slice(0, 10) <= t)))
  }
  if (url === '/pt/sessions' && method === 'post') {
    need('pt_sessions.create')
    const tr = ptTrainers.find((x) => x.id === body.trainer_id) ?? ptTrainers[0]
    const mem = members.find((x) => x.id === body.member_id)
    const start = new Date(body.start_at)
    const row: PtSession = { id: 'ps' + Date.now(), branch_id: 'b-nb', trainer: tr, member: mem ? { id: mem.id, code: mem.code, name: mem.name, phone: mem.phone } : null, contract_id: null, contract_code: null, sessions_left: null, start_at: start.toISOString(), end_at: new Date(start.getTime() + (body.duration_min ?? 60) * 60000).toISOString(), status: 'scheduled', source: 'manual', note: body.note ?? null, completed_at: null }
    const mc = /^po-(.+)-(\d+)$/.exec(String(body.contract_id ?? ''))
    if (!mem && mc) { const c = mockPtGroupContract(Number(mc[2]), mc[1]); row.member = c.member; row.contract_id = c.id; row.contract_code = c.code; row.sessions_left = c.sessions_left }
    row.id = `ps${Date.now()}-${ptSessions.length}`
    ptSessions.push(row)
    return ok(row)
  }
  const ptm = url.match(/^\/pt\/sessions\/(.+)\/(complete|cancel|assign|no-show)$/)
  if (ptm && method === 'post') {
    const row = ptSessions.find((x) => x.id === ptm[1])
    if (!row) fail(config, 404, 'NOT_FOUND', 'Không tìm thấy')
    else if (ptm[2] === 'assign') {
      const mem = members.find((x) => x.id === body.member_id)
      const mc = /^po-(.+)-(\d+)$/.exec(String(body.contract_id ?? ''))
      if (mem) row.member = { id: mem.id, code: mem.code, name: mem.name, phone: mem.phone }
      else if (mc) { const c = mockPtGroupContract(Number(mc[2]), mc[1]); row.member = c.member; row.contract_id = c.id; row.contract_code = c.code; row.sessions_left = c.sessions_left }
    }
    else row.status = ptm[2] === 'complete' ? 'completed' : ptm[2] === 'no-show' ? 'no_show' : 'cancelled'
    return ok(row)
  }
  const ptp = url.match(/^\/pt\/sessions\/(.+)$/)
  if (ptp && method === 'patch') {
    const row = ptSessions.find((x) => x.id === ptp[1])
    if (!row) fail(config, 404, 'NOT_FOUND', 'Không tìm thấy')
    else if (body.start_at) { const d = new Date(row.end_at).getTime() - new Date(row.start_at).getTime(); row.start_at = new Date(body.start_at).toISOString(); row.end_at = new Date(new Date(body.start_at).getTime() + (body.duration_min ? body.duration_min * 60000 : d)).toISOString() }
    return ok(row)
  }
  if (url.startsWith('/pt/classes') && method === 'get') {
    const { classes: gc, regs: gr } = mockGroupWeek(String(params.from ?? ''), String(params.to ?? ''))
    if (url.endsWith('/registrations')) return ok(gr)
    if (url.endsWith('/stats')) {
      const live = gc.filter((c) => c.status !== 'cancelled')
      const seats = live.reduce((n, c) => n + c.capacity, 0)
      const cnt = (st: string) => gr.filter((r) => r.status === st).length
      return ok({ classes: { total: live.length, scheduled: live.filter((c) => c.status === 'scheduled').length, completed: live.filter((c) => c.status === 'completed').length, cancelled: 0 }, registrations: { booked: cnt('booked'), attended: cnt('attended'), absent: cnt('absent'), cancelled: cnt('cancelled'), waitlist: 0 }, fill_rate: seats ? Math.round((live.reduce((n, c) => n + c.registered, 0) / seats) * 100) : 0, trainers: [] })
    }
    return ok(gc)
  }
  if (url.startsWith('/pt/classes')) return ok({})
  if (url === '/packages' && method === 'get') {
    let rows = packages
    if (branchFilter) rows = rows.filter((p) => !p.branch_id || p.branch_id === branchFilter)
    if (params.category) rows = rows.filter((p) => p.category === params.category)
    if (params.active !== undefined && params.active !== '') rows = rows.filter((p) => p.active === (String(params.active) === 'true'))
    if (params.q) rows = rows.filter((p) => p.name.toLowerCase().includes(String(params.q).toLowerCase()))
    return paged(rows.map(pkgOut))
  }
  const bundleCheck = (category: string, branch: string | null, bid: unknown) => {
    if (!bid) return
    const bp = packages.find((x) => x.id === bid)
    if (!category.startsWith('pt_') || !bp || bp.category !== 'member' || !bp.active || bp.branch_id !== branch) fail(config, 409, 'INVALID_BUNDLE', 'Gói member đi kèm không hợp lệ')
  }
  if (url === '/packages' && method === 'post') {
    need('packages.create')
    const { bundled_member_package_id, deactivate_replaced, ...rest } = body as Record<string, unknown>
    const category = String(rest.category ?? 'member')
    bundleCheck(category, (rest.branch_id as string) ?? null, bundled_member_package_id)
    const p = { id: `p${++seq}`, ...rest, category, active: rest.active ?? true, replaces_id: (rest.replaces_id as string) ?? null } as unknown as Pkg
    packages.unshift(p)
    if (bundled_member_package_id) bundleIds.set(p.id, String(bundled_member_package_id))
    if (p.replaces_id && deactivate_replaced) {
      const old = packages.find((x) => x.id === p.replaces_id)
      if (old) old.active = false
    }
    return ok(pkgOut(p))
  }
  const pm = url.match(/^\/packages\/(.+)$/)
  if (pm) {
    const p = packages.find((x) => x.id === pm[1]) as Pkg | undefined
    if (!p) fail(config, 404, 'NOT_FOUND', 'Không tìm thấy')
    if (method === 'get') return ok(pkgOut(p as Pkg))
    need('packages.update')
    if (method === 'delete') {
      if (contracts.some((c) => c.package_id === (p as Pkg).id)) fail(config, 409, 'PACKAGE_IN_USE', 'Gói đã có hợp đồng, không xóa được')
      if ([...bundleIds.values()].includes((p as Pkg).id)) fail(config, 409, 'PACKAGE_IS_BUNDLE', 'Gói đang được gói PT khác gắn kèm, không xóa được')
      packages.splice(packages.indexOf(p as Pkg), 1)
      bundleIds.delete((p as Pkg).id)
      return ok({ id: (p as Pkg).id })
    }
    const { bundled_member_package_id, ...rest } = body as Record<string, unknown>
    const used = contracts.some((c) => c.package_id === (p as Pkg).id)
    if (used && (Object.keys(rest).some((k) => k !== 'active') || bundled_member_package_id !== undefined)) fail(config, 409, 'PACKAGE_IN_USE', 'Gói đã có hợp đồng, không sửa được')
    if (bundled_member_package_id !== undefined) {
      bundleCheck(String(rest.category ?? (p as Pkg).category), (p as Pkg).branch_id, bundled_member_package_id)
      if (bundled_member_package_id) bundleIds.set((p as Pkg).id, String(bundled_member_package_id))
      else bundleIds.delete((p as Pkg).id)
    }
    Object.assign(p as Pkg, rest)
    return ok(pkgOut(p as Pkg))
  }

  /* contracts */
  const ipadStore = (): Record<string, { stage: string; payload: unknown; signature: string | null }> => { try { return JSON.parse(localStorage.getItem('gymhub.mock.ipad') ?? '{}') } catch { return {} } }
  const ipadSave = (o: ReturnType<typeof ipadStore>) => { try { localStorage.setItem('gymhub.mock.ipad', JSON.stringify(o)) } catch { /* ignore */ } }
  if (url === '/ipad/sessions' && method === 'post') {
    const token = `mock${Math.random().toString(36).slice(2)}${Date.now().toString(36)}abcdefghij`
    const o = ipadStore(); o[token] = { stage: 'idle', payload: null, signature: null }; ipadSave(o)
    return ok({ token })
  }
  const ipm = /^\/(ipad\/sessions|public\/ipad)\/([^/]+)(\/sign)?$/.exec(url)
  if (ipm) {
    const o = ipadStore(); const sess = o[ipm[2]]
    if (!sess) { fail(config, 404, 'NOT_FOUND', 'Không tìm thấy phiên'); return ok(null) }
    if (ipm[1] === 'ipad/sessions' && method === 'put') { o[ipm[2]] = { stage: body.stage, payload: body.payload ?? null, signature: null }; ipadSave(o); return ok({ stage: body.stage }) }
    if (ipm[1] === 'ipad/sessions' && method === 'get') return ok({ stage: sess.stage, signature: sess.signature })
    if (ipm[1] === 'public/ipad' && !ipm[3] && method === 'get') return ok({ stage: sess.stage, payload: sess.payload })
    if (ipm[1] === 'public/ipad' && ipm[3] && method === 'post') { o[ipm[2]] = { ...sess, stage: 'signed', signature: String(body.signature) }; ipadSave(o); return ok({ stage: 'signed' }) }
  }
  if (url === '/pt/off' && method === 'get') return ok(mockOffs.filter((o) => o.date >= String(params.from) && o.date <= String(params.to)))
  if (url === '/pt/off' && method === 'put') {
    const i = mockOffs.findIndex((o) => o.trainer_id === body.trainer_id && o.date === body.date)
    if (body.off && i < 0) mockOffs.push({ trainer_id: body.trainer_id, date: body.date })
    if (!body.off && i >= 0) mockOffs.splice(i, 1)
    return ok({ ...body })
  }
  const mmem = /^\/members\/m-(\d+)$/.exec(url)
  if (mmem && method === 'get') {
    const k = MOCK_NAMES.findIndex(([, ph]) => ph === mmem[1])
    if (k >= 0) { const c = mockPtGroupContract(k); return ok({ ...c.member, gender: 'female', dob: null, status: 'active', branch_id: 'b-q7', avatar_url: null, created_at: '2026-09-01T00:00:00.000Z', branch: branches[0], current_contract: null, pt_contract: null }) }
  }
  const mcd = /^\/contracts\/(?:pg-(\d+)|po-(.+)-(\d+))$/.exec(url)
  if (mcd && method === 'get') return ok(mcd[1] !== undefined ? mockPtGroupContract(Number(mcd[1])) : mockPtGroupContract(Number(mcd[3]), mcd[2]))
  if (url === '/contracts' && method === 'get') {
    need('contracts.read')
    if (params.category === 'pt_1on1' || params.category === 'pt_1on2') return paged(MOCK_NAMES.slice(0, 6).map((_, k) => mockPtGroupContract(k, String(params.category))) as never)
    if (params.category === 'pt_group') return paged(MOCK_NAMES.map((_, k) => mockPtGroupContract(k)) as never)
    const q = String(params.q ?? '').toLowerCase()
    let rows = contracts.filter((c) => myBranch(c.branch_id))
    if (params.member_id) rows = rows.filter((c) => c.member_id === params.member_id)
    if (params.status) rows = rows.filter((c) => c.status === params.status)
    if (String(params.has_debt) === 'true') rows = rows.filter((c) => c.debt_amount > 0)
    if (params.expiring_within_days) {
      const lim = day(Number(params.expiring_within_days))
      rows = rows.filter((c) => c.status === 'active' && c.end_date && c.end_date <= lim && c.end_date >= day(0))
    }
    if (q) rows = rows.filter((c) => c.code.toLowerCase().includes(q) || c.member.name.toLowerCase().includes(q) || c.member.phone.includes(q))
    return paged(rows.map((c) => ({ ...contractOut(c), events: undefined })))
  }
  if (url === '/contracts' && method === 'post') {
    need('contracts.create')
    const m = members.find((x) => x.id === body.member_id)
    const pk = packages.find((x) => x.id === body.package_id)
    if (!m || !pk) fail(config, 404, 'NOT_FOUND', 'Không tìm thấy hội viên hoặc gói')
    if (pk!.branch_id && pk!.branch_id !== m!.branch_id) fail(config, 422, 'BRANCH_MISMATCH', 'Gói tập không thuộc chi nhánh của hội viên')
    if (!pk!.active) fail(config, 409, 'PACKAGE_INACTIVE', 'Gói đã vô hiệu hóa, không bán được')
    const bundledPk = bundleIds.has(pk!.id) ? pkgOf(bundleIds.get(pk!.id) as string) : undefined
    if (bundledPk && !bundledPk.active) fail(config, 409, 'BUNDLED_PACKAGE_INACTIVE', 'Gói member đi kèm đã bị vô hiệu hóa')
    const pr = body.promo as { type?: string; value?: number } | undefined
    let prev: Contract | undefined
    if (body.renewed_from_id) {
      prev = contracts.find((x) => x.id === body.renewed_from_id)
      if (!prev || prev.member_id !== m!.id) fail(config, 422, 'VALIDATION', 'Hợp đồng gia hạn không hợp lệ')
    }
    if (pr) {
      const types = ['bonus_months', 'bonus_days', 'bonus_sessions', 'percent', 'amount']
      if (!types.includes(String(pr.type)) || !Number.isInteger(pr.value) || (pr.value as number) <= 0 || (pr.type === 'percent' && (pr.value as number) > 100)) fail(config, 422, 'VALIDATION', 'Khuyến mãi không hợp lệ')
      if (pr.type === 'bonus_sessions' && pk!.type !== 'session') fail(config, 422, 'VALIDATION', 'Chỉ tặng buổi cho gói theo buổi')
      if ((pr.type === 'bonus_months' || pr.type === 'bonus_days') && pk!.type === 'session') fail(config, 422, 'VALIDATION', 'Gói theo buổi không tặng ngày hoặc tháng')
    }
    const c = seedContract(m!.id, pk!.id, 'draft', 0, null, me.name)
    const v = pr?.value ?? 0
    const discount = pr?.type === 'percent' ? Math.round((c.total_amount * v) / 100) : pr?.type === 'amount' ? Math.min(v, c.total_amount) : 0
    c.discount = discount
    c.total_amount = Math.max(0, c.total_amount - discount)
    if (pr?.type === 'bonus_months') bonusDays.set(c.id, v * 30)
    if (pr?.type === 'bonus_days') bonusDays.set(c.id, v)
    if (pr?.type === 'bonus_sessions' && c.sessions_total != null) { c.sessions_total += v; c.sessions_left = c.sessions_total }
    if (prev) { c.renewed_from_id = prev.id; addEvent(prev, 'renewed', me.name) }
    c.note = body.note ?? null
    recalc(c)
    if (bundledPk) {
      const b = seedContract(m!.id, bundledPk.id, 'draft', 0, null, me.name)
      b.total_amount = 0
      b.bundle_of_id = c.id
      recalc(b)
    }
    log(me.email, 'contracts.create', c.code)
    return ok(contractOut(c))
  }
  const cm = url.match(/^\/contracts\/([^/]+)(?:\/(\w+))?$/)
  if (cm) {
    const c = contracts.find((x) => x.id === cm[1])
    if (!c) fail(config, 404, 'NOT_FOUND', 'Không tìm thấy hợp đồng')
    const k = c as Contract
    const act = cm[2]
    const bad = (m: string): never => fail(config, 409, 'INVALID_STATE', m)
    if (!act && method === 'get') {
      need('contracts.read')
      return ok({ ...contractOut(k), payments: payments.filter((p) => p.contract_id === k.id) })
    }
    if (act === 'pdf') {
      need('contracts.read')
      return { data: pdfBlob(k), status: 200, statusText: 'OK', headers: { 'content-type': 'application/pdf' }, config }
    }
    if (method === 'post') {
      const pk = pkgOf(k.package_id)
      if (act === 'sign') {
        need('contracts.sign')
        if (k.status !== 'draft') bad('Hợp đồng không ở trạng thái nháp')
        if (!String(body.signature ?? '').startsWith('data:image/png')) fail(config, 422, 'VALIDATION', 'Thiếu chữ ký')
        k.status = 'signed'
        k.signed_at = iso()
        addEvent(k, 'signed', me.name)
        contracts.filter((x) => x.bundle_of_id === k.id && x.status === 'draft').forEach((x) => { x.status = 'signed'; x.signed_at = iso(); addEvent(x, 'signed', me.name) })
      } else if (act === 'activate') {
        need('contracts.activate')
        if (k.status !== 'signed') bad('Chỉ kích hoạt được hợp đồng đã ký')
        if (k.debt_amount > 0) {
          if (!body.allow_debt) fail(config, 409, 'UNPAID', 'Hợp đồng chưa thanh toán đủ')
          need('contracts.approve')
        }
        const start = body.start_date ?? day(0)
        k.start_date = start
        k.end_date = new Date(new Date(start).getTime() + ((pk.duration_days ?? (pk.category.startsWith('pt_') ? 90 : 365)) + (bonusDays.get(k.id) ?? 0)) * DAY).toISOString().slice(0, 10)
        k.status = 'active'
        k.activated_at = iso()
        addEvent(k, 'activated', me.name, body.allow_debt ? 'Kích hoạt có công nợ' : null)
        contracts.filter((x) => x.bundle_of_id === k.id && x.status === 'signed').forEach((x) => {
          const running = contracts.filter((y) => y.member_id === k.member_id && y.id !== x.id && !isPt(y) && ['active', 'frozen'].includes(y.status) && y.end_date && y.end_date >= start)
          const last = running.map((y) => y.end_date as string).sort().pop()
          const bs = last ? new Date(new Date(last).getTime() + DAY).toISOString().slice(0, 10) : start
          x.start_date = bs
          x.end_date = new Date(new Date(bs).getTime() + (pkgOf(x.package_id).duration_days ?? 30) * DAY).toISOString().slice(0, 10)
          x.status = 'active'
          x.activated_at = iso()
          addEvent(x, 'activated', me.name)
        })
      } else if (act === 'renew') {
        need('contracts.create')
        if (k.status !== 'active' && k.status !== 'expired') bad('Chỉ gia hạn hợp đồng đang hiệu lực hoặc đã hết hạn')
        const n = seedContract(k.member_id, body.package_id ?? k.package_id, 'draft', 0, null, me.name)
        n.renewed_from_id = k.id
        addEvent(k, 'renewed', me.name)
        return ok(n)
      } else if (act === 'freeze') {
        need('contracts.freeze')
        if (k.status !== 'active') bad('Chỉ bảo lưu hợp đồng đang hiệu lực')
        k.status = 'frozen'
        k.frozen_until = day(Number(body.days))
        addEvent(k, 'frozen', me.name, body.reason, { days: body.days })
      } else if (act === 'unfreeze') {
        need('contracts.freeze')
        if (k.status !== 'frozen') bad('Hợp đồng không đang bảo lưu')
        k.status = 'active'
        k.frozen_until = null
        addEvent(k, 'unfrozen', me.name)
      } else if (act === 'cancel') {
        need('contracts.cancel')
        if (k.status === 'cancelled' || k.status === 'expired') bad('Không thể hủy hợp đồng này')
        k.status = 'cancelled'
        addEvent(k, 'cancelled', me.name, body.reason)
        contracts.filter((x) => x.bundle_of_id === k.id && x.status !== 'cancelled' && x.status !== 'expired').forEach((x) => { x.status = 'cancelled'; addEvent(x, 'cancelled', me.name, body.reason) })
      } else fail(config, 404, 'NOT_FOUND', 'Không tìm thấy')
      log(me.email, `contracts.${act}`, k.code)
      return ok(k)
    }
  }

  /* shifts */
  if (url === '/shifts/current') return ok(shifts.find((s) => s.user_id === me.id && !s.closed_at) ?? null)
  if (url === '/shifts/open' && method === 'post') {
    need('shifts.open')
    if (shifts.some((s) => s.user_id === me.id && !s.closed_at)) fail(config, 409, 'SHIFT_ALREADY_OPEN', 'Bạn đã có ca đang mở')
    const s: Shift = { id: nid('sh'), user_id: me.id, branch_id: branchFilter || me.branches[0].id, opened_at: iso(), closed_at: null, opening_cash: Number(body.opening_cash ?? 0) }
    shifts.push(s)
    return ok(s)
  }
  const shm = url.match(/^\/shifts\/([^/]+)\/close$/)
  if (shm && method === 'post') {
    need('shifts.close')
    const s = shifts.find((x) => x.id === shm[1])
    if (!s || s.closed_at) fail(config, 409, 'INVALID_STATE', 'Ca đã đóng hoặc không tồn tại')
    const sp = payments.filter((p) => p.shift_id === s!.id && p.status === 'confirmed')
    const totals: Record<string, number> = {}
    sp.forEach((p) => (totals[p.method] = (totals[p.method] ?? 0) + p.amount))
    const expected = s!.opening_cash + (totals.cash ?? 0)
    const counted = Number(body.counted_cash ?? 0)
    s!.closed_at = iso()
    return ok({ expected_cash: expected, counted_cash: counted, difference: counted - expected, totals_by_method: totals })
  }

  /* payments */
  if (url === '/payments' && method === 'get') {
    need('payments.read')
    let rows = payments.filter((p) => {
      const c = contracts.find((x) => x.id === p.contract_id)
      return c ? myBranch(c.branch_id) : true
    })
    if (params.contract_id) rows = rows.filter((p) => p.contract_id === params.contract_id)
    if (params.shift_id) rows = rows.filter((p) => p.shift_id === params.shift_id)
    if (params.status) rows = rows.filter((p) => p.status === params.status)
    if (params.method) rows = rows.filter((p) => p.method === params.method)
    if (params.date) rows = rows.filter((p) => p.created_at.slice(0, 10) === params.date)
    rows = rows.slice().sort((a, b) => b.created_at.localeCompare(a.created_at))
    return paged(rows.map((p) => {
      const c = contracts.find((x) => x.id === p.contract_id)
      return { ...p, contract: c ? { id: c.id, code: c.code, member: { name: c.member.name } } : undefined }
    }))
  }
  if (url === '/payments' && method === 'post') {
    need('payments.create')
    const c = contracts.find((x) => x.id === body.contract_id)
    if (!c) fail(config, 404, 'NOT_FOUND', 'Không tìm thấy hợp đồng')
    const amount = Number(body.amount)
    if (!(amount > 0) || amount > c!.debt_amount) fail(config, 422, 'VALIDATION', 'Số tiền không hợp lệ')
    if (body.ref && payments.some((p) => p.ref === body.ref)) fail(config, 409, 'DUPLICATE_PAYMENT', 'Mã giao dịch đã tồn tại')
    let shiftId: string | null = null
    if (body.method === 'cash') {
      const s = shifts.find((x) => x.user_id === me.id && !x.closed_at)
      if (!s) fail(config, 409, 'NO_OPEN_SHIFT', 'Chưa mở ca thu ngân')
      shiftId = s!.id
    }
    const p: Payment = {
      id: nid('pay'), contract_id: c!.id, method: body.method, amount, status: body.method === 'cash' ? 'confirmed' : 'pending', ref: body.ref ?? null,
      shift_id: shiftId, note: body.note ?? null, created_by: me.name, created_at: iso(), confirmed_at: body.method === 'cash' ? iso() : null,
    }
    payments.unshift(p)
    recalc(c!)
    addEvent(c!, 'payment', me.name, null, { amount, method: body.method })
    log(me.email, 'payments.create', c!.code)
    return ok(p)
  }
  const pym = url.match(/^\/payments\/([^/]+)\/(\w+)$/)
  if (pym) {
    const p = payments.find((x) => x.id === pym[1])
    if (!p) fail(config, 404, 'NOT_FOUND', 'Không tìm thấy giao dịch')
    const pp = p as Payment
    const c = contracts.find((x) => x.id === pp.contract_id) as Contract
    if (pym[2] === 'qr' && method === 'get') {
      need('payments.read')
      return ok({ transfer_content: `GYMHUB ${c.code} ${pp.id}`, bank: 'MB Bank - 0123456789 - GYMHUB', amount: pp.amount, qr_url: `${location.origin}/vite.svg` })
    }
    if (method === 'post') {
      if (pym[2] === 'confirm') {
        need('payments.confirm')
        if (pp.status !== 'pending') fail(config, 409, 'INVALID_STATE', 'Giao dịch không ở trạng thái chờ xác nhận')
        pp.status = 'confirmed'
        pp.confirmed_at = iso()
        const s = shifts.find((x) => x.user_id === me.id && !x.closed_at)
        pp.shift_id = pp.shift_id ?? s?.id ?? null
      } else if (pym[2] === 'refund-request') {
        need('payments.refund_request')
        if (pp.status !== 'confirmed') fail(config, 409, 'INVALID_STATE', 'Chỉ hoàn tiền giao dịch đã thu')
        pp.refund_requested = true
        pp.note = `Đề nghị hoàn: ${body.reason}`
      } else if (pym[2] === 'refund') {
        need('payments.refund')
        if (pp.status !== 'confirmed') fail(config, 409, 'INVALID_STATE', 'Chỉ hoàn tiền giao dịch đã thu')
        pp.status = 'refunded'
      } else fail(config, 404, 'NOT_FOUND', 'Không tìm thấy')
      recalc(c)
      log(me.email, `payments.${pym[2]}`, c.code)
      return ok(pp)
    }
  }

  /* checkins */
  const activeFor = (memberId: string) => contracts.filter((c) => c.member_id === memberId && !isPt(c) && !['draft', 'signed', 'cancelled'].includes(c.status))
  if (url === '/checkins' && method === 'post') {
    need('checkins.create')
    if (!me.can_checkin) fail(config, 403, 'VIEW_ONLY', VIEW_ONLY_MSG)
    const key = String(body.member_code ?? '').trim().toLowerCase().replace(/\s/g, '')
    const m = members.find((x) => x.id === body.member_id || x.code.toLowerCase() === key || x.phone === key)
    if (!m) fail(config, 404, 'NOT_FOUND', 'Không tìm thấy hội viên')
    const mem = m as Member
    const cs = activeFor(mem.id)
    const cur = cs.find((c) => c.status === 'active') ?? cs.find((c) => c.status === 'frozen') ?? cs[0]
    let reason: string | null = null
    if (me.checkin_branch && mem.branch_id !== me.checkin_branch.id) reason = 'WRONG_BRANCH'
    else if (!cur) reason = 'NO_ACTIVE_CONTRACT'
    else if (cur.status === 'frozen') reason = 'FROZEN'
    else if (cur.status === 'expired' || (cur.end_date && cur.end_date < day(0))) reason = 'EXPIRED'
    else if (cur.sessions_total != null && (cur.sessions_left ?? 0) <= 0) reason = 'NO_SESSIONS'
    const allowed = !reason
    if (allowed && cur && cur.sessions_left != null) cur.sessions_left -= 1
    const id = nid('ci')
    checkins.unshift({ id, member: { id: mem.id, code: mem.code, name: mem.name }, result: allowed ? 'allowed' : 'denied', reason: reason as CheckinItem['reason'], created_at: iso(), checked_out_at: null, branch_id: mem.branch_id, direction: 'in' })
    return ok({ result: allowed ? 'allowed' : 'denied', reason, member: { id: mem.id, code: mem.code, name: mem.name, phone: mem.phone }, contract: cur ?? null, checkin_id: id })
  }
  if (url === '/checkins/override' && method === 'post') {
    need('checkins.override')
    if (!me.can_checkin) fail(config, 403, 'VIEW_ONLY', VIEW_ONLY_MSG)
    const m = memberOf(body.member_id)
    if (!m || !body.reason) fail(config, 422, 'VALIDATION', 'Thiếu lý do mở thủ công')
    const id = nid('ci')
    checkins.unshift({ id, member: { id: m.id, code: m.code, name: m.name }, result: 'allowed', reason: null, created_at: iso(), checked_out_at: null, branch_id: m.branch_id, direction: 'in' })
    log(me.email, 'checkins.override', m.code)
    return ok({ result: 'allowed', reason: null, member: { id: m.id, code: m.code, name: m.name, phone: m.phone }, contract: activeFor(m.id)[0] ?? null, checkin_id: id })
  }
  const com = url.match(/^\/checkins\/([^/]+)\/checkout$/)
  if (com && method === 'post') {
    need('checkins.create')
    if (!me.can_checkin) fail(config, 403, 'VIEW_ONLY', VIEW_ONLY_MSG)
    const ci = checkins.find((x) => x.id === com[1])
    if (ci) ci.checked_out_at = iso()
    return ok(ci ?? null)
  }
  if (url === '/checkins/live') {
    need('checkins.read')
    const items = checkins.filter((x) => x.result === 'allowed' && !x.checked_out_at && myBranch(x.branch_id))
    return ok({ count: items.length, items })
  }
  if (url === '/checkins' && method === 'get') {
    need('checkins.read')
    let rows = checkins.filter((x) => myBranch(x.branch_id))
    if (params.result) rows = rows.filter((x) => x.result === params.result)
    if (params.member_id) rows = rows.filter((x) => x.member.id === params.member_id)
    if (params.date) rows = rows.filter((x) => x.created_at.slice(0, 10) === params.date || new Date(x.created_at).toLocaleDateString('sv') === params.date)
    return paged(rows)
  }

  /* reports */
  if (url === '/reports/checkin-stats') {
    need('checkins.read')
    const d = String(params.date ?? day(0))
    const list = branches.filter((b) => myBranch(b.id)).map((b) => {
      const mine = checkins.filter((x) => x.branch_id === b.id)
      const td = mine.filter((x) => new Date(x.created_at).toLocaleDateString('sv') === d)
      const by = new Map<number, number>()
      td.filter((x) => x.result === 'allowed').forEach((x) => by.set(new Date(x.created_at).getHours(), (by.get(new Date(x.created_at).getHours()) ?? 0) + 1))
      return { branch: b, checkins_today: td.filter((x) => x.result === 'allowed').length, denied_today: td.filter((x) => x.result === 'denied').length, inside_now: mine.filter((x) => x.result === 'allowed' && !x.checked_out_at).length, by_hour: [...by.entries()].sort((a, b2) => a[0] - b2[0]).map(([hour, count]) => ({ hour, count })) }
    })
    const sum = (k: 'checkins_today' | 'denied_today' | 'inside_now') => list.reduce((t, x) => t + x[k], 0)
    return ok({ date: d, branches: list, totals: { checkins_today: sum('checkins_today'), denied_today: sum('denied_today'), inside_now: sum('inside_now') } })
  }
  if (url === '/reports/dashboard') {
    need('reports.view')
    const t = day(0)
    const confirmed = payments.filter((p) => p.status === 'confirmed')
    const byMethod: Record<string, number> = { cash: 0, transfer: 0, vietqr: 0, ewallet: 0 }
    confirmed.filter((p) => p.confirmed_at?.slice(0, 10) === t).forEach((p) => (byMethod[p.method] += p.amount))
    const r7 = Array.from({ length: 7 }, (_, i) => {
      const d = day(i - 6)
      return { date: d, amount: confirmed.filter((p) => p.confirmed_at?.slice(0, 10) === d).reduce((s, p) => s + p.amount, 0) }
    })
    const cs = contracts.filter((c) => myBranch(c.branch_id))
    const todays = checkins.filter((x) => x.created_at.slice(0, 10) === t)
    return ok({
      revenue_today: Object.values(byMethod).reduce((a, b) => a + b, 0),
      revenue_by_method: byMethod,
      revenue_by_kind: (() => {
        const k: Record<string, number> = { member: 0, pt_1on1: 0, pt_1on2: 0, pt_group: 0 }
        for (const p of payments) {
          if (p.status !== 'confirmed' || !(p.confirmed_at ?? '').startsWith(day(0))) continue
          const c = contracts.find((x) => x.id === p.contract_id)
          if (c) k[c.package.category] = (k[c.package.category] ?? 0) + p.amount
        }
        return k
      })(),
      new_contracts_today: cs.filter((c) => c.created_at.slice(0, 10) === t).length,
      active_members: new Set(cs.filter((c) => c.status === 'active').map((c) => c.member_id)).size,
      expiring_in_7_days: cs.filter((c) => c.status === 'active' && c.end_date && c.end_date <= day(7) && c.end_date >= t).length,
      checkins_today: todays.filter((x) => x.result === 'allowed').length,
      denied_today: todays.filter((x) => x.result === 'denied').length,
      inside_now: checkins.filter((x) => x.result === 'allowed' && !x.checked_out_at).length,
      debt_total: cs.filter((c) => !['cancelled', 'draft'].includes(c.status)).reduce((s, c) => s + c.debt_amount, 0),
      revenue_7d: r7,
    })
  }
  if (url === '/reports/today-tasks') {
    need('contracts.read')
    const t = day(0)
    const cs = contracts.filter((c) => myBranch(c.branch_id))
    const awaiting = cs.filter((c) => c.status === 'draft')
    const unpaid = cs.filter((c) => !['cancelled', 'draft'].includes(c.status) && c.debt_amount > 0)
    const expiring = cs.filter((c) => c.status === 'active' && c.end_date && c.end_date >= t && c.end_date <= day(2))
    const refunds = payments.filter((p) => p.refund_requested && p.status === 'confirmed' && myBranch(contracts.find((c) => c.id === p.contract_id)?.branch_id ?? ''))
    return ok({
      awaiting_signature: { count: awaiting.length, items: awaiting.slice(0, 5).map((c) => ({ id: c.id, code: c.code, member_name: c.member.name })) },
      unpaid: { count: unpaid.length, total_debt: unpaid.reduce((s, c) => s + c.debt_amount, 0), items: unpaid.slice(0, 5).map((c) => ({ id: c.id, code: c.code, member_name: c.member.name, debt_amount: c.debt_amount })) },
      expiring_in_2_days: { count: expiring.length, items: expiring.slice(0, 5).map((c) => ({ id: c.id, code: c.code, member_name: c.member.name, end_date: c.end_date as string })) },
      pending_refunds: { count: refunds.length, items: refunds.slice(0, 5).map((p) => ({ id: p.id, contract_code: contracts.find((c) => c.id === p.contract_id)?.code ?? '', amount: p.amount })) },
    })
  }
  if (url === '/reports/daily-closing') {
    need('reports.view')
    const d = String(params.date ?? day(0))
    const items = payments.filter((p) => p.status === 'confirmed' && p.confirmed_at?.slice(0, 10) === d)
    const totals: Record<string, number> = {}
    items.forEach((p) => (totals[p.method] = (totals[p.method] ?? 0) + p.amount))
    return ok({ totals_by_method: totals, total: items.reduce((s, p) => s + p.amount, 0), items: items.map((p) => ({ ...p, contract: { id: p.contract_id, code: contracts.find((c) => c.id === p.contract_id)?.code ?? '', member: { name: contracts.find((c) => c.id === p.contract_id)?.member.name ?? '' } } })) })
  }

  /* admin */
  if (url === '/roles') {
    need('roles.read')
    return ok(roleDefs)
  }
  if (url === '/roles/receptionist/permissions' && method === 'put') {
    need('roles.assign')
    const r = roleDefs.find((x) => x.key === 'receptionist')!
    const toggles = ['contracts.freeze', 'contracts.approve', 'contracts.cancel', 'pt_sessions.complete', 'payments.refund_request', 'payments.confirm', 'packages.create', 'packages.update', 'reports.view']
    r.permissions = [...r.permissions.map((p) => (typeof p === 'string' ? p : p.key)).filter((k) => !toggles.includes(k)), ...(body.permissions as string[])]
    return ok({ permissions: r.permissions })
  }
  if (url.startsWith('/settings/print-templates')) {
    const key = url.split('/')[3]
    if (!key) return ok(Object.keys(printTpls).map((k) => ({ key: k, ...printTpls[k], is_default: !printEdited.has(k) })))
    if (method === 'put') { printTpls[key] = { title: body.title, body: body.body }; printEdited.add(key); return ok({ key, ...printTpls[key], is_default: false }) }
    if (method === 'delete') { printTpls[key] = { ...printDefaults[key] }; printEdited.delete(key); return ok({ key, ...printTpls[key], is_default: true }) }
  }
  if (url === '/settings/sheets') {
    if (method === 'put') Object.assign(sheetsCfg, body)
    return ok(sheetsCfg)
  }
  if (url === '/marketing/metrics') {
    if (method === 'put') {
      const i = mktMetrics.findIndex((m) => m.month === body.month && m.channel === body.channel)
      if (i >= 0) mktMetrics[i] = body; else mktMetrics.push(body)
      return ok(body)
    }
    const mo = config.params?.month as string | undefined
    return ok(mo ? mktMetrics.filter((m) => m.month === mo) : mktMetrics)
  }
  if (url === '/permissions') {
    need('roles.read')
    return ok(ALL.map((k) => ({ key: k })))
  }
  if (url === '/zalo/config' && method === 'get') return ok(znsCfg)
  if (url === '/zalo/config' && method === 'put') {
    const b = body as { app_id: string; oa_id: string; test_phone: string; secret_key?: string; access_token?: string; refresh_token?: string; events: typeof znsCfg.events }
    Object.assign(znsCfg, { app_id: b.app_id, oa_id: b.oa_id, test_phone: b.test_phone, events: b.events })
    if (b.secret_key) znsCfg.has_secret_key = true
    if (b.access_token) znsCfg.has_access_token = true
    if (b.refresh_token) znsCfg.has_refresh_token = true
    return ok(znsCfg)
  }
  if (url === '/zalo/logs') return ok(znsLogs)
  if (url === '/zalo/test') return ok({ status: znsCfg.has_access_token ? 'sent' : 'skipped', error: znsCfg.has_access_token ? undefined : 'not configured' })
  if (url === '/zalo/run-reminders') return ok({ sent: 2 })
  if (url === '/zalo/bot/config' && method === 'get') return ok(botCfg)
  if (url === '/zalo/bot/config' && method === 'put') {
    const b = body as { enabled: boolean; token?: string; bot_name: string; pt_group: string; branch_id: string; group_trainer: string; group_windows: string }
    if (b.enabled && ((!botCfg.has_token && !b.token) || !b.pt_group || !b.branch_id)) fail(config, 400, 'BOT_INCOMPLETE', 'Cần token, nhóm PT và chi nhánh để bật bot')
    if (b.token) botCfg.has_token = true
    Object.assign(botCfg, { enabled: b.enabled, bot_name: b.bot_name, pt_group: b.pt_group, branch_id: b.branch_id, group_trainer: b.group_trainer, group_windows: b.group_windows })
    if (b.enabled) botCfg.state.lastPollAt = new Date().toISOString()
    return ok(botCfg)
  }
  if (url === '/zalo/bot/check' || url === '/zalo/bot/send-test') return ok({ ok: true, message: 'ok' })
  if (url === '/contracts/pt-staff') return ok([{ id: 'u-pt1', name: 'Vũ Bảo Khánh' }, { id: 'u-pt2', name: 'Ngô Thị Huyền Trang' }, { id: 'u-pt3', name: 'Thịnh' }])
  if (/^\/contracts\/[^/]+\/staff$/.test(url) && method === 'patch') return ok({})
  if (url === '/contracts/sale-staff') return ok([{ id: 'u-sale1', name: 'Ngô Thị Huyền Trang' }, { id: 'u-sale2', name: 'Vũ Bảo Khánh' }])
  if (url === '/attendance/face-jobs' && method === 'get') return ok([{ id: 'fj1', device_name: 'Máy Q7', status: 'done', message: null, created_at: new Date().toISOString() }])
  if (url === '/attendance/face-jobs' && method === 'post') return ok([{ id: 'fj2', status: 'pending' }])
  if (url.startsWith('/payroll')) {
    if (method === 'get') need('payroll.read')
    else need('payroll.manage')
    if (url === '/payroll/settings' && method === 'get') return ok(payrollSettings)
    if (url === '/payroll/settings' && method === 'put') { Object.assign(payrollSettings, body); return ok(payrollSettings) }
    if (url === '/payroll/profiles' && method === 'get') return ok(payrollStaff)
    const prm = /^\/payroll\/profiles\/([^/]+)$/.exec(url)
    if (prm && method === 'put') {
      const u = payrollStaff.find((x) => x.user_id === prm[1])
      if (!u) fail(config, 404, 'NOT_FOUND', 'Không tìm thấy nhân viên')
      u!.profile = body as Record<string, unknown>
      return ok(u!.profile)
    }
    if (url === '/payroll/preview' && method === 'get') {
      const month = String(params.month ?? '')
      const rows = payrollRows(month)
      const keys = ['base_salary', 'member_sales', 'member_commission', 'marketing_commission', 'pt_sales', 'pt_immediate', 'pt_session_pay', 'pt_sessions_taught', 'group_classes', 'group_pay', 'gross', 'insurance', 'tax', 'penalty', 'adjustment', 'net'] as const
      const totals: Record<string, number> = {}
      for (const k of keys) totals[k] = rows.reduce((a, r) => a + (r[k] as number), 0)
      return ok({ month, status: payrollClosed.has(month) ? 'closed' : 'open', rows, totals })
    }
    if (url === '/payroll/adjustments' && method === 'put') {
      const b = body as { user_id: string; month: string; penalty: number; adjustment: number; note: string }
      if (payrollClosed.has(b.month)) fail(config, 409, 'PERIOD_CLOSED', 'Tháng đã chốt, không sửa được')
      payrollAdj[`${b.user_id}:${b.month}`] = { penalty: b.penalty, adjustment: b.adjustment, note: b.note || null }
      return ok(b)
    }
    if (url === '/payroll/close' && method === 'post') { payrollClosed.add((body as { month: string }).month); return ok({ month: (body as { month: string }).month, status: 'closed', closed_at: new Date().toISOString() }) }
    if (url === '/payroll/reopen' && method === 'post') { payrollClosed.delete((body as { month: string }).month); return ok({ month: (body as { month: string }).month, status: 'open' }) }
    if (url === '/payroll/periods' && method === 'get') return ok([...payrollClosed].map((m) => ({ month: m, status: 'closed', closed_at: new Date().toISOString() })))
  }
  if (url === '/attendance/scans') {
    const first = !scanDemoShown
    scanDemoShown = true
    return ok({ now: new Date().toISOString(), items: first ? [{ id: 'sc1', employee_no: 'HV0389', scanned_at: new Date().toISOString(), result: 'allowed', reason: null, member: { id: 'm1', code: 'HV0389', name: 'Lê Thị Ngọc Trang', phone: '0907557550', has_photo: false, photo_version: null, package_name: 'MEMBER 3 THÁNG + 1', end_date: '2027-01-05', state: 'ok', sessions_left: null, debt: 400000 } }] : [] })
  }
  if (url === '/attendance/summary') return ok(attRows)
  if (url === '/attendance/devices' && method === 'get') return ok(attDevices)
  if (url === '/attendance/devices' && method === 'post') {
    const b = body as { name: string; branch_id?: string }
    const bid = b.branch_id ?? 'b-nb'
    const d = { id: nid('dv'), name: b.name, branch_id: bid, branch_name: branches.find((x) => x.id === bid)?.name ?? '', device_key: Math.random().toString(16).slice(2).padEnd(32, '0'), last_seen_at: null as string | null }
    attDevices.push(d)
    return ok(d)
  }
  const dvm = url.match(/^\/attendance\/devices\/([^/]+)$/)
  if (dvm && method === 'delete') {
    const i = attDevices.findIndex((d) => d.id === dvm[1])
    if (i >= 0) attDevices.splice(i, 1)
    return ok({ ok: true })
  }
  if (url === '/attendance/punches' && method === 'get') return ok([{ id: 'p1', punched_at: new Date().toISOString(), source: 'device' }])
  if (url.startsWith('/attendance/punches')) return ok({ ok: true })
  const stm = url.match(/^\/attendance\/staff\/([^/]+)$/)
  if (stm) return ok({ user_id: stm[1], employee_no: (body as { employee_no: string | null }).employee_no })
  if (url === '/users' && method === 'get') {
    need('roles.read')
    return paged(config.params?.scope === 'login' ? adminUsers.filter((u) => u.roles.some((r) => ['super_admin', 'owner', 'receptionist'].includes(r.role))) : adminUsers)
  }
  const urm = url.match(/^\/users\/([^/]+)\/roles(?:\/(.+))?$/)
  if (urm) {
    need('roles.assign')
    const u = adminUsers.find((x) => x.id === urm[1])
    if (!u) fail(config, 404, 'NOT_FOUND', 'Không tìm thấy người dùng')
    if (method === 'post') {
      u!.roles.push({ id: nid('ur'), role: body.role, branch_id: body.branch_id ?? null })
      log(me.email, 'roles.assign', `${u!.email}:+${body.role}`)
      return ok(u)
    }
    if (method === 'delete') {
      u!.roles = u!.roles.filter((r) => r.id !== urm[2])
      log(me.email, 'roles.revoke', u!.email)
      return ok(u)
    }
  }
  if (url === '/audit-logs') {
    need('system.view_audit_log')
    let rows = audit.slice()
    if (params.actor) rows = rows.filter((a) => (a.actor_email ?? '').toLowerCase().includes(String(params.actor).toLowerCase()))
    if (params.action) rows = rows.filter((a) => a.action.toLowerCase().includes(String(params.action).toLowerCase()))
    if (params.from) rows = rows.filter((a) => a.created_at.slice(0, 10) >= String(params.from))
    if (params.to) rows = rows.filter((a) => a.created_at.slice(0, 10) <= String(params.to))
    return paged(rows)
  }

  return fail(config, 404, 'NOT_FOUND', 'Không tìm thấy')
}
