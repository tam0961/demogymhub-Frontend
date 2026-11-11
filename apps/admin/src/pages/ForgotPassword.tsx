import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { Button, Field, Input } from '../components/ui'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.post('/auth/forgot-password', { email: email.trim() })
      setSent(true)
    } catch (x) {
      setError(apiError(x).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="center-page">
      <form className="card login-card" onSubmit={submit}>
        <h1 className="display">Quên mật khẩu</h1>
        {sent ? (
          <div role="status">Nếu email tồn tại trong hệ thống, liên kết đặt lại mật khẩu đã được gửi. Hãy kiểm tra hộp thư.</div>
        ) : (
          <>
            {error && <div className="form-error" role="alert">{error}</div>}
            <Field label="Email" htmlFor="fp-email"><Input id="fp-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Button variant="primary" type="submit" disabled={busy}>{busy ? 'Đang gửi...' : 'Gửi liên kết'}</Button>
          </>
        )}
        <Link to="/login">Quay lại đăng nhập</Link>
      </form>
    </div>
  )
}
