import { Link } from 'react-router-dom'
import Icon from './Icon'
import { company, navLinks, services } from '../data/content'

export default function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="relative overflow-hidden bg-forest-950 text-forest-100">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 lg:grid-cols-4 lg:px-8">
        <div>
          <div className="flex items-center gap-2.5">
            <img src={company.logo} alt={company.name} className="h-10 w-10 rounded-full object-cover" />
            <span className="font-display text-xl font-semibold text-white">{company.name}</span>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-forest-300">{company.tagline} — {company.subTagline}.</p>
          <p className="mt-4 text-sm text-forest-400">A second-generation family business rooted in agriculture, serving Bangalore since {company.founded}.</p>
        </div>

        <div>
          <h4 className="font-display text-base font-semibold text-white">Explore</h4>
          <ul className="mt-4 space-y-2 text-sm">
            {navLinks.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="text-forest-300 transition hover:text-gold-300">{l.label}</Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="font-display text-base font-semibold text-white">Services</h4>
          <ul className="mt-4 space-y-2 text-sm">
            {services.slice(0, 6).map((s) => (
              <li key={s.slug}>
                <Link to={`/services/${s.slug}`} className="text-forest-300 transition hover:text-gold-300">{s.name}</Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="font-display text-base font-semibold text-white">Get in Touch</h4>
          <ul className="mt-4 space-y-3 text-sm text-forest-300">
            <li className="flex items-start gap-2">
              <Icon name="MapPin" size={18} className="mt-0.5 shrink-0 text-gold-300" />
              {company.headOffice}
            </li>
            <li className="flex items-center gap-2">
              <Icon name="Phone" size={18} className="shrink-0 text-gold-300" />
              <a href={`tel:${company.phoneHref}`} className="hover:text-gold-300">{company.phone}</a>
            </li>
            <li className="flex items-center gap-2">
              <Icon name="Mail" size={18} className="shrink-0 text-gold-300" />
              <a href={`mailto:${company.email}`} className="hover:text-gold-300">{company.email}</a>
            </li>
            <li className="flex items-center gap-2">
              <Icon name="ShoppingBag" size={18} className="shrink-0 text-gold-300" />
              <a href={company.storeUrl} target="_blank" rel="noreferrer" className="hover:text-gold-300">Shop online at {company.storeLabel}</a>
            </li>
          </ul>
          <a href={company.storeUrl} target="_blank" rel="noreferrer" className="mt-5 inline-block rounded-lg bg-white/95 p-2.5">
            <img src={company.storeLogo} alt="My Star Gardens store" className="h-8 w-auto" />
          </a>
        </div>
      </div>

      <div className="border-t border-forest-800/80">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-5 py-6 text-xs text-forest-400 sm:flex-row lg:px-8">
          <p>© {year} Star Gardens. All Rights Reserved.</p>
          <Link to="/privacy-policy" className="hover:text-gold-300">Privacy Policy</Link>
        </div>
      </div>
    </footer>
  )
}
