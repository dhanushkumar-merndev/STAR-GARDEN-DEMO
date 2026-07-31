import { useEffect, useState } from 'react'
import { NavLink, Link, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Icon from './Icon'
import { company, navLinks } from '../data/content'

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => setOpen(false), [location.pathname])

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-cream/90 backdrop-blur-md shadow-sm' : 'bg-transparent'
      }`}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
        <Link to="/" className="flex items-center gap-2.5 group">
          <img
            src={company.logo}
            alt={company.name}
            className="h-10 w-10 rounded-full object-cover transition-transform group-hover:rotate-6"
          />
          <span className="font-display text-xl font-semibold tracking-tight text-forest-900">
            {company.name}
          </span>
        </Link>

        <div className="hidden items-center gap-1 lg:flex">
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) =>
                `rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-forest-800 text-white'
                    : 'text-forest-800 hover:bg-forest-100'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </div>

        <div className="hidden lg:block">
          <a
            href={`tel:${company.phoneHref}`}
            className="inline-flex items-center gap-2 rounded-full bg-gold-400 px-5 py-2.5 text-sm font-semibold text-forest-950 shadow-sm shadow-gold-400/40 transition hover:bg-gold-300"
          >
            <Icon name="Phone" size={16} strokeWidth={2} />
            {company.phone}
          </a>
        </div>

        <button
          onClick={() => setOpen((v) => !v)}
          className="grid h-10 w-10 place-items-center rounded-full border border-forest-200 text-forest-800 lg:hidden"
          aria-label="Toggle menu"
        >
          <Icon name={open ? 'X' : 'Menu'} size={20} />
        </button>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-forest-100 bg-cream lg:hidden"
          >
            <div className="flex flex-col gap-1 px-5 py-4">
              {navLinks.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.to === '/'}
                  className={({ isActive }) =>
                    `rounded-xl px-4 py-3 text-sm font-medium ${
                      isActive ? 'bg-forest-800 text-white' : 'text-forest-800 hover:bg-forest-100'
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              ))}
              <a
                href={`tel:${company.phoneHref}`}
                className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-gold-400 px-5 py-3 text-sm font-semibold text-forest-950"
              >
                <Icon name="Phone" size={16} /> Call {company.phone}
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
