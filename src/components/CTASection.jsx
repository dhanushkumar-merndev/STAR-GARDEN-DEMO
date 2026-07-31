import { Link } from 'react-router-dom'
import Icon from './Icon'
import Reveal from './Reveal'
import { company } from '../data/content'

export default function CTASection() {
  return (
    <section className="relative overflow-hidden bg-forest-900 py-20">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(234,191,81,0.18),transparent_55%)]" />
      <Reveal className="relative mx-auto max-w-3xl px-5 text-center">
        <h2 className="font-display text-3xl font-semibold text-white sm:text-4xl">
          Let&apos;s design your green space
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-forest-200">
          Free site visit, honest guidance, and a team that has been planting, building and maintaining
          gardens across Bangalore since {company.founded}.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a
            href={`tel:${company.phoneHref}`}
            className="inline-flex items-center gap-2 rounded-full bg-gold-400 px-7 py-3.5 text-sm font-semibold text-forest-950 shadow-lg shadow-gold-400/20 transition hover:bg-gold-300"
          >
            <Icon name="Phone" size={18} /> Call {company.phone}
          </a>
          <Link
            to="/contact"
            className="inline-flex items-center gap-2 rounded-full border border-white/30 px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Book a Free Consultation <Icon name="ArrowUpRight" size={16} />
          </Link>
        </div>
      </Reveal>
    </section>
  )
}
