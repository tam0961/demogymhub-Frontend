import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { AuthBrand } from '../components/AuthBrand'
import { Button, Field, Input } from '../components/ui'
import { apiError } from '../lib/errors'
import { USE_MOCK } from '../lib/api'

const MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'Email hoặc mật khẩu không đúng',
  LOCKED_OUT: 'Tài khoản tạm khóa, thử lại sau ít phút',
  RATE_LIMITED: 'Thử quá nhiều lần, vui lòng đợi',
}

export default function Login() {
  const { user, ready, login } = useAuth()
  const loc = useLocation()
  const [email, setEmail] = useState(() => {
    try { return localStorage.getItem('gh_last_user') ?? '' } catch { return '' }
  })
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!ready) return <div className="loading">Đang kiểm tra phiên đăng nhập...</div>
  if (user) return <Navigate to={(loc.state as { from?: string } | null)?.from ?? '/'} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(email.trim(), password)
      try { localStorage.setItem('gh_last_user', email.trim()) } catch { /* storage unavailable */ }
    } catch (err) {
      const a = apiError(err)
      setError(MESSAGES[a.code] ?? a.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <form className="card login-card" onSubmit={submit}>
        <AuthBrand />
        <h1 className="display">Đăng nhập</h1>
        <p className="login-sub">Nhập tài khoản để vào hệ thống quản lý.</p>
        {error && <div className="form-error" role="alert">{error}</div>}
        <Field label="Tên đăng nhập" htmlFor="email">
          <Input id="email" type="text" autoCapitalize="none" autoCorrect="off" autoComplete="username" autoFocus={!email} required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Mật khẩu" htmlFor="password">
          <div className="pw-wrap">
            <Input id="password" type={showPw ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" className="pw-eye" aria-label={showPw ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={showPw} onClick={() => setShowPw((v) => !v)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
                <circle cx="12" cy="12" r="3" />
                {showPw && <path d="M3 3l18 18" />}
              </svg>
            </button>
          </div>
        </Field>
        <Button variant="primary" className="btn-block" type="submit" disabled={busy}>{busy ? 'Đang đăng nhập...' : 'Đăng nhập'}</Button>
        <div className="link-row"><Link to="/forgot-password">Quên mật khẩu?</Link></div>
        {USE_MOCK && <small className="hint-muted">Mock: admin@gymhub.vn / admin123, letan@gymhub.vn / letan123, quanly@gymhub.vn / quanly123</small>}
      </form>
    </div>
  )
}
