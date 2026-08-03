import { useEffect, useState } from 'react'
import { NavLink, Link, useLocation } from 'react-router-dom'
import Icon from './Icon'
import { company, navLinks } from '../data/content'

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const location = useLocation()

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
    <header
      className={`sticky top-0 z-50 transition-[background-color,box-shadow,backdrop-filter] duration-300 ${
        scrolled || open ? 'bg-cream/85 shadow-sm shadow-forest-950/5 backdrop-blur-md' : 'bg-transparent'
      }`}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3.5 lg:px-8">
        {/* The logo is a wordmark — it already reads "Star Gardens", so no text beside it. */}
        <Link to="/" className="shrink-0" aria-label={`${company.name} — home`}>
          <img
            src={company.logo}
            alt={company.name}
            width={400}
            height={91}
            className="h-9 w-auto transition-transform duration-300 hover:scale-[1.03] sm:h-11"
          />
        </Link>

        <div className="hidden items-center gap-0.5 lg:flex">
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) =>
                `relative rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'text-forest-950' : 'text-forest-700 hover:text-forest-950'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className="relative z-10">{link.label}</span>
                  <span
                    className={`absolute inset-x-3 bottom-1 h-0.5 origin-left rounded-full bg-gold-400 transition-transform duration-300 ${
                      isActive ? 'scale-x-100' : 'scale-x-0'
                    }`}
                  />
                </>
              )}
            </NavLink>
          ))}
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          <a
            href={`https://wa.me/${company.whatsappHref}`}
            target="_blank"
            rel="noreferrer"
            className="grid h-10 w-10 place-items-center rounded-full border border-forest-200 text-forest-700 transition-colors duration-300 hover:border-gold-400 hover:text-gold-600"
            aria-label="Chat with Star Gardens on WhatsApp"
          >
            <Icon name="WhatsApp" size={18} />
          </a>
          <a
            href={`tel:${company.phoneHref}`}
            className="group inline-flex items-center gap-2 rounded-full bg-forest-900 px-5 py-2.5 text-sm font-semibold text-cream shadow-sm transition-transform duration-300 hover:-translate-y-0.5"
          >
            <Icon
              name="Phone"
              size={15}
              strokeWidth={2}
              className="text-forest-200 transition-colors duration-300 group-hover:text-gold-300"
            />
            {company.phone}
          </a>
        </div>

        <button
          onClick={() => setOpen((v) => !v)}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-forest-200 text-forest-800 transition-colors duration-300 hover:border-gold-400 hover:text-gold-600 lg:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="mobile-nav"
        >
          <Icon name={open ? 'X' : 'Menu'} size={20} />
        </button>
      </nav>

      {/* 0fr→1fr grid rows animate to the content's natural height with no measuring. */}
      <div
        id="mobile-nav"
        className={`grid overflow-hidden border-forest-100 bg-cream/95 backdrop-blur-md transition-[grid-template-rows,opacity] duration-300 ease-out lg:hidden ${
          open ? 'grid-rows-[1fr] border-t opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="flex min-h-0 flex-col gap-1 overflow-hidden px-5 py-4">
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) =>
                `rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                  isActive ? 'bg-forest-900 text-cream' : 'text-forest-800 hover:bg-forest-100'
                }`
              }
            >
              {link.label}
            </NavLink>
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
        </div>
      </div>
    </header>
  )
}
