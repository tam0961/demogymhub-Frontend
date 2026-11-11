import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
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
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
    } catch (err) {
      const a = apiError(err)
      setError(MESSAGES[a.code] ?? a.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="center-page">
      <form className="card login-card" onSubmit={submit}>
        <h1 className="display">GymHub</h1>
        <p style={{ margin: 0, color: 'var(--muted)' }}>Đăng nhập để quản lý phòng tập</p>
        {error && <div className="form-error" role="alert">{error}</div>}
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Mật khẩu" htmlFor="password">
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button variant="primary" type="submit" disabled={busy}>{busy ? 'Đang đăng nhập...' : 'Đăng nhập'}</Button>
        <Link to="/forgot-password">Quên mật khẩu?</Link>
        {USE_MOCK && <small style={{ color: 'var(--muted)' }}>Mock: admin@gymhub.vn / admin123, letan@gymhub.vn / letan123, quanly@gymhub.vn / quanly123</small>}
      </form>
    </div>
  )
}
