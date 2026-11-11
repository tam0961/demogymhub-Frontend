import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

interface T { id: number; text: string; error?: boolean }
const ToastContext = createContext<(text: string, error?: boolean) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<T[]>([])
  const push = useCallback((text: string, error?: boolean) => {
    const id = Date.now() + Math.random()
    setItems((x) => [...x, { id, text, error }])
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3500)
  }, [])
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((i) => (
          <div key={i.id} className={`toast ${i.error ? 'toast-error' : ''}`}>{i.text}</div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
