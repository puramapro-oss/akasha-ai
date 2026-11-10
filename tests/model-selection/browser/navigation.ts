import { useSyncExternalStore } from 'react'

function subscribe(listener: () => void) {
  window.addEventListener('popstate', listener)
  return () => window.removeEventListener('popstate', listener)
}
export function useLocation() {
  return useSyncExternalStore(subscribe, () => window.location.pathname + window.location.search)
}
function navigate(url: string, replace: boolean) {
  if (replace) window.history.replaceState(null, '', url)
  else window.history.pushState(null, '', url)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
export function useRouter() {
  return { push: (url: string) => navigate(url, false), replace: (url: string) => navigate(url, true) }
}
export function useSearchParams() {
  const location = useLocation()
  return new URLSearchParams(location.split('?')[1] ?? '')
}
