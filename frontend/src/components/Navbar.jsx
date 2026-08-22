import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import Icon from './Icon'
import { company, navLinks } from '../data/content'

/**
 * The most specific nav link matching `path`, or null. Plain NavLink matching
 * would light up both "Services" and "Landscape Designers" on
 * /services/landscape-design, since the parent prefix also matches — only the
 * longest match wins here, so "Services" still highlights on its other children.
 */
function activeNavPath(path) {
  return (
    navLinks
      .map((l) => l.to)
      .filter((to) => (to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`)))
      .sort((a, b) => b.length - a.length)[0] ?? null
  )
}

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const active = useMemo(() => activeNavPath(location.pathname), [location.pathname])

  useEffect(() => {
    // passive: this listener must never block scrolling, especially under Lenis.
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => setOpen(false), [location.pathname])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    // The bar keeps its cream background at every scroll position. Every page opens
    // on a near-black hero, and a transparent bar rendered the dark-green logo and
    // the forest-toned links invisible against it.
    <header
      className={`sticky top-0 z-50 border-b bg-cream/90 backdrop-blur-md transition-[box-shadow,border-color] duration-300 ${
        scrolled || open ? 'border-forest-100 shadow-sm shadow-forest-950/5' : 'border-transparent'
      }`}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-2 lg:px-8">
        {/* The logo is a wordmark — it already reads "Star Gardens", so no text beside it. */}
        <Link to="/" className="shrink-0" aria-label={`${company.name} — home`}>
          <img
            src={company.logo}
            alt={company.name}
            width={400}
            height={91}
            className="h-8 w-auto transition-transform duration-300 hover:scale-[1.03] sm:h-9"
          />
        </Link>

        <div className="hidden items-center gap-0.5 lg:flex">
          {navLinks.map((link) => {
            const isActive = active === link.to
            return (
              <Link
                key={link.to}
                to={link.to}
                aria-current={isActive ? 'page' : undefined}
                className={`relative rounded-full px-3 py-1.5 text-[0.8125rem] font-medium transition-colors ${
                  isActive ? 'text-forest-950' : 'text-forest-700 hover:text-forest-950'
                }`}
              >
                <span className="relative z-10">{link.label}</span>
                <span
                  className={`absolute inset-x-3 bottom-0.5 h-0.5 origin-left rounded-full bg-gold-400 transition-transform duration-300 ${
                    isActive ? 'scale-x-100' : 'scale-x-0'
                  }`}
                />
              </Link>
            )
          })}
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          <a
            href={`https://wa.me/${company.whatsappHref}`}
            target="_blank"
            rel="noreferrer"
            className="grid h-9 w-9 place-items-center rounded-full border border-forest-200 text-forest-700 transition-colors duration-300 hover:border-gold-400 hover:text-gold-600"
            aria-label="Chat with Star Gardens on WhatsApp"
          >
            <Icon name="WhatsApp" size={17} />
          </a>
          {/* The number itself only fits alongside eight links from xl up; below that
              the button stays an icon and the floating dock carries the full CTA. */}
          <a
            href={`tel:${company.phoneHref}`}
            aria-label={`Call ${company.phone}`}
            className="group inline-flex h-9 items-center gap-2 rounded-full bg-forest-900 px-2.5 text-[0.8125rem] font-semibold text-cream shadow-sm transition-transform duration-300 hover:-translate-y-0.5 xl:px-4"
          >
            <Icon
              name="Phone"
              size={15}
              strokeWidth={2}
              className="text-forest-200 transition-colors duration-300 group-hover:text-gold-300"
            />
            <span className="hidden xl:inline">{company.phone}</span>
          </a>
          {/* Staff sign-in — routes off-site to the CRM's own deployment, not a page
              on this app. Rightmost and understated (outline, no fill) since it's
              not a customer-facing CTA. */}
          <a
            href={`${company.crmUrl}/login`}
            className="hidden items-center gap-1.5 rounded-full border border-forest-200 px-3 py-1.5 text-[0.8125rem] font-medium text-forest-700 transition-colors duration-300 hover:border-gold-400 hover:text-gold-600 xl:inline-flex"
          >
            <Icon name="User" size={15} />
            Login
          </a>
        </div>

        <button
          onClick={() => setOpen((v) => !v)}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-forest-200 text-forest-800 transition-colors duration-300 hover:border-gold-400 hover:text-gold-600 lg:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="mobile-nav"
        >
          <Icon name={open ? 'X' : 'Menu'} size={19} />
        </button>
      </nav>

      {/* 0fr→1fr grid rows animate to the content's natural height with no measuring.
          Absolute, anchored under the bar: the header is sticky, so it stays in flow —
          an in-flow panel would grow the header and shove the whole page down as it
          opens. Out of flow it drapes over the hero and the bar keeps its 53px. */}
      <div
        id="mobile-nav"
        className={`absolute inset-x-0 top-full grid max-h-[calc(100svh_-_100%)] overflow-hidden border-forest-100 bg-cream/95 backdrop-blur-md transition-[grid-template-rows,opacity] duration-300 ease-out lg:hidden ${
          open ? 'grid-rows-[1fr] border-t opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        {/* The collapsing row must carry no padding of its own: under border-box its
            height can never fall below its own padding, so a py-* here would leave a
            permanent band of cream under the bar. Padding lives on the inner div.
            data-lenis-prevent keeps Lenis from stealing the wheel/touch scroll here and
            panning the page instead, on the short viewports where this actually scrolls. */}
        <div className="min-h-0 overflow-y-auto overscroll-contain" data-lenis-prevent>
          <div className="flex flex-col gap-1 px-5 py-4">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                aria-current={active === link.to ? 'page' : undefined}
                className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                  active === link.to
                    ? 'bg-forest-900 text-cream'
                    : 'text-forest-800 hover:bg-forest-100'
                }`}
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <a
                href={`tel:${company.phoneHref}`}
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-forest-900 px-4 py-3 text-sm font-semibold text-cream"
              >
                <Icon
                  name="Phone"
                  size={15}
                  className="text-forest-200 transition-colors duration-300 group-hover:text-gold-300"
                />
                Call
              </a>
              <a
                href={`https://wa.me/${company.whatsappHref}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-gold-400 px-4 py-3 text-sm font-semibold text-forest-950"
              >
                <Icon name="WhatsApp" size={16} /> WhatsApp
              </a>
            </div>
            <a
              href={`${company.crmUrl}/login`}
              className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-xl border border-forest-200 px-4 py-2.5 text-sm font-medium text-forest-700"
            >
              <Icon name="User" size={15} />
              Login
            </a>
          </div>
        </div>
      </div>
    </header>
  )
}
