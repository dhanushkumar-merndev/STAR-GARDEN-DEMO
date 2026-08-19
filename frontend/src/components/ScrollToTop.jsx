import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { scrollToTop } from '../hooks/useSmoothScroll'

export default function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    // Immediate, not eased — a route change should land at the top instantly.
    scrollToTop({ immediate: true })
  }, [pathname])

  return null
}
