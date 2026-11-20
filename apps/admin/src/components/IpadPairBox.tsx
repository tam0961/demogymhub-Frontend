import { useCallback, useEffect, useState } from 'react'
import { apiError } from '../lib/errors'
import { getBranchIpad, pairBranchIpad, unpairBranchIpad } from '../lib/ipad'
import { Button, Input, useToast } from './ui'

export function useBranchIpad(branchId: string) {
  const [token, setToken] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const refresh = useCallback(async () => {
    if (!branchId) { setToken(null); setLoaded(true); return }
    try { setToken(await getBranchIpad(branchId)) } catch { setToken(null) }
    setLoaded(true)
  }, [branchId])
  useEffect(() => { void refresh() }, [refresh])
  return { token, loaded, refresh }
}

export function IpadPairBox({ branchId, token, onChanged }: { branchId: string; token: string | null; onChanged: () => void }) {
  const toast = useToast()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const pair = async () => {
    setBusy(true)
    try {
      await pairBranchIpad(branchId, code.trim())
      toast('Đã kết nối iPad quầy')
      setCode('')
      onChanged()
    } catch (e) {
      toast(apiError(e).message)
    } finally {
      setBusy(false)
    }
  }

  const unpair = async () => {
    try {
      await unpairBranchIpad(branchId)
      onChanged()
    } catch (e) {
      toast(apiError(e).message)
    }
  }

  if (token) {
    return (
      <div className="ipad-box">
        <div>
          <div className="cell-main">iPad quầy lễ tân đã kết nối</div>
          <div className="hint-muted">Yêu cầu ký sẽ tự hiện trên iPad.</div>
          <Button small onClick={unpair}>Ngắt kết nối</Button>
        </div>
      </div>
    )
  }
  return (
    <div className="ipad-box">
      <div>
        <div className="cell-main">Kết nối iPad quầy lễ tân</div>
        <div className="hint-muted">Mở {window.location.origin}/ipad trên iPad, nhập mã 6 số hiện trên iPad vào đây. Chỉ cần làm một lần.</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <Input aria-label="Mã kết nối iPad" inputMode="numeric" maxLength={6} placeholder="6 số trên iPad" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} style={{ maxWidth: 160 }} />
          <Button variant="primary" disabled={busy || code.length !== 6} onClick={pair}>Kết nối</Button>
        </div>
      </div>
    </div>
  )
}
