import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { Button, Field, Input, PageHeader, Panel, useToast } from '../components/ui'

type Kind = 'leads' | 'payroll' | 'pt_group'
type Sheet = { name: string; url: string }
type Cfg = Record<Kind, Sheet>

const KINDS: { key: Kind; label: string; hint: string }[] = [
  { key: 'leads', label: 'Sheet khách tiềm năng', hint: 'Bảng khách để lại thông tin (KH Gym).' },
  { key: 'payroll', label: 'Sheet bảng lương', hint: 'Bảng lương nhân viên và PT.' },
  { key: 'pt_group', label: 'Sheet PT nhóm', hint: 'Lịch và đăng ký lớp PT nhóm.' },
]
const EMPTY: Cfg = { leads: { name: '', url: '' }, payroll: { name: '', url: '' }, pt_group: { name: '', url: '' } }
const isSheetUrl = (u: string) => u === '' || /^https:\/\/docs\.google\.com\/spreadsheets\//.test(u)

export default function SheetSettings() {
  const toast = useToast()
  const [cfg, setCfg] = useState<Cfg>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<{ data: Cfg }>('/settings/sheets')
      .then(({ data }) => setCfg({ ...EMPTY, ...data.data }))
      .catch((e) => setError(apiError(e).message))
      .finally(() => setLoading(false))
  }, [])

  const set = (k: Kind, f: keyof Sheet, v: string) => setCfg((c) => ({ ...c, [k]: { ...c[k], [f]: v } }))
  const bad = KINDS.some((k) => !isSheetUrl(cfg[k.key].url.trim()))

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (bad) return
    setBusy(true)
    setError('')
    try {
      const body = Object.fromEntries(KINDS.map((k) => [k.key, { name: cfg[k.key].name.trim(), url: cfg[k.key].url.trim() }]))
      const { data } = await api.put<{ data: Cfg }>('/settings/sheets', body)
      setCfg({ ...EMPTY, ...data.data })
      toast('Đã lưu cấu hình Google Sheet')
    } catch (err) {
      setError(apiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="loading">Đang tải...</div>

  return (
    <>
      <PageHeader title="Google Sheet" sub="Lưu liên kết các bảng tính dùng chung. Mỗi sheet cần mở quyền xem cho tài khoản dịch vụ khi nối đồng bộ." />
      <form onSubmit={save}>
        {KINDS.map((k) => {
          const s = cfg[k.key]
          const invalid = !isSheetUrl(s.url.trim())
          return (
            <Panel key={k.key} title={k.label} note={s.url.trim() && !invalid ? <a href={s.url.trim()} target="_blank" rel="noreferrer">Mở sheet</a> : undefined}>
              <div className="form-grid">
                <Field label="Tên gợi nhớ" htmlFor={`sh-${k.key}-name`}><Input id={`sh-${k.key}-name`} value={s.name} maxLength={100} onChange={(e) => set(k.key, 'name', e.target.value)} /></Field>
                <Field label="Liên kết Google Sheet" htmlFor={`sh-${k.key}-url`} hint={k.hint} error={invalid ? 'Phải là liên kết docs.google.com/spreadsheets' : undefined}>
                  <Input id={`sh-${k.key}-url`} invalid={invalid} inputMode="url" placeholder="https://docs.google.com/spreadsheets/d/..." value={s.url} maxLength={500} onChange={(e) => set(k.key, 'url', e.target.value)} />
                </Field>
              </div>
            </Panel>
          )
        })}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}><Button type="submit" variant="primary" disabled={busy || bad}>{busy ? 'Đang lưu...' : 'Lưu'}</Button></div>
      </form>
    </>
  )
}
