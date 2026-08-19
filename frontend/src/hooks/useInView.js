import { useEffect, useRef, useState } from 'react'

// Tiny IntersectionObserver hook. Replaces react-intersection-observer and, paired
// with CSS transitions in Reveal, removes the need for a JS animation runtime.
export default function useInView({ threshold = 0.15, rootMargin = '0px 0px -12% 0px', once = true } = {}) {
  const ref = useRef(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // Server-side/older browsers: show content rather than hide it forever.
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          if (once) io.disconnect()
        } else if (!once) {
          setInView(false)
        }
      },
      { threshold, rootMargin }
    )

    io.observe(el)
    return () => io.disconnect()
  }, [threshold, rootMargin, once])

  return [ref, inView]
}
