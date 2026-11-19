import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { useAuth } from '../context/AuthContext'
import { Button, Chip, Field, Input, PageHeader, Panel, Select, useToast } from '../components/ui'
import { copyText } from './Expiring'

interface Device { id: string; name: string; branch_id: string; branch_name?: string; device_key: string; last_seen_at: string | null }
const pushUrl = (key: string) => `${window.location.origin}/api/public/attendance/hikvision/${key}`

export default function Devices() {
  const onToast = useToast()
  const { user } = useAuth()
  const [devices, setDevices] = useState<Device[]>([])
  const [name, setName] = useState('')
  const [branch, setBranch] = useState(user?.branches.length === 1 ? user.branches[0].id : '')
  const [err, setErr] = useState('')
  const load = useCallback(async () => {
    try {
      const { data } = await api.get<{ data: Device[] }>('/attendance/devices')
      setDevices(data.data)
    } catch (e) {
      setErr(apiError(e).message)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const add = async (e: FormEvent) => {
    e.preventDefault()
    setErr('')
    try {
      await api.post('/attendance/devices', { name: name.trim(), branch_id: branch || undefined })
      setName('')
      await load()
    } catch (er) {
      setErr(apiError(er).message)
    }
  }
  const remove = async (id: string) => {
    try {
      await api.delete(`/attendance/devices/${id}`)
      await load()
    } catch (er) {
      onToast(apiError(er).message)
    }
  }
  const copy = async (text: string) => onToast((await copyText(text)) ? 'Đã sao chép' : 'Không sao chép được')

  return (
    <>
      <PageHeader title="Thiết bị" sub="Kết nối máy chấm công khuôn mặt." />
      <Panel title="Máy chấm công Hikvision">
        <p className="cell-sub">
          Tạo một thiết bị cho mỗi máy, rồi vào trang cài đặt của máy: Cấu hình, Mạng, Cài đặt nâng cao, HTTP Listening (hoặc Event Receiver). Dán địa chỉ bên dưới vào mục URL, bật gửi sự kiện kiểm soát ra vào. Sau đó gán mã nhân viên trên máy cho tài khoản ở Nhân sự, Nhân viên.
        </p>
        {err && <div className="form-error" role="alert">{err}</div>}
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Thiết bị</th><th>Chi nhánh</th><th>Địa chỉ nhận dữ liệu</th><th>Lần cuối nhận</th><th /></tr></thead>
            <tbody>
              {devices.length === 0 && <tr><td colSpan={5} className="cell-sub">Chưa có thiết bị.</td></tr>}
              {devices.map((d) => (
                <tr key={d.id}>
                  <td><span className="cell-main">{d.name}</span></td>
                  <td>{d.branch_name}</td>
                  <td><code style={{ wordBreak: 'break-all' }}>{pushUrl(d.device_key)}</code></td>
                  <td>{d.last_seen_at ? new Date(d.last_seen_at).toLocaleString('vi-VN') : <Chip tone="warn">Chưa nhận dữ liệu</Chip>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <Button small onClick={() => copy(pushUrl(d.device_key))}>Sao chép</Button>{' '}
                    <Button small variant="danger" onClick={() => remove(d.id)}>Xóa</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form onSubmit={add} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 12, flexWrap: 'wrap' }}>
          <Field label="Tên thiết bị" htmlFor="dv-name"><Input id="dv-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Cổng chính" /></Field>
          {(user?.branches.length ?? 0) > 1 && (
            <Field label="Chi nhánh" htmlFor="dv-branch">
              <Select id="dv-branch" required value={branch} onChange={(e) => setBranch(e.target.value)}>
                <option value="">Chọn chi nhánh</option>
                {user?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </Field>
          )}
          <Button type="submit" variant="primary">Thêm thiết bị</Button>
        </form>
      </Panel>
    </>
  )
}
