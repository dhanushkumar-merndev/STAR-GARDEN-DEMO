import Icon from '../components/Icon'
import PageHero from '../components/PageHero'
import Reveal from '../components/Reveal'
import Section from '../components/Section'
import SectionHeading from '../components/SectionHeading'
import StatCounter from '../components/StatCounter'
import CTASection from '../components/CTASection'
import useSEO from '../hooks/useSEO'
import { company, foundingStory, stats, maintenance, media, breadcrumbJsonLd } from '../data/content'

const timeline = [
  {
    year: '~20 yrs ago',
    title: 'Punganur, Andhra Pradesh',
    detail:
      'The first garden business begins on 30 acres of land, born from a family background in agriculture.',
  },
  {
    year: company.founded,
    title: 'Star Gardens Established',
    detail: 'The venture is formally established as Star Gardens, expanding into Bangalore.',
  },
  {
    year: '2014 – 2022',
    title: 'Rapid Growth',
    detail:
      'Over 27 lakh sq. ft. (63 acres) of green area developed, with a dedicated nursery and imports.',
  },
  {
    year: 'Today',
    title: 'A Karnataka & AP Leader',
    detail:
      'One of the largest landscaping & garden centres in the region, maintaining major corporate campuses.',
  },
]

export default function About() {
  useSEO({
    title: 'About Us — Star Gardens | A Second-Generation Landscaping Family Business',
    description:
      "Star Gardens' story — from a family agricultural background in Punganur, Andhra Pradesh, to one of Karnataka's largest landscaping and garden centres, established 2009.",
    image: media.aboutBanner,
    path: '/about',
    jsonLd: breadcrumbJsonLd([
      { name: 'Home', path: '/' },
      { name: 'About Us', path: '/about' },
    ]),
  })

  return (
    <>
      <PageHero
        eyebrow="About Us"
        title="A second-generation family business, grown from the soil up"
        subtitle={company.establishedNote}
        image={media.aboutBanner}
        crumbs={[{ label: 'Home', to: '/' }, { label: 'About Us' }]}
      />

      {/* ── STORY ────────────────────────────────────────────────────────── */}
      <Section>
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-7">
            <Reveal>
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-600">
                Our Story
              </span>
              <h2 className="mt-3 text-balance font-display text-[1.75rem] font-semibold leading-[1.15] text-forest-900 sm:text-4xl">
                Knowledge accrued over two decades in the field
              </h2>
            </Reveal>
            {foundingStory.map((p, i) => (
              <Reveal key={p.slice(0, 32)} delay={i * 70}>
                <p className="mt-5 text-pretty leading-relaxed text-forest-700">{p}</p>
              </Reveal>
            ))}
          </div>

          {/* Sticky so the short aside tracks the long story column instead of
              leaving a tall gap beneath itself. */}
          <Reveal delay={140} className="lg:col-span-5">
            <div className="lg:sticky lg:top-28">
              <div className="overflow-hidden rounded-[1.75rem] shadow-xl shadow-forest-950/10">
                <img
                  src="/images/service-plants-on-hire.webp"
                  alt="Plants supplied and maintained by Star Gardens"
                  loading="lazy"
                  decoding="async"
                  width={1200}
                  height={1200}
                  className="aspect-[4/3] w-full object-cover"
                />
              </div>
              <figure className="mt-5 rounded-2xl border border-forest-100 bg-forest-50/70 p-6">
                <Icon name="Quote" size={20} className="text-gold-500" />
                <blockquote className="mt-3 text-pretty font-display text-lg leading-relaxed text-forest-800">
                  {company.tagline} — {company.subTagline}.
                </blockquote>
                <figcaption className="mt-3 text-sm text-forest-500">
                  {company.contactPerson}, {company.name}
                </figcaption>
              </figure>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* ── TIMELINE ─────────────────────────────────────────────────────── */}
      <Section tone="muted" width="wide">
        <SectionHeading
          eyebrow="Our Journey"
          title="From Punganur to a Karnataka-wide operation"
        />
        <div className="relative mx-auto mt-12 max-w-2xl lg:mt-16">
          <span
            aria-hidden="true"
            className="absolute left-4 top-2 h-[calc(100%-1.5rem)] w-px bg-forest-200"
          />
          <ol className="space-y-9">
            {timeline.map((t, i) => (
              <Reveal
                as="li"
                key={t.title}
                delay={i * 100}
                className="relative flex flex-col gap-1.5 pl-12"
              >
                <span className="absolute left-2.5 top-1.5 h-3.5 w-3.5 rounded-full bg-gold-400 ring-4 ring-forest-50" />
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-600">
                  {t.year}
                </span>
                <h3 className="font-display text-lg font-semibold text-forest-900">{t.title}</h3>
                <p className="text-sm leading-relaxed text-forest-600">{t.detail}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </Section>

      {/* ── STATS ────────────────────────────────────────────────────────── */}
      <Section width="wide">
        <SectionHeading eyebrow="By The Numbers" title="Green area covered, 2014–2022" />
        <Reveal
          delay={100}
          className="mt-12 grid grid-cols-2 gap-x-6 gap-y-10 rounded-3xl border border-forest-100 bg-white p-8 shadow-sm sm:gap-8 lg:mt-16 lg:grid-cols-4 lg:p-12"
        >
          {stats.map((s) => (
            <StatCounter key={s.label} {...s} />
          ))}
        </Reveal>
      </Section>

      {/* ── MAINTENANCE ──────────────────────────────────────────────────── */}
      <Section tone="dark" width="wide" className="relative isolate overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_0%,rgba(234,191,81,0.14),transparent_50%)]" />
        <SectionHeading
          eyebrow="Maintenance Programs"
          title="Care that keeps every space consistently green"
          dark
        />
        <div className="mt-12 grid gap-5 lg:mt-16 lg:grid-cols-3">
          {[maintenance.indoor, maintenance.outdoor].map((m, i) => (
            <Reveal
              key={m.title}
              delay={i * 100}
              className="rounded-2xl border border-white/10 bg-white/[0.06] p-6 backdrop-blur sm:p-7"
            >
              <h3 className="font-display text-lg font-semibold text-white">{m.title}</h3>
              {m.detail && <p className="mt-1.5 text-sm text-forest-300">{m.detail}</p>}
              <ul className="mt-4 space-y-2">
                {m.items.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-forest-200">
                    <Icon name="CircleCheck" size={15} className="mt-0.5 shrink-0 text-gold-300" />
                    {item}
                  </li>
                ))}
              </ul>
            </Reveal>
          ))}
          <Reveal
            delay={200}
            className="rounded-2xl border border-white/10 bg-white/[0.06] p-6 backdrop-blur sm:p-7"
          >
            <h3 className="font-display text-lg font-semibold text-white">
              {maintenance.consulting.title}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-forest-200">
              {maintenance.consulting.detail}
            </p>
          </Reveal>
        </div>
      </Section>

      <CTASection />
    </>
  )
}
