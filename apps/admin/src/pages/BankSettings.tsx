import { useState, type FormEvent } from 'react'
import { Button, Field, Input, PageHeader, Panel, Select, useToast } from '../components/ui'
import { BANKS, BANK_KEY, loadBank, type BankCfg } from '../lib/bank'

export default function BankSettings() {
  const toast = useToast()
  const [cfg, setCfg] = useState<BankCfg>(loadBank)
  const set = (k: keyof BankCfg, v: string) => setCfg((c) => ({ ...c, [k]: v }))

  const save = (e: FormEvent) => {
    e.preventDefault()
    try { localStorage.setItem(BANK_KEY, JSON.stringify({ ...cfg, account: cfg.account.replace(/\s/g, '') })) } catch { /* ignore */ }
    toast('Đã lưu tài khoản ngân hàng (lưu trên trình duyệt này)')
  }

  return (
    <>
      <PageHeader title="Tài khoản ngân hàng" />
      <Panel title="Tài khoản nhận chuyển khoản của công ty">
        <form className="form-grid" onSubmit={save}>
          <Field label="Ngân hàng" htmlFor="bk-bank">
            <Select id="bk-bank" required value={cfg.bank} onChange={(e) => set('bank', e.target.value)}>
              <option value="" disabled>Chọn ngân hàng</option>
              {BANKS.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label="Số tài khoản" htmlFor="bk-acc"><Input id="bk-acc" required inputMode="numeric" value={cfg.account} onChange={(e) => set('account', e.target.value.replace(/[^\d ]/g, ''))} /></Field>
          <Field label="Tên chủ tài khoản" htmlFor="bk-holder" full hint="Viết hoa không dấu theo đúng tên đăng ký tại ngân hàng."><Input id="bk-holder" required value={cfg.holder} onChange={(e) => set('holder', e.target.value)} /></Field>
          <div className="full" style={{ display: 'flex', justifyContent: 'flex-end' }}><Button type="submit" variant="primary">Lưu</Button></div>
        </form>
      </Panel>
    </>
  )
}
