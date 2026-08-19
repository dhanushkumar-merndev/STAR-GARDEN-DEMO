import { Link } from 'react-router-dom'
import Icon from './Icon'
import Reveal from './Reveal'
import { LeafSprig } from './Leaves'
import { company } from '../data/content'

export default function CTASection({
  title = "Let's design your green space",
  body = `Free site visit, honest guidance, and a team that has been planting, building and maintaining gardens across Bangalore since ${company.founded}.`,
}) {
  return (
    <section className="relative isolate overflow-hidden bg-forest-900 py-16 sm:py-20 lg:py-28">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_0%,rgba(234,191,81,0.2),transparent_55%)]" />
      <LeafSprig className="pointer-events-none absolute -left-8 bottom-0 -z-10 h-40 w-40 rotate-12 text-forest-800/60" />
      <LeafSprig className="pointer-events-none absolute -right-6 top-2 -z-10 h-32 w-32 -rotate-45 text-forest-800/50" />

      <Reveal className="relative mx-auto max-w-3xl px-5 text-center">
        <h2 className="text-balance font-display text-3xl font-semibold text-white sm:text-4xl">
          {title}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-pretty leading-relaxed text-forest-200">{body}</p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href={`tel:${company.phoneHref}`}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gold-400 px-7 py-3.5 text-sm font-semibold text-forest-950 shadow-lg shadow-gold-500/20 transition hover:-translate-y-0.5 hover:bg-gold-300 sm:w-auto"
          >
            <Icon name="Phone" size={17} /> Call {company.phone}
          </a>
          <a
            href={`https://wa.me/${company.whatsappHref}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#25D366] px-7 py-3.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:brightness-105 sm:w-auto"
          >
            <Icon name="WhatsApp" size={18} /> WhatsApp
          </a>
          <Link
            to="/contact"
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/25 px-7 py-3.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/10 sm:w-auto"
          >
            Free Consultation <Icon name="ArrowUpRight" size={16} />
          </Link>
        </div>
      </Reveal>
    </section>
  )
}
