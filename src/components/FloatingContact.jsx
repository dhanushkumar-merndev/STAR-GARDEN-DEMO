import { useEffect, useState } from 'react'
import Icon from './Icon'
import { scrollToTop } from '../hooks/useSmoothScroll'
import { company } from '../data/content'

// One dark, consistent dock. Size lives here so the three buttons can't drift
// apart. Hover lifts the button and warms the glyph to gold — the background
// never changes colour, which is what reads as premium here.
const dock =
  'group pointer-events-auto grid h-12 w-12 place-items-center rounded-full bg-forest-900 shadow-xl shadow-forest-950/30 ring-1 ring-inset ring-white/10 transition-[transform,opacity,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-gold-500/20 sm:h-14 sm:w-14'

const glyph = 'text-forest-200 transition-colors duration-300 group-hover:text-gold-300'

export default function FloatingContact() {
  const [visible, setVisible] = useState(false)
  const [showTop, setShowTop] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      setVisible(y > 300)
      setShowTop(y > 800)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Hidden buttons must not stay clickable or focusable.
  const state = (shown, offset) =>
    shown ? 'translate-y-0 opacity-100' : `${offset} pointer-events-none opacity-0`

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      <button
        type="button"
        onClick={() => scrollToTop()}
        aria-label="Back to top"
        tabIndex={showTop ? 0 : -1}
        className={`${dock} ${state(showTop, 'translate-y-3')}`}
      >
        <Icon name="ArrowUp" size={20} className={glyph} />
      </button>

      <a
        href={`https://wa.me/${company.whatsappHref}`}
        target="_blank"
        rel="noreferrer"
        aria-label="Chat with Star Gardens on WhatsApp"
        tabIndex={visible ? 0 : -1}
        className={`${dock} ${state(visible, 'translate-y-4')}`}
      >
        {/* Filled brand glyph reads heavier than the stroked icons — sized down to match. */}
        <Icon name="WhatsApp" size={22} className={glyph} />
      </a>

      <a
        href={`tel:${company.phoneHref}`}
        aria-label={`Call ${company.phone}`}
        tabIndex={visible ? 0 : -1}
        className={`${dock} ${state(visible, 'translate-y-4')}`}
      >
        <Icon name="Phone" size={20} className={glyph} />
      </a>
    </div>
  )
}
