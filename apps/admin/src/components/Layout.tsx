import { useState, type FormEvent } from 'react'
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { BranchProvider, useBranch } from '../context/BranchContext'
import { usePermission } from '../context/usePermission'
import { useShift } from '../context/ShiftContext'
import { ShiftProvider } from '../context/ShiftContext'
import { Icon } from './ui'

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
  return (
    <ShiftProvider canOpen={can('shifts.open')}>
      <Shell />
    </ShiftProvider>
  )
}

interface NavItem { to: string; label: string; icon: string; perm: string[] | null; end?: boolean }
const GROUPS: { title: string; items: NavItem[] }[] = [
  { title: 'Tổng quan', items: [
    { to: '/', label: 'Hôm nay', icon: 'today', perm: null, end: true },
    { to: '/reports', label: 'Báo cáo', icon: 'reports', perm: ['reports.view'], end: true },
  ] },
  { title: 'Khách hàng', items: [
    { to: '/members', label: 'Hội viên', icon: 'members', perm: ['members.read'] },
    { to: '/contracts', label: 'Hợp đồng', icon: 'contracts', perm: ['contracts.read'] },
  ] },
  { title: 'Vận hành', items: [
    { to: '/packages', label: 'Gói tập', icon: 'packages', perm: ['packages.read'] },
  ] },
  { title: 'Tài chính', items: [
    { to: '/payments', label: 'Thanh toán', icon: 'payments', perm: ['payments.read'] },
    { to: '/shift', label: 'Ca thu ngân', icon: 'closing', perm: ['shifts.open', 'shifts.close'] },
    { to: '/reports/closing', label: 'Chốt ngày', icon: 'closing', perm: ['reports.view'] },
  ] },
  { title: 'Hệ thống', items: [
    { to: '/users', label: 'Người dùng', icon: 'users', perm: ['roles.read'] },
    { to: '/roles', label: 'Vai trò', icon: 'roles', perm: ['roles.read'] },
    { to: '/audit', label: 'Nhật ký', icon: 'audit', perm: ['system.view_audit_log'] },
    { to: '/me', label: 'Tài khoản', icon: 'me', perm: null },
  ] },
]

function Shell() {
  const { user, logout } = useAuth()
  const { canAny } = usePermission()
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  const loc = useLocation()

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">Gym<span>Hub</span></div>
        <nav className="nav" onClick={() => setOpen(false)} aria-label="Điều hướng">
          {GROUPS.map((g) => {
            const items = g.items.filter((n) => !n.perm || canAny(...n.perm))
            if (!items.length) return null
            return (
              <div key={g.title} className="nav-group">
                <div className="nav-title">{g.title}</div>
                {items.map((n) => (
                  <NavLink key={n.to} to={n.to} end={n.end ?? false} className={({ isActive }) => (isActive ? 'active' : '')}>
                    <Icon name={n.icon} />
                    {n.label}
                  </NavLink>
                ))}
              </div>
            )
          })}
        </nav>
        <div className="side-foot">
          <b>{user?.name}</b>
          {user?.email}
          <br />
          <button onClick={async () => { await logout(); nav('/login', { replace: true }) }}>Đăng xuất</button>
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

function Topbar({ onMenu }: { onMenu: () => void }) {
  const { user } = useAuth()
  const { branchId, setBranch } = useBranch()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const { can } = usePermission()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (can('members.read')) nav(`/members?q=${encodeURIComponent(q.trim())}`)
  }

  return (
    <header className="topbar">
      <button className="btn btn-sm menu-btn" onClick={onMenu} aria-label="Mở menu">
        <Icon name="menu" />
      </button>
      <form className="search" onSubmit={submit} role="search">
        <input className="input" type="search" placeholder="Tìm hội viên theo tên, SĐT, mã" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm kiếm" />
      </form>
      <ShiftChip />
      <div className="branch-switch" role="group" aria-label="Chi nhánh">
        <button className="branch-btn all" aria-pressed={branchId === null} onClick={() => setBranch(null)}>Tất cả</button>
        {user?.branches.map((b) => (
          <button key={b.id} className={`branch-btn ${b.code.toLowerCase()}`} aria-pressed={branchId === b.id} onClick={() => setBranch(b.id)} title={b.name}>
            {b.code}
          </button>
        ))}
      </div>
    </header>
  )
}

function ShiftChip() {
  const { shift, loaded, openModal } = useShift()
  const { can } = usePermission()
  const nav = useNavigate()
  if (!loaded || !can('shifts.open')) return null
  if (shift) {
    return (
      <button className="chip chip-ok" onClick={() => nav('/shift')} title="Xem hoặc đóng ca">
        Ca đang mở {new Date(shift.opened_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
      </button>
    )
  }
  return <button className="chip chip-warn" onClick={openModal}>Chưa mở ca - Mở ca</button>
}
