import { useEffect, useRef, type ReactNode } from 'react'
import { Icon } from './icons'

const stack: object[] = []

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: 'normal' | 'large'
}

export function Modal({ title, onClose, children, footer, size = 'normal' }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const token = useRef({}).current
  useEffect(() => {
    stack.push(token)
    return () => { stack.splice(stack.indexOf(token), 1) }
  }, [token])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && stack[stack.length - 1] === token && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, token])
  useEffect(() => {
    const el = ref.current
    if (el && !el.contains(document.activeElement)) el.focus()
  }, [])

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} className={`modal ${size === 'large' ? 'modal-lg' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Đóng">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}
