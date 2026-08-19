import { useEffect } from 'react'
import Lenis from 'lenis'

// Module-level handle so ScrollToTop and the back-to-top button can drive the same
// instance without threading context through every component.
let instance = null

export const getLenis = () => instance

/** Jump to the top. `immediate` skips the eased animation (used on route change). */
export function scrollToTop({ immediate = false } = {}) {
  if (instance) {
    instance.scrollTo(0, { immediate })
    return
  }
  window.scrollTo({ top: 0, behavior: immediate ? 'auto' : 'smooth' })
}

export default function useSmoothScroll() {
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    let lenis = null
    let rafId = null

    const start = () => {
      if (lenis) return
      lenis = new Lenis({
        duration: 1.05,
        // expo-out: quick take-off, long settle — reads as weight rather than lag.
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        touchMultiplier: 1.6,
      })
      instance = lenis

      const raf = (time) => {
        lenis.raf(time)
        rafId = requestAnimationFrame(raf)
      }
      rafId = requestAnimationFrame(raf)
    }

    const stop = () => {
      if (rafId) cancelAnimationFrame(rafId)
      rafId = null
      if (lenis) lenis.destroy()
      lenis = null
      instance = null
    }

    // Respect the OS setting, and react if the user flips it mid-session.
    if (!query.matches) start()
    const onChange = () => (query.matches ? stop() : start())
    query.addEventListener('change', onChange)

    return () => {
      query.removeEventListener('change', onChange)
      stop()
    }
  }, [])
}
