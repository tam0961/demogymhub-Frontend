import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtMoney } from '../lib/format'
import { POSITION_LABEL, SIM_POSITIONS, appliesTo, bandLabel, computeSim, insuranceParts, pct, progressiveLabel, ptSplit, type SimInput, type SimPosition } from '../lib/payroll'
import { Button, Chip, Field, Input, MoneyInput, Panel, Segmented } from '../components/ui'
import type { PayrollSettings } from '../types'
import './payrollStructure.css'

export type PayrollFilter = SimPosition | 'all'

function usePayrollSettings() {
  const [settings, setSettings] = useState<PayrollSettings | null>(null)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setError('')
    try {
      const { data } = await api.get<{ data: PayrollSettings }>('/payroll/settings')
      setSettings(data.data)
    } catch (e) {
      setError(apiError(e).message)
    }
  }, [])
  useEffect(() => { load() }, [load])
  return { settings, error, reload: load }
}

const FILTER_LABEL: Record<PayrollFilter, string> = {
  all: 'tất cả vị trí',
  pt_fulltime: 'PT Fulltime (Trang, Khánh)',
  pt_parttime: 'PT Parttime (Nguyễn Phú Thịnh)',
  marketing: 'Marketing (Trần Trí Tâm)',
}

function Loading({ error, onRetry }: { error: string; onRetry: () => void }) {
  if (error) return <div className="form-error" role="alert">{error} <Button small onClick={onRetry}>Thử lại</Button></div>
  return <p className="hint-muted" role="status">Đang tải bảng tỷ lệ...</p>
}

function FlowCard({ title, tag, meta, on, children, foot }: { title: string; tag: string; meta?: string; on: boolean; children: ReactNode; foot?: ReactNode }) {
  return (
    <article className={`ps-card${on ? '' : ' is-off'}`}>
      <div className="ps-card-top">
        <span className="ps-tag">{tag}</span>
        {meta && <span className="ps-meta">{meta}</span>}
      </div>
      <h4>{title}</h4>
      <div className="ps-card-body">{children}</div>
      <div className="ps-card-foot">{on ? <Chip tone="ok">Áp dụng</Chip> : <Chip>Không áp dụng</Chip>}{foot}</div>
    </article>
  )
}

function Accordion({ id, title, open, onToggle, children }: { id: string; title: string; open: boolean; onToggle: (o: boolean) => void; children: ReactNode }) {
  return (
    <details className="ps-acc" id={id} open={open} onToggle={(e) => onToggle((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>{title}</summary>
      <div className="ps-acc-body">{children}</div>
    </details>
  )
}

const shortBand = (text: string) => text.replace(' triệu', 'tr').replace('Dưới ', '<').replace('Trên ', '>')

export function PayrollStructure({ filter, onFilter, onSimulate }: { filter: PayrollFilter; onFilter: (f: PayrollFilter) => void; onSimulate: () => void }) {
  const { settings: s, error, reload } = usePayrollSettings()
  const [open, setOpen] = useState<Record<number, boolean>>({ 1: true, 2: true, 3: true, 4: true, 5: true })
  const all = filter === 'all'
  const on = useMemo(() => {
    const some = (f: (a: ReturnType<typeof appliesTo>) => boolean) => all || f(appliesTo(filter as SimPosition))
    return {
      marketing: some((a) => a.marketingTiers),
      ptSession: some((a) => a.ptSession),
      group: some((a) => a.groupClass),
      insurance: some((a) => a.insurance),
      flatTax: some((a) => a.flatTax),
      fixedTax: all || !appliesTo(filter as SimPosition).flatTax,
    }
  }, [filter, all])

  if (!s) return <Loading error={error} onRetry={reload} />

  const base = s.insuranceBase ?? 0
  const insTotal = Math.round((base * s.insuranceRate) / 100)
  const parts = insuranceParts(base, s.insuranceRate)
  const memberRange = `${pct(s.memberTiers[0]?.rate ?? 0)} → ${pct(s.memberTiers[s.memberTiers.length - 1]?.rate ?? 0)}`
  const mktText = s.marketingTiers.map((t, i) => `${pct(t.rate)} (${shortBand(bandLabel(s.marketingTiers, i))})`).join(' / ')
  const imm = pct(s.ptImmediateShare * 100)
  const ses = pct(s.ptSessionShare * 100)
  const allOpen = Object.values(open).every(Boolean)
  const setAll = (v: boolean) => setOpen({ 1: v, 2: v, 3: v, 4: v, 5: v })
  const toggle = (k: number) => (o: boolean) => setOpen((x) => (x[k] === o ? x : { ...x, [k]: o }))
  const showRow = (pos: SimPosition) => all || filter === pos
  const officialRow = showRow('pt_fulltime') || showRow('marketing')

  return (
    <div className="ps">
      <header className="ps-brand">
        <div>
          <h2>TH GYM &amp; FITNESS</h2>
          <p>Cơ cấu Lương &amp; Hoa hồng - Giai đoạn 1</p>
        </div>
        <div className="ps-tabs">
          <Segmented<PayrollFilter> ariaLabel="Chọn vị trí" options={SIM_POSITIONS.map((p) => ({ value: p, label: POSITION_LABEL[p] }))} value={filter} onChange={onFilter} />
          <Button small aria-pressed={all} onClick={() => onFilter('all')}>Xem tất cả</Button>
        </div>
      </header>

      <Panel title="Cơ cấu thu nhập và khấu trừ" note={`Đang lọc: ${FILTER_LABEL[filter]}`}>
        <p className="hint-muted ps-lead">Gộp phụ cấp vào lương cơ bản. Chưa chấm công. Không tính giảm trừ.</p>

        <section className="ps-step" aria-labelledby="ps-s1">
          <span className="ps-num" aria-hidden="true">1</span>
          <div>
            <div className="ps-eyebrow">Đầu vào cố định</div>
            <h3 id="ps-s1">Lương cơ bản trọn gói</h3>
            <p>Đã bao gồm phụ cấp ăn và trách nhiệm (không chia ngày công).</p>
          </div>
          <Chip>Trọn gói</Chip>
        </section>

        <div className="ps-arrow" aria-hidden="true">↓</div>

        <section aria-labelledby="ps-s2">
          <h3 id="ps-s2" className="ps-sec"><span className="ps-num" aria-hidden="true">2</span> Các khoản hoa hồng hiệu suất <span className="ps-meta">Tự động lọc theo vị trí</span></h3>
          <div className="ps-grid">
            <FlowCard tag="Dùng chung cả 3 nhóm" meta={`Lũy tiến ${s.memberTiers.length} bậc`} title="HH Bán Gói Member" on foot={<span className="ps-meta">PT Fulltime, PT Parttime, Marketing</span>}>
              <p>Tính lũy tiến từng phần theo doanh số trực tiếp chốt gói Member: <b>{memberRange}</b>.</p>
            </FlowCard>
            <FlowCard tag="Riêng Marketing" meta={`Lũy tiến ${s.marketingTiers.length} bậc`} title="HH Doanh Số Member (MKT)" on={on.marketing} foot={<span className="ps-meta">Chỉ áp dụng: Marketing</span>}>
              <p>Tính theo tổng doanh số Member tháng: <b>{mktText}</b>.</p>
            </FlowCard>
          </div>

          <FlowCard tag={`Bậc gói PT: ${s.ptTiers.map((t) => `${pct(t.rate)}`).join(' - ')}`} meta="Rẽ 2 nhánh chi trả" title="Tổng Quỹ HH Gói PT = Doanh Số × Tỷ Lệ Bậc" on>
            <div className="ps-grid">
              <div className="ps-branch">
                <div className="ps-eyebrow">Nhánh {imm} - nhận liền</div>
                <h5>HH Ký Hợp Đồng Gói PT</h5>
                <p>Nhận ngay <b>{imm}</b> tổng quỹ HH gói PT trong tháng ký (áp dụng PT và MKT nếu có bán).</p>
              </div>
              <div className={`ps-branch${on.ptSession ? '' : ' is-off'}`}>
                <div className="ps-eyebrow">Nhánh {ses} - chia buổi tập</div>
                <h5>HH Dạy PT 1-1 {!on.ptSession && <Chip>Bỏ với Marketing</Chip>}</h5>
                <p>Lấy <b>(Quỹ × {ses}) ÷ Tổng buổi gói</b> × Số buổi dạy thực tế (bỏ với Marketing).</p>
              </div>
            </div>
          </FlowCard>

          <FlowCard tag="Chỉ PT Fulltime và Parttime" meta="Bỏ với Marketing" title="Hoa Hồng Lớp Nhóm" on={on.group}>
            <p>Tính theo số buổi đứng lớp nhóm thực tế trong tháng: <b className="ps-big">{fmtMoney(s.classRate)}</b> / buổi.</p>
          </FlowCard>
        </section>

        <div className="ps-arrow" aria-hidden="true">↓</div>

        <section className="ps-gross" aria-labelledby="ps-s3">
          <div className="ps-eyebrow">Bước 3 - Tổng hợp</div>
          <h3 id="ps-s3">Tổng thu nhập (GROSS)</h3>
          <p>= Lương CB + HH Member{on.marketing && ' + HH Doanh số MKT'} + HH Gói PT ({imm}){on.ptSession && ` + HH Dạy 1-1 (${ses})`}{on.group && ' + HH Lớp nhóm'}</p>
          <div className="ps-eyebrow">Các khoản khấu trừ áp dụng (không tính giảm trừ)</div>
          <ul>
            <li className={on.insurance ? '' : 'is-off'}>
              <b>Bảo hiểm NLĐ ({pct(s.insuranceRate)} = {fmtMoney(insTotal)}):</b> {parts.map((p) => `${pct(p.rate)} ${p.key} (${fmtMoney(p.amount)})`).join(' + ')} trên mức đóng {fmtMoney(base)}.
              {!on.insurance && ' Không áp dụng cho PT Parttime (0 ₫).'}
            </li>
            <li className={on.fixedTax || on.flatTax ? '' : 'is-off'}>
              <b>Thuế TNCN:</b>{' '}
              {all ? `nhân viên chính thức dùng số cố định (mặc định ${fmtMoney(s.fixedTax)}); PT Parttime khấu trừ ${pct(s.partTimeTaxRate)} × GROSS.` : on.flatTax ? `khấu trừ ${pct(s.partTimeTaxRate)} × GROSS mỗi kỳ.` : `dùng số cố định (mặc định ${fmtMoney(s.fixedTax)}, không tính giảm trừ).`}
            </li>
            <li><b>Phạt đi trễ, vi phạm:</b> trừ trực tiếp (nếu có).</li>
          </ul>
          <div className="ps-net">Kết quả cuối cùng: <b>THỰC NHẬN (NET) = GROSS − KHẤU TRỪ</b></div>
          <Button variant="primary" onClick={onSimulate}>Tính thử lương ngay</Button>
        </section>
      </Panel>

      <div className="ps-tables-head">
        <h3>Bảng tỷ lệ hoa hồng và bảo hiểm</h3>
        <Button small onClick={() => setAll(!allOpen)}>{allOpen ? 'Thu gọn tất cả' : 'Mở tất cả'}</Button>
      </div>

      <Accordion id="ps-b1" title={`Bảng 1: HH Bán Gói Member (${s.memberTiers.length} bậc)`} open={open[1]} onToggle={toggle(1)}>
        <div className="table-wrap"><table className="table"><thead><tr><th>Mốc doanh số tháng</th><th className="num">Tỷ lệ lũy tiến</th></tr></thead>
          <tbody>{s.memberTiers.map((t, i) => <tr key={i}><td>{progressiveLabel(s.memberTiers, i)}</td><td className="num">{pct(t.rate)}</td></tr>)}</tbody></table></div>
        <p className="hint-muted">Tính lũy tiến từng bậc, áp dụng chung cho cả 3 nhóm (PT Fulltime, PT Parttime, Marketing).</p>
      </Accordion>

      <Accordion id="ps-b2" title="Bảng 2: HH Gói PT và Dạy PT 1-1" open={open[2]} onToggle={toggle(2)}>
        <div className="table-wrap"><table className="table"><thead><tr><th>Doanh số PT</th><th className="num">Tổng</th><th className="num">{imm} Liền</th><th className="num">{ses} Tập</th></tr></thead>
          <tbody>{s.ptTiers.map((t, i) => { const sp = ptSplit(t.rate, s.ptImmediateShare, s.ptSessionShare); return <tr key={i}><td>{bandLabel(s.ptTiers, i)}</td><td className="num">{pct(t.rate)}</td><td className="num">{pct(sp.immediate)}</td><td className="num">{pct(sp.session)}</td></tr> })}</tbody></table></div>
        <ul className="ps-notes">
          <li><b>{imm} nhận liền:</b> trả ngay trong tháng ký hợp đồng.</li>
          <li><b>Đơn giá 1 buổi dạy:</b> (Tổng quỹ HH gói PT × {ses}) ÷ Tổng số buổi gói.</li>
        </ul>
      </Accordion>

      {on.group && (
        <Accordion id="ps-b3" title="Bảng 3: HH Lớp Nhóm (chỉ PT)" open={open[3]} onToggle={toggle(3)}>
          <p className="ps-eyebrow">Đơn giá cố định - PT Fulltime và PT Parttime</p>
          <p><b className="ps-big">{fmtMoney(s.classRate)}</b> / 1 buổi dạy nhóm</p>
          <p className="hint-muted">Không áp dụng khoản hoa hồng này cho bộ phận Marketing.</p>
        </Accordion>
      )}

      {on.marketing && (
        <Accordion id="ps-b4" title="Bảng 4: HH Doanh Số Member (MKT)" open={open[4]} onToggle={toggle(4)}>
          <div className="table-wrap"><table className="table"><thead><tr><th>Mốc doanh số tháng</th><th className="num">Tỷ lệ lũy tiến</th></tr></thead>
            <tbody>{s.marketingTiers.map((t, i) => <tr key={i}><td>{bandLabel(s.marketingTiers, i)}</td><td className="num">{pct(t.rate)}</td></tr>)}</tbody></table></div>
          <p className="hint-muted">Dành riêng cho bộ phận Marketing (Trần Trí Tâm), tính lũy tiến từng bậc.</p>
        </Accordion>
      )}

      <Accordion id="ps-b5" title="Bảng 5: Chi tiết bảo hiểm và thuế TNCN theo vị trí" open={open[5]} onToggle={toggle(5)}>
        <p>Mức lương đóng BH chuẩn: <b>{fmtMoney(base)}</b> / tháng. Nguyên tắc chung: không tính giảm trừ gia cảnh, bản thân.</p>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Khoản trích đóng (NLĐ)</th>{parts.map((p) => <th key={p.key} className="num">{p.key}</th>)}<th className="num">Tổng khấu trừ / tháng</th></tr></thead>
          <tbody>
            {officialRow && <tr><td>NV chính thức ({pct(s.insuranceRate)})<div className="cell-sub">Trang, Khánh, Tâm</div></td>{parts.map((p) => <td key={p.key} className="num">{pct(p.rate)}<div className="cell-sub">{fmtMoney(p.amount)}</div></td>)}<td className="num"><b>{fmtMoney(insTotal)}</b></td></tr>}
            {showRow('pt_parttime') && <tr><td>PT Parttime (0%)<div className="cell-sub">Nguyễn Phú Thịnh</div></td><td className="num">0%</td><td className="num">0%</td><td className="num">0%</td><td className="num"><b>0 ₫</b> (không đóng BH)</td></tr>}
          </tbody></table></div>
        <div className="ps-grid">
          {officialRow && <div className="ps-branch"><h5>Nhân viên chính thức (Trang, Khánh, Tâm)</h5><p><b>Bảo hiểm NLĐ:</b> trích cố định {fmtMoney(insTotal)} / tháng vào lương.</p><p><b>Thuế TNCN:</b> dùng số cố định (mặc định {fmtMoney(s.fixedTax)}, không tính giảm trừ).</p></div>}
          {showRow('pt_parttime') && <div className="ps-branch"><h5>PT Parttime (Nguyễn Phú Thịnh)</h5><p><b>Bảo hiểm NLĐ:</b> không tham gia đóng bảo hiểm (0 ₫).</p><p><b>Thuế TNCN:</b> khấu trừ {pct(s.partTimeTaxRate)} × Tổng lương (GROSS) mỗi kỳ.</p></div>}
        </div>
      </Accordion>
      <p className="hint-muted ps-foot">Giá trị lấy trực tiếp từ Cài đặt lương, sửa ở đó sẽ cập nhật tại đây.</p>
    </div>
  )
}

const num = (d: string) => Number(d) || 0

export function PayrollSimulator({ position, onPosition }: { position: SimPosition; onPosition: (p: SimPosition) => void }) {
  const { settings: s, error, reload } = usePayrollSettings()
  const [v, setV] = useState({ base: '5500000', member: '', gym: '', pt: '', total: '', taught: '', classes: '', penalty: '' })
  const set = (k: keyof typeof v) => (d: string) => setV((x) => ({ ...x, [k]: d }))
  const a = appliesTo(position)
  const input: SimInput = { position, baseSalary: num(v.base), memberSales: num(v.member), gymMemberTotal: num(v.gym), ptSales: num(v.pt), ptTotalSessions: num(v.total), ptSessionsTaught: a.ptSession ? num(v.taught) : 0, groupClasses: a.groupClass ? num(v.classes) : 0, penalty: num(v.penalty) }
  const r = useMemo(() => (s ? computeSim(input, s) : null), [s, v, position]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!s || !r) return <Loading error={error} onRetry={reload} />

  const line = (label: string, value: number, sub?: string, show = true) => show && (
    <>
      <dt>{label}{sub && <div className="cell-sub">{sub}</div>}</dt>
      <dd className="num">{fmtMoney(value)}</dd>
    </>
  )
  const money = (id: string, label: string, k: keyof typeof v, hint?: string) => (
    <Field label={label} htmlFor={id} hint={hint}><MoneyInput id={id} value={v[k]} onValueChange={set(k)} placeholder="0 ₫" /></Field>
  )
  const count = (id: string, label: string, k: keyof typeof v) => (
    <Field label={label} htmlFor={id}><Input id={id} inputMode="numeric" value={v[k]} onChange={(e) => set(k)(e.target.value.replace(/\D/g, ''))} placeholder="0" /></Field>
  )

  return (
    <div className="ps">
      <header className="ps-brand">
        <div>
          <h2>Tính thử lương</h2>
          <p>Nhập số liệu giả định, kết quả tính ngay theo bảng tỷ lệ hiện hành. Không lưu vào bảng lương.</p>
        </div>
        <Segmented<SimPosition> ariaLabel="Vị trí tính thử" options={SIM_POSITIONS.map((p) => ({ value: p, label: POSITION_LABEL[p] }))} value={position} onChange={onPosition} />
      </header>

      <div className="ps-sim">
        <Panel title="Số liệu trong tháng">
          <div className="form-grid">
            {money('sim-base', 'Lương cơ bản trọn gói', 'base')}
            {money('sim-member', 'Doanh số bán gói Member của nhân viên', 'member')}
            {a.marketingTiers && money('sim-gym', 'Tổng doanh số Member cả phòng tập', 'gym', 'Dùng cho HH doanh số Member (MKT)')}
            {money('sim-pt', 'Doanh số gói PT trong tháng', 'pt', a.ptSession ? undefined : 'Marketing chỉ nhận phần nhận liền')}
            {a.ptSession && count('sim-total', 'Tổng số buổi của gói PT', 'total')}
            {a.ptSession && count('sim-taught', 'Số buổi PT 1-1 đã dạy', 'taught')}
            {a.groupClass && count('sim-classes', 'Số buổi lớp nhóm', 'classes')}
            {money('sim-pen', 'Phạt đi trễ, vi phạm', 'penalty')}
          </div>
        </Panel>

        <Panel title="Kết quả">
          <div aria-live="polite">
            <dl className="kv ps-result">
              {line('Lương cơ bản', r.base)}
              {line('HH bán gói Member', r.memberCommission)}
              {line('HH doanh số Member (MKT)', r.marketingCommission, undefined, a.marketingTiers)}
              {line(`HH gói PT nhận liền (${pct(s.ptImmediateShare * 100)})`, r.ptImmediate, r.ptRate ? `Quỹ ${fmtMoney(r.ptFund)} (bậc ${pct(r.ptRate)})` : undefined)}
              {line(`HH dạy PT 1-1 (${pct(s.ptSessionShare * 100)})`, r.ptSessionPay, r.ptSessionUnit ? `${fmtMoney(r.ptSessionUnit)} / buổi` : undefined, a.ptSession)}
              {line('HH lớp nhóm', r.groupPay, `${fmtMoney(s.classRate)} / buổi`, a.groupClass)}
            </dl>
            <div className="ps-total"><span>Tổng thu nhập (GROSS)</span><b>{fmtMoney(r.gross)}</b></div>
            <dl className="kv ps-result">
              {line(`Bảo hiểm NLĐ (${pct(s.insuranceRate)})`, r.insurance, a.insurance ? `Trên mức đóng ${fmtMoney(s.insuranceBase ?? r.base)}` : 'PT Parttime không đóng bảo hiểm')}
              {line('Thuế TNCN', r.tax, a.flatTax ? `${pct(s.partTimeTaxRate)} × GROSS` : 'Số cố định, không giảm trừ')}
              {line('Phạt', r.penalty)}
            </dl>
            <div className="ps-total ps-total-net"><span>THỰC NHẬN (NET)</span><b>{fmtMoney(r.net)}</b></div>
          </div>
        </Panel>
      </div>
    </div>
  )
}
