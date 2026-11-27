import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { usePermission } from '../context/usePermission'
import { Button, Field, Input, PageHeader, Panel, useToast } from '../components/ui'

export default function TermsSettings() {
  const toast = useToast()
  const { can } = usePermission()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    api.get<{ data: { url: string } }>('/contracts/terms-url').then((r) => setUrl(r.data.data.url)).catch(() => setErr('Không tải được cấu hình')).finally(() => setLoading(false))
  }, [])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      const r = await api.put<{ data: { url: string } }>('/contracts/terms-url', { url: url.trim() })
      setUrl(r.data.data.url)
      toast('Đã lưu liên kết điều khoản hợp đồng')
    } catch (e2) {
      setErr(apiError(e2).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title="Điều khoản hợp đồng" />
      <Panel title="Liên kết điều khoản hợp đồng">
        <form className="form-grid" onSubmit={save}>
          {err && <div className="form-error full" role="alert">{err}</div>}
          <Field label="Liên kết (URL)" htmlFor="tm-url" full hint="Khách bấm vào chữ điều khoản hợp đồng trên iPad khi ký sẽ mở liên kết này. Để trống nếu chưa có.">
            <Input id="tm-url" type="url" inputMode="url" placeholder="https://" disabled={loading || !can('system.manage_settings')} value={url} onChange={(e) => setUrl(e.target.value)} />
          </Field>
          {url.trim() && <div className="full"><a href={url.trim()} target="_blank" rel="noopener noreferrer">Mở thử liên kết</a></div>}
          {can('system.manage_settings') && <div className="full" style={{ display: 'flex', justifyContent: 'flex-end' }}><Button type="submit" variant="primary" disabled={busy || loading}>{busy ? 'Đang lưu...' : 'Lưu'}</Button></div>}
        </form>
      </Panel>
    </>
  )
}
