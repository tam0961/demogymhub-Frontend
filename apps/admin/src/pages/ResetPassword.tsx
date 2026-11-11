import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { AuthBrand } from '../components/AuthBrand'
import { Button, Field, Input } from '../components/ui'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (pw.length < 8) return setError('Mật khẩu mới tối thiểu 8 ký tự')
    if (pw !== pw2) return setError('Mật khẩu nhập lại không khớp')
    setBusy(true)
    try {
      await api.post('/auth/reset-password', { token, new_password: pw })
      setDone(true)
    } catch (x) {
      setError(apiError(x).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <form className="card login-card" onSubmit={submit}>
        <AuthBrand />
        <h1 className="display">Đặt lại mật khẩu</h1>
        {!token && <div className="form-error" role="alert">Liên kết thiếu mã xác thực.</div>}
        {done ? (
          <div role="status">Đã đặt lại mật khẩu. Bạn có thể đăng nhập bằng mật khẩu mới.</div>
        ) : (
          <>
            {error && <div className="form-error" role="alert">{error}</div>}
            <Field label="Mật khẩu mới" htmlFor="rp-pw"><Input id="rp-pw" type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
            <Field label="Nhập lại mật khẩu" htmlFor="rp-pw2"><Input id="rp-pw2" type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
            <Button variant="primary" className="btn-block" type="submit" disabled={busy || !token}>{busy ? 'Đang lưu...' : 'Đặt lại mật khẩu'}</Button>
          </>
        )}
        <div className="link-row"><Link to="/login">Về đăng nhập</Link></div>
      </form>
    </div>
  )
}
