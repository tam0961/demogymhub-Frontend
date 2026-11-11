import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { BranchProvider, useBranch } from '../context/BranchContext'
import { usePermission } from '../context/usePermission'
import { useShift, ShiftProvider } from '../context/ShiftContext'
import { useConnected } from '../lib/connection'
import { Avatar, BranchTag, Icon, Segmented, branchColor } from './ui'
import type { Me } from '../types'
import type { IconName } from './icons'

export function RequireAuth() {
  const { user, ready } = useAuth()
  const loc = useLocation()
  if (!ready) return <div className="loading">Đang tải...</div>
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  return (
    <BranchProvider>
      <ShiftGate />
    </BranchProvider>
  )
}

function ShiftGate() {
  const { can } = usePermission()
  const { user } = useAuth()
  return (
    <ShiftProvider canOpen={can('shifts.open') && !isAdminAll(user)}>
      <Shell />
    </ShiftProvider>
  )
}

interface NavItem { to: string; label: string; icon: IconName; perm: string[] | null; cashier?: boolean }

export const isAdminAll = (u: { roles: string[] } | null | undefined) => !!u && (u.roles.includes('owner') || u.roles.includes('super_admin'))
const navVisible = (n: NavItem, canAny: (...p: string[]) => boolean, admin: boolean) => (!n.perm || canAny(...n.perm)) && !(n.cashier && admin)
interface NavGroup { title: string; items: NavItem[] }
export const NAV_GROUPS: NavGroup[] = [
  { title: 'Vận hành', items: [
    { to: '/', label: 'Hôm nay', icon: 'today', perm: null },
    { to: '/access', label: 'Kiểm soát ra vào', icon: 'access', perm: ['checkins.read'] },
  ] },
  { title: 'Khách hàng', items: [
    { to: '/members', label: 'Hội viên', icon: 'members', perm: ['members.read'] },
    { to: '/contracts', label: 'Hợp đồng', icon: 'contracts', perm: ['contracts.read'] },
  ] },
  { title: 'Tài chính', items: [
    { to: '/packages', label: 'Gói dịch vụ', icon: 'packages', perm: ['packages.read'] },
    { to: '/payments', label: 'Phiếu thu', icon: 'payments', perm: ['payments.read'] },
    { to: '/debt', label: 'Công nợ', icon: 'debt', perm: ['contracts.read'] },
    { to: '/shift', label: 'Chốt ca', icon: 'shift', perm: ['shifts.open', 'shifts.close'], cashier: true },
    { to: '/reports/closing', label: 'Đối soát', icon: 'closing', perm: ['reports.view'] },
  ] },
  { title: 'Thống kê', items: [
    { to: '/reports', label: 'Hiệu suất kinh doanh', icon: 'reports', perm: ['reports.view'] },
  ] },
  { title: 'Cài đặt', items: [
    { to: '/users', label: 'Tài khoản và phân quyền', icon: 'users', perm: ['roles.read'] },
    { to: '/roles', label: 'Vai trò', icon: 'roles', perm: ['roles.read'] },
    { to: '/audit', label: 'Nhật ký thao tác', icon: 'audit', perm: ['system.view_audit_log'] },
  ] },
]

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, group: g.title })))

export function activeNavTo(path: string): string | null {
  let best: string | null = null
  for (const i of ALL_ITEMS) {
    const hit = i.to === '/' ? path === '/' : path === i.to || path.startsWith(i.to + '/')
    if (hit && (!best || i.to.length > best.length)) best = i.to
  }
  return best
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase().trim()

function Shell() {
  const { user, logout } = useAuth()
  const { canAny } = usePermission()
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  const loc = useLocation()
  const active = activeNavTo(loc.pathname)
  const activeGroup = ALL_ITEMS.find((i) => i.to === active)?.group
  const [opened, setOpened] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (activeGroup) setOpened((o) => (o[activeGroup] ? o : { ...o, [activeGroup]: true }))
  }, [activeGroup])
  useEffect(() => setOpen(false), [loc.pathname])

  const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((n) => navVisible(n, canAny, isAdminAll(user))) })).filter((g) => g.items.length)
  const roleLabel = user ? roleLabelOf(user) : ''

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <Link to="/" className="brand" aria-label="TH Gym và Fitness, về trang Hôm nay">
          <img src="/logo.png" alt="" width={44} height={44} />
          <span>
            <b>TH Gym &amp; Fitness</b>
            <small>TRUE GYM TRUE LIFE</small>
          </span>
        </Link>
        <nav className="nav" aria-label="Điều hướng">
          {groups.map((g) => {
            const isOpen = !!opened[g.title]
            return (
              <div key={g.title} className="nav-group">
                <button type="button" className={`nav-title ${g.title === activeGroup ? 'has-active' : ''}`} aria-expanded={isOpen} onClick={() => setOpened((o) => ({ ...o, [g.title]: !isOpen }))}>
                  {g.title}
                  <Icon name={isOpen ? 'down' : 'right'} size={14} />
                </button>
                {isOpen && g.items.map((n) => (
                  <Link key={n.to} to={n.to} className={n.to === active ? 'active' : ''} aria-current={n.to === active ? 'page' : undefined}>
                    <Icon name={n.icon} size={18} />
                    {n.label}
                  </Link>
                ))}
              </div>
            )
          })}
        </nav>
        <div className="side-foot">
          <Link to="/me" className="side-user" aria-label="Tài khoản của tôi">
            <Avatar name={user?.name ?? '?'} size={34} />
            <span>
              <b>{user?.name}</b>
              <small>{roleLabel}</small>
            </span>
          </Link>
          <button type="button" className="btn-outline-side" onClick={async () => { await logout(); nav('/login', { replace: true }) }}>Đăng xuất</button>
        </div>
      </aside>
      <div className={`scrim ${open ? 'open' : ''}`} onClick={() => setOpen(false)} />
      <div className="main">
        <Topbar onMenu={() => setOpen(true)} />
        <main className="content" key={loc.pathname}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Chủ phòng gym', owner: 'Chủ phòng gym', branch_manager: 'Quản lý', manager: 'Quản lý', receptionist: 'Lễ tân',
  sales: 'Sales', trainer: 'PT', accountant: 'Kế toán', member: 'Hội viên',
}
const BRANCH_ROLES = ['receptionist', 'branch_manager', 'manager']

export function roleLabelOf(u: Pick<Me, 'roles' | 'branches' | 'checkin_branch'>): string {
  const r = u.roles[0]
  if (!r) return ''
  const base = ROLE_LABEL[r] ?? r
  const br = u.checkin_branch ?? (u.branches.length === 1 ? u.branches[0] : null)
  if (!br || !BRANCH_ROLES.includes(r)) return base
  const short = br.name.replace(/^Chi nhánh\s+/i, '')
  return `${base} ${short}`
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const { user } = useAuth()
  const { branchId, setBranch } = useBranch()
  const { can, canAny } = usePermission()
  const nav = useNavigate()
  const connected = useConnected()
  const [q, setQ] = useState('')

  const screens = useMemo(() => ALL_ITEMS.filter((n) => navVisible(n, canAny, isAdminAll(user))), [canAny, user])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const v = q.trim()
    if (!v) return
    const hit = screens.find((s) => fold(s.label) === fold(v)) ?? screens.find((s) => fold(s.label).includes(fold(v)) && v.length >= 3 && !can('members.read'))
    if (hit) nav(hit.to)
    else if (can('members.read')) nav(`/members?q=${encodeURIComponent(v)}`)
    setQ('')
  }

  const single = user?.branches.length === 1 ? user.branches[0] : null
  const options = [
    { value: '', label: 'Tất cả chi nhánh', dot: 'all' as const },
    ...(user?.branches.map((b) => ({ value: b.id, label: b.name, dot: branchColor(b.code) as 'q2' | 'nb' | 'q7' | 'all' })) ?? []),
  ]

  return (
    <header className="topbar">
      <button type="button" className="btn btn-sm menu-btn" onClick={onMenu} aria-label="Mở menu">
        <Icon name="menu" size={18} /> Menu
      </button>
      <form className="search" onSubmit={submit} role="search">
        <Icon name="search" size={16} />
        <input className="input" type="search" list="screen-list" placeholder="Tìm hội viên hoặc màn hình" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm hội viên hoặc màn hình" />
        <datalist id="screen-list">{screens.map((s) => <option key={s.to} value={s.label} />)}</datalist>
      </form>
      <div className="top-right">
        <ShiftChip />
        <span className={`conn ${connected ? 'conn-ok' : 'conn-bad'}`} role="status">
          <span className="dot" aria-hidden="true" />
          {connected ? 'Đã kết nối' : 'Mất kết nối'}
        </span>
        {single
          ? <span className="branch-fixed" aria-label="Chi nhánh của bạn"><BranchTag branch={single} /></span>
          : <Segmented ariaLabel="Chi nhánh" options={options} value={branchId ?? ''} onChange={(v) => setBranch(v || null)} />}
      </div>
    </header>
  )
}

function ShiftChip() {
  const { shift, loaded, openModal } = useShift()
  const { can } = usePermission()
  const { user } = useAuth()
  const nav = useNavigate()
  if (!loaded || !can('shifts.open') || isAdminAll(user)) return null
  if (shift) {
    return (
      <button type="button" className="chip chip-ok" onClick={() => nav('/shift')} title="Xem hoặc đóng ca">
        Ca đang mở {new Date(shift.opened_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
      </button>
    )
  }
  return <button type="button" className="chip chip-warn" onClick={openModal}>Chưa mở ca - Mở ca</button>
}
