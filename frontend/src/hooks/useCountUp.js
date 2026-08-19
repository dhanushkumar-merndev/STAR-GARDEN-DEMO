import { useEffect, useRef, useState } from 'react'

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3)

export default function useCountUp(target, { duration = 2000, start = false } = {}) {
  const [value, setValue] = useState(0)
  const frame = useRef(null)

  useEffect(() => {
    if (!start) return undefined

    // Counting up is decorative motion — skip straight to the figure if asked to.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target)
      return undefined
    }

    const startTime = performance.now()

    const tick = (now) => {
      const progress = Math.min((now - startTime) / duration, 1)
      setValue(Math.round(target * easeOutCubic(progress)))
      if (progress < 1) frame.current = requestAnimationFrame(tick)
    }

    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [start, target, duration])

  return value
}
