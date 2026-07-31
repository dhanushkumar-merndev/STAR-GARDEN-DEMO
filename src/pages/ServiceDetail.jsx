import { Link, Navigate, useParams } from 'react-router-dom'
import Icon from '../components/Icon'
import PageHero from '../components/PageHero'
import Reveal from '../components/Reveal'
import CTASection from '../components/CTASection'
import ServiceCard from '../components/ServiceCard'
import useSEO from '../hooks/useSEO'
import { services } from '../data/content'

export default function ServiceDetail() {
  const { slug } = useParams()
  const service = services.find((s) => s.slug === slug)

  useSEO(
    service
      ? {
          title: `${service.name} — Star Gardens | Bangalore`,
          description: service.short,
          image: service.image,
        }
      : { title: 'Service not found — Star Gardens' }
  )

  if (!service) return <Navigate to="/services" replace />

  const related = services.filter((s) => s.slug !== slug).slice(0, 3)

  return (
    <>
      <PageHero eyebrow="Our Services" title={service.name} subtitle={service.short} image={service.image} />

      <section className="mx-auto max-w-5xl px-5 py-20 lg:px-8">
        <Reveal>
          <p className="text-lg leading-relaxed text-forest-700">{service.description}</p>
        </Reveal>

        {service.features && (
          <Reveal delay={0.1} className="mt-10 grid gap-4 sm:grid-cols-2">
            {service.features.map((f) => (
              <div key={f} className="flex items-start gap-3 rounded-2xl border border-forest-100 bg-forest-50/60 p-4">
                <Icon name="CheckCircle2" size={20} className="mt-0.5 shrink-0 text-forest-600" />
                <p className="text-sm leading-relaxed text-forest-700">{f}</p>
              </div>
            ))}
          </Reveal>
        )}

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {service.benefits && (
            <Reveal className="rounded-2xl border border-forest-100 bg-white p-7 shadow-sm">
              <h3 className="font-display text-lg font-semibold text-forest-900">Benefits</h3>
              <ul className="mt-4 space-y-2">
                {service.benefits.map((b) => (
                  <li key={b} className="flex items-center gap-2 text-sm text-forest-600">
                    <Icon name="Sparkles" size={16} className="shrink-0 text-gold-500" /> {b}
                  </li>
                ))}
              </ul>
            </Reveal>
          )}

          {service.audience && (
            <Reveal delay={0.05} className="rounded-2xl border border-forest-100 bg-white p-7 shadow-sm">
              <h3 className="font-display text-lg font-semibold text-forest-900">Who It&apos;s For</h3>
              <ul className="mt-4 flex flex-wrap gap-2">
                {service.audience.map((a) => (
                  <li key={a} className="rounded-full bg-forest-100 px-3 py-1.5 text-xs font-medium text-forest-700">
                    {a}
                  </li>
                ))}
              </ul>
            </Reveal>
          )}

          {service.useCases && (
            <Reveal className="rounded-2xl border border-forest-100 bg-white p-7 shadow-sm">
              <h3 className="font-display text-lg font-semibold text-forest-900">Popular Use Cases</h3>
              <ul className="mt-4 flex flex-wrap gap-2">
                {service.useCases.map((u) => (
                  <li key={u} className="rounded-full bg-forest-100 px-3 py-1.5 text-xs font-medium text-forest-700">
                    {u}
                  </li>
                ))}
              </ul>
            </Reveal>
          )}

          {service.clients && (
            <Reveal delay={0.05} className="rounded-2xl border border-forest-100 bg-white p-7 shadow-sm">
              <h3 className="font-display text-lg font-semibold text-forest-900">Trusted By</h3>
              {service.experience && <p className="mt-1 text-sm text-gold-600 font-medium">{service.experience}</p>}
              <ul className="mt-4 flex flex-wrap gap-2">
                {service.clients.map((c) => (
                  <li key={c} className="rounded-full bg-forest-800 px-3 py-1.5 text-xs font-medium text-white">
                    {c}
                  </li>
                ))}
              </ul>
            </Reveal>
          )}

          {service.styles && (
            <Reveal className="rounded-2xl border border-forest-100 bg-white p-7 shadow-sm md:col-span-2">
              <h3 className="font-display text-lg font-semibold text-forest-900">Design Styles</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {service.styles.map((st) => (
                  <div key={st.name} className="rounded-xl bg-forest-50/60 p-4">
                    <p className="font-semibold text-forest-800">{st.name}</p>
                    <p className="mt-1 text-sm text-forest-600">{st.detail}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          )}
        </div>

        {service.portfolio && (
          <Reveal className="mt-12">
            <h3 className="font-display text-xl font-semibold text-forest-900">Featured Projects</h3>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {service.portfolio.map((p) => (
                <div key={p.name + p.place} className="rounded-2xl border border-forest-100 bg-forest-50/60 p-5">
                  <Icon name="MapPin" size={18} className="text-gold-600" />
                  <p className="mt-3 font-display font-semibold text-forest-900">{p.name}</p>
                  <p className="text-xs text-forest-500">{p.place}</p>
                  <p className="mt-2 text-sm text-forest-600">{p.detail}</p>
                </div>
              ))}
            </div>
          </Reveal>
        )}
      </section>

      <section className="bg-forest-50/60 py-20">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <Reveal className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-gold-600">Related Services</span>
            <h2 className="mt-3 font-display text-2xl font-semibold text-forest-900">You may also like</h2>
          </Reveal>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((s, i) => (
              <ServiceCard key={s.slug} service={s} index={i} />
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link to="/services" className="inline-flex items-center gap-2 font-semibold text-forest-800 hover:text-gold-600">
              View all services <Icon name="ArrowUpRight" size={16} />
            </Link>
          </div>
        </div>
      </section>

      <CTASection />
    </>
  )
}
