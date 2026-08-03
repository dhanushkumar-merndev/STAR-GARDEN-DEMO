import { Link, Navigate, useParams } from 'react-router-dom'
import Icon from '../components/Icon'
import PageHero from '../components/PageHero'
import Reveal from '../components/Reveal'
import Section from '../components/Section'
import SectionHeading from '../components/SectionHeading'
import CTASection from '../components/CTASection'
import ServiceCard from '../components/ServiceCard'
import useSEO from '../hooks/useSEO'
import { company, services } from '../data/content'

function serviceJsonLd(service) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: service.name,
    description: service.description,
    url: `${company.siteUrl}/services/${service.slug}`,
    image: `${company.siteUrl}${service.image}`,
    serviceType: service.name,
    areaServed: { '@type': 'City', name: 'Bengaluru' },
    provider: {
      '@type': 'LandscapingBusiness',
      name: company.name,
      telephone: company.phone,
      url: company.siteUrl,
    },
  }
}

export default function ServiceDetail() {
  const { slug } = useParams()
  const service = services.find((s) => s.slug === slug)

  useSEO(
    service
      ? {
          title: `${service.name} in Bangalore — Star Gardens`,
          description: service.short,
          image: service.image,
          path: `/services/${service.slug}`,
          jsonLd: serviceJsonLd(service),
        }
      : { title: 'Service not found — Star Gardens' }
  )

  if (!service) return <Navigate to="/services" replace />

  const related = services.filter((s) => s.slug !== slug).slice(0, 3)

  return (
    <>
      <PageHero
        eyebrow="Our Services"
        title={service.name}
        subtitle={service.short}
        image={service.image}
        crumbs={[
          { label: 'Home', to: '/' },
          { label: 'Services', to: '/services' },
          { label: service.name },
        ]}
      />

      <Section width="medium">
        <Reveal>
          <p className="text-pretty text-lg leading-relaxed text-forest-700">{service.description}</p>
        </Reveal>

        {service.features && (
          <Reveal delay={100} className="mt-10 grid gap-4 sm:grid-cols-2">
            {service.features.map((f) => (
              <div
                key={f}
                className="flex items-start gap-3 rounded-2xl border border-forest-100 bg-forest-50/60 p-4"
              >
                <Icon name="CircleCheck" size={19} className="mt-0.5 shrink-0 text-forest-600" />
                <p className="text-sm leading-relaxed text-forest-700">{f}</p>
              </div>
            ))}
          </Reveal>
        )}

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {service.benefits && (
            <Reveal className="rounded-2xl border border-forest-100 bg-white p-7 shadow-sm">
              <h2 className="font-display text-lg font-semibold text-forest-900">Benefits</h2>
              <ul className="mt-4 space-y-2.5">
                {service.benefits.map((b) => (
                  <li key={b} className="flex items-start gap-2 text-sm leading-relaxed text-forest-600">
                    <Icon name="Sparkles" size={16} className="mt-0.5 shrink-0 text-gold-500" /> {b}
                  </li>
                ))}
              </ul>
            </Reveal>
          )}

          {service.audience && (
            <Reveal delay={80} className="rounded-2xl border border-forest-100 bg-white p-7 shadow-sm">
              <h2 className="font-display text-lg font-semibold text-forest-900">Who It&apos;s For</h2>
              <ul className="mt-4 flex flex-wrap gap-2">
                {service.audience.map((a) => (
                  <li
                    key={a}
                    className="rounded-full bg-forest-100 px-3 py-1.5 text-xs font-medium text-forest-700"
                  >
                    {a}
                  </li>
                ))}
              </ul>
            </Reveal>
          )}

          {service.useCases && (
            <Reveal className="rounded-2xl border border-forest-100 bg-white p-7 shadow-sm">
              <h2 className="font-display text-lg font-semibold text-forest-900">Popular Use Cases</h2>
              <ul className="mt-4 flex flex-wrap gap-2">
                {service.useCases.map((u) => (
                  <li
                    key={u}
                    className="rounded-full bg-forest-100 px-3 py-1.5 text-xs font-medium text-forest-700"
                  >
                    {u}
                  </li>
                ))}
              </ul>
            </Reveal>
          )}

          {service.clients && (
            <Reveal delay={80} className="rounded-2xl border border-forest-100 bg-white p-7 shadow-sm">
              <h2 className="font-display text-lg font-semibold text-forest-900">Trusted By</h2>
              {service.experience && (
                <p className="mt-1 text-sm font-medium text-gold-600">{service.experience}</p>
              )}
              <ul className="mt-4 flex flex-wrap gap-2">
                {service.clients.map((c) => (
                  <li
                    key={c}
                    className="rounded-full bg-forest-900 px-3 py-1.5 text-xs font-medium text-cream"
                  >
                    {c}
                  </li>
                ))}
              </ul>
            </Reveal>
          )}

          {service.styles && (
            <Reveal className="rounded-2xl border border-forest-100 bg-white p-7 shadow-sm md:col-span-2">
              <h2 className="font-display text-lg font-semibold text-forest-900">Design Styles</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {service.styles.map((st) => (
                  <div key={st.name} className="rounded-xl bg-forest-50/70 p-5">
                    <p className="font-display font-semibold text-forest-800">{st.name}</p>
                    <p className="mt-1 text-sm leading-relaxed text-forest-600">{st.detail}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          )}
        </div>

        {service.portfolio && (
          <div className="mt-14">
            <Reveal>
              <h2 className="font-display text-2xl font-semibold text-forest-900">Featured Projects</h2>
            </Reveal>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {service.portfolio.map((p, i) => (
                <Reveal
                  key={p.name + p.place}
                  delay={(i % 3) * 90}
                  className="rounded-2xl border border-forest-100 bg-forest-50/60 p-5"
                >
                  <Icon name="MapPin" size={18} className="text-gold-600" />
                  <p className="mt-3 font-display font-semibold text-forest-900">{p.name}</p>
                  <p className="text-xs text-forest-500">{p.place}</p>
                  <p className="mt-2 text-sm leading-relaxed text-forest-600">{p.detail}</p>
                </Reveal>
              ))}
            </div>
          </div>
        )}
      </Section>

      <Section tone="muted">
        <SectionHeading eyebrow="Related Services" title="You may also like" />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {related.map((s, i) => (
            <ServiceCard key={s.slug} service={s} index={i} />
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link
            to="/services"
            className="inline-flex items-center gap-2 text-sm font-semibold text-forest-800 transition hover:text-gold-600"
          >
            View all services <Icon name="ArrowUpRight" size={16} />
          </Link>
        </div>
      </Section>

      <CTASection />
    </>
  )
}
