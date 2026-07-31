import { useEffect, useState } from 'react'
import Icon from './Icon'
import { company } from '../data/content'

export default function FloatingContact() {
  const [visible, setVisible] = useState(false)
  const [showTop, setShowTop] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 300)
      setShowTop(window.scrollY > 800)
    }
    onScroll()
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3">
      {showTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Back to top"
          className="grid h-11 w-11 place-items-center rounded-full bg-white text-forest-800 shadow-lg shadow-forest-900/20 ring-1 ring-forest-100 transition hover:-translate-y-0.5"
        >
          <Icon name="ArrowUp" size={18} />
        </button>
      )}
      <a
        href={`tel:${company.phoneHref}`}
        className={`grid h-14 w-14 place-items-center rounded-full bg-forest-800 text-gold-300 shadow-xl shadow-forest-900/30 transition-all hover:bg-forest-700 ${
          visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'
        }`}
        aria-label={`Call ${company.phone}`}
      >
        <Icon name="Phone" size={22} />
      </a>
    </div>
  )
}
