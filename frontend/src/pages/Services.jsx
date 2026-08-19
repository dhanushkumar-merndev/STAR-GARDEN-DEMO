import Icon from '../components/Icon'
import PageHero from '../components/PageHero'
import Reveal from '../components/Reveal'
import Section from '../components/Section'
import SectionHeading from '../components/SectionHeading'
import ServiceCard from '../components/ServiceCard'
import CTASection from '../components/CTASection'
import useSEO from '../hooks/useSEO'
import { services, maintenance, media, breadcrumbJsonLd } from '../data/content'

export default function Services() {
  useSEO({
    title: 'Our Services — Landscape Design, Vertical Gardens & Plants on Hire | Star Gardens',
    description:
      'Turnkey landscape design, vertical gardens, terrace & balcony gardens, kitchen gardens, plants on hire and office plant maintenance across Bangalore & Karnataka.',
    image: media.servicesBanner,
    path: '/services',
    jsonLd: breadcrumbJsonLd([
      { name: 'Home', path: '/' },
      { name: 'Services', path: '/services' },
    ]),
  })

  return (
    <>
      <PageHero
        eyebrow="Our Services"
        title="Turnkey landscaping, plants on hire & garden maintenance"
        subtitle="We offer our services on a turnkey basis and take entire responsibility of soft landscaping and hard-scape gardening — from a single office plant to a 32-acre resort."
        image={media.servicesBanner}
        crumbs={[{ label: 'Home', to: '/' }, { label: 'Services' }]}
      />

      <Section>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s, i) => (
            <ServiceCard key={s.slug} service={s} index={i} />
          ))}
        </div>
      </Section>

      <Section tone="muted" width="wide">
        <SectionHeading
          eyebrow="Beyond Installation"
          title="Maintenance & Consulting"
          body="Monthly, yearly or fully tailored contracts — with unhealthy plants replaced at no extra cost for as long as the contract runs."
        />

        <div className="mt-12 grid gap-5 md:grid-cols-3 lg:mt-16">
          {[maintenance.indoor, maintenance.outdoor].map((m, i) => (
            <Reveal
              key={m.title}
              delay={i * 100}
              className="rounded-2xl border border-forest-100 bg-white p-6 shadow-sm sm:p-7"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-forest-50 text-forest-700">
                <Icon name={i === 0 ? 'Sprout' : 'Trees'} size={20} />
              </span>
              <h3 className="mt-4 font-display text-lg font-semibold text-forest-900">{m.title}</h3>
              {m.detail && <p className="mt-1.5 text-sm text-forest-500">{m.detail}</p>}
              <ul className="mt-4 space-y-2">
                {m.items.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-forest-600">
                    <Icon name="CircleCheck" size={15} className="mt-0.5 shrink-0 text-forest-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </Reveal>
          ))}
          <Reveal
            delay={200}
            className="rounded-2xl border border-forest-100 bg-white p-6 shadow-sm sm:p-7"
          >
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-forest-50 text-forest-700">
              <Icon name="ClipboardCheck" size={20} />
            </span>
            <h3 className="mt-4 font-display text-lg font-semibold text-forest-900">
              {maintenance.consulting.title}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-forest-600">
              {maintenance.consulting.detail}
            </p>
          </Reveal>
        </div>
      </Section>

      <CTASection />
    </>
  )
}
