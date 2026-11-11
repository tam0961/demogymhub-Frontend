import { useSyncExternalStore } from 'react'

let lastOk = true
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

export function reportApi(ok: boolean) {
  if (lastOk !== ok) {
    lastOk = ok
    emit()
  }
}
const subscribe = (f: () => void) => {
  subs.add(f)
  window.addEventListener('online', f)
  window.addEventListener('offline', f)
  return () => {
    subs.delete(f)
    window.removeEventListener('online', f)
    window.removeEventListener('offline', f)
  }
}
export const isConnected = () => navigator.onLine && lastOk

export function useConnected() {
  return useSyncExternalStore(subscribe, isConnected, () => true)
}
