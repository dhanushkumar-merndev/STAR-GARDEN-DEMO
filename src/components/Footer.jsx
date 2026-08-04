import { Link } from 'react-router-dom'
import Icon from './Icon'
import { company, navLinks, services } from '../data/content'

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="relative overflow-hidden bg-forest-950 text-forest-100">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-500/40 to-transparent" />

      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:grid-cols-2 lg:grid-cols-4 lg:px-8">
        <div className="sm:col-span-2 lg:col-span-1">
          {/* Shown in its real colours — inverting it flattened the emblem into a
              solid white disc. */}
          <Link
            to="/"
            aria-label={`${company.name} — home`}
            className="inline-flex transition-transform duration-300 hover:-translate-y-0.5"
          >
            <img
              src={company.logo}
              alt={company.name}
              width={400}
              height={91}
              loading="lazy"
              className="h-11 w-auto"
            />
          </Link>
          <p className="mt-5 text-sm leading-relaxed text-forest-300">
            {company.tagline} — {company.subTagline}.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-forest-400">
            A second-generation family business rooted in agriculture, serving Bangalore since{' '}
            {company.founded}.
          </p>

          <Link
            to="/contact"
            className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2.5 text-xs font-semibold text-forest-200 transition hover:border-gold-400/50 hover:text-gold-300"
          >
            <Icon name="Sprout" size={15} />
            Book a free site visit
          </Link>
        </div>

        <nav aria-label="Footer">
          <h2 className="font-display text-base font-semibold text-white">Explore</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            {navLinks.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="text-forest-300 transition hover:text-gold-300">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Services">
          <h2 className="font-display text-base font-semibold text-white">Services</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            {services.slice(0, 6).map((s) => (
              <li key={s.slug}>
                <Link
                  to={`/services/${s.slug}`}
                  className="text-forest-300 transition hover:text-gold-300"
                >
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h2 className="font-display text-base font-semibold text-white">Get in Touch</h2>
          <ul className="mt-4 space-y-3 text-sm text-forest-300">
            <li className="flex items-start gap-2.5">
              <Icon name="MapPin" size={17} className="mt-0.5 shrink-0 text-gold-300" />
              <address className="not-italic leading-relaxed">{company.headOffice}</address>
            </li>
            <li className="flex items-center gap-2.5">
              <Icon name="Phone" size={17} className="shrink-0 text-gold-300" />
              <a href={`tel:${company.phoneHref}`} className="transition hover:text-gold-300">
                {company.phone}
              </a>
            </li>
            <li className="flex items-center gap-2.5">
              <Icon name="Mail" size={17} className="shrink-0 text-gold-300" />
              <a href={`mailto:${company.email}`} className="break-all transition hover:text-gold-300">
                {company.email}
              </a>
            </li>
            <li className="flex items-center gap-2.5">
              <Icon name="WhatsApp" size={17} className="shrink-0 text-gold-300" />
              <a
                href={`https://wa.me/${company.whatsappHref}`}
                target="_blank"
                rel="noreferrer"
                className="transition hover:text-gold-300"
              >
                Chat on WhatsApp
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-forest-800/80">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-5 py-6 text-xs text-forest-400 sm:flex-row lg:px-8">
          <p>© {year} {company.name}. All Rights Reserved.</p>
          <Link to="/privacy-policy" className="transition hover:text-gold-300">
            Privacy Policy
          </Link>
        </div>
      </div>
    </footer>
  )
}
