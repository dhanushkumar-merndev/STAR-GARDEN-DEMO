import Icon from '../components/Icon'
import PageHero from '../components/PageHero'
import Reveal from '../components/Reveal'
import ServiceCard from '../components/ServiceCard'
import CTASection from '../components/CTASection'
import useSEO from '../hooks/useSEO'
import { services, maintenance, media } from '../data/content'

export default function Services() {
  useSEO({
    title: 'Our Services — Landscape Design, Vertical Gardens & Plants on Hire | Star Gardens',
    description:
      'Turnkey landscape design, vertical gardens, terrace & balcony gardens, kitchen gardens, plants on hire and office plant maintenance across Bangalore & Karnataka.',
    image: media.servicesBanner,
  })

  return (
    <>
      <PageHero
        eyebrow="Our Services"
        title="Turnkey landscaping, plants on hire & garden maintenance"
        subtitle="We offer our services on a turnkey basis and take entire responsibility of soft landscaping and hard-scape gardening — from a single office plant to a 32-acre resort."
        image={media.servicesBanner}
      />

      <section className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s, i) => (
            <ServiceCard key={s.slug} service={s} index={i} />
          ))}
        </div>
      </section>

      <section className="bg-forest-50/60 py-20">
        <div className="mx-auto max-w-5xl px-5 lg:px-8">
          <Reveal className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-gold-600">Beyond Installation</span>
            <h2 className="mt-3 font-display text-3xl font-semibold text-forest-900">Maintenance &amp; Consulting</h2>
          </Reveal>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[maintenance.indoor, maintenance.outdoor].map((m) => (
              <Reveal key={m.title} className="rounded-2xl border border-forest-100 bg-white p-7 shadow-sm">
                <h3 className="font-display text-lg font-semibold text-forest-900">{m.title}</h3>
                {m.detail && <p className="mt-1 text-sm text-forest-500">{m.detail}</p>}
                <ul className="mt-4 space-y-2">
                  {m.items.map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm text-forest-600">
                      <Icon name="CheckCircle2" size={16} className="shrink-0 text-forest-500" /> {item}
                    </li>
                  ))}
                </ul>
              </Reveal>
            ))}
            <Reveal delay={0.1} className="rounded-2xl border border-forest-100 bg-white p-7 shadow-sm">
              <h3 className="font-display text-lg font-semibold text-forest-900">{maintenance.consulting.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-forest-600">{maintenance.consulting.detail}</p>
            </Reveal>
          </div>
        </div>
      </section>

      <CTASection />
    </>
  )
}
