import { useEffect, useRef } from 'react'

const SCRIPT_ID = 'cloudflare-turnstile-script'
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile)

  return new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID)
    if (existing) {
      existing.addEventListener('load', () => resolve(window.turnstile), { once: true })
      existing.addEventListener('error', reject, { once: true })
      return
    }

    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.src = SCRIPT_URL
    script.async = true
    script.defer = true
    script.onload = () => resolve(window.turnstile)
    script.onerror = reject
    document.head.appendChild(script)
  })
}

export default function TurnstileWidget({ siteKey, onVerify, onError, resetKey = 0 }) {
  const containerRef = useRef(null)
  const widgetRef = useRef(null)

  useEffect(() => {
    if (!siteKey || !containerRef.current) return undefined

    let cancelled = false

    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !turnstile || !containerRef.current) return
        widgetRef.current = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action: 'website_enquiry',
          theme: 'light',
          callback: onVerify,
          'expired-callback': () => onVerify(''),
          'error-callback': () => {
            onVerify('')
            onError?.()
          },
        })
      })
      .catch(() => onError?.())

    return () => {
      cancelled = true
      if (window.turnstile && widgetRef.current !== null) {
        window.turnstile.remove(widgetRef.current)
      }
      widgetRef.current = null
    }
  }, [siteKey, onVerify, onError, resetKey])

  if (!siteKey) return null
  return <div ref={containerRef} className="min-h-[65px]" aria-label="Human verification" />
}
