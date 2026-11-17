export interface BankCfg { bank: string; account: string; holder: string }
export const BANK_KEY = 'gymhub.bank.config'
export const EMPTY_BANK: BankCfg = { bank: '', account: '', holder: '' }

export const BANKS: { code: string; name: string }[] = [
  { code: 'VCB', name: 'Vietcombank' }, { code: 'TCB', name: 'Techcombank' }, { code: 'MB', name: 'MB Bank' }, { code: 'ACB', name: 'ACB' },
  { code: 'BIDV', name: 'BIDV' }, { code: 'ICB', name: 'VietinBank' }, { code: 'VPB', name: 'VPBank' }, { code: 'TPB', name: 'TPBank' },
  { code: 'STB', name: 'Sacombank' }, { code: 'VIB', name: 'VIB' }, { code: 'HDB', name: 'HDBank' }, { code: 'SHB', name: 'SHB' },
  { code: 'OCB', name: 'OCB' }, { code: 'MSB', name: 'MSB' }, { code: 'EIB', name: 'Eximbank' }, { code: 'VBA', name: 'Agribank' },
]

export const loadBank = (): BankCfg => {
  try { return { ...EMPTY_BANK, ...JSON.parse(localStorage.getItem(BANK_KEY) ?? '{}') } } catch { return EMPTY_BANK }
}
export const bankReady = (b: BankCfg) => !!b.bank && b.account.trim().length >= 6

export const stripVN = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')

export function transferContent(name: string, pkgName: string): string {
  return stripVN(`${name} ${pkgName}`).replace(/[^A-Za-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50)
}

export function vietQrUrl(b: BankCfg, amount: number, content: string): string {
  const q = new URLSearchParams({ amount: String(amount), addInfo: content, accountName: stripVN(b.holder).toUpperCase() })
  return `https://img.vietqr.io/image/${b.bank}-${b.account.trim()}-compact2.png?${q.toString()}`
}
