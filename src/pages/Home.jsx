import { Link } from 'react-router-dom'
import Icon from '../components/Icon'
import Reveal from '../components/Reveal'
import Section from '../components/Section'
import SectionHeading from '../components/SectionHeading'
import StatCounter from '../components/StatCounter'
import ServiceCard from '../components/ServiceCard'
import BlogCard from '../components/BlogCard'
import CTASection from '../components/CTASection'
import { LeafBlob, LeafSprig } from '../components/Leaves'
import useSEO from '../hooks/useSEO'
import {
  company,
  homeStatsShort,
  services,
  process,
  whyChooseUs,
  clientNames,
  plants,
  finishedProjects,
  currentMaintenance,
  media,
  organizationJsonLd,
} from '../data/content'
import { posts } from '../data/blog'

// One 2x2 hero tile plus eight 1x1s — exactly fills a 2-col grid on mobile and a
// 4-col grid from sm up, so the block never ends on a ragged row.
const showcase = [
  {
    src: '/images/service-landscape-design.webp',
    label: 'Resort landscape',
    place: 'Mysore',
    span: 'col-span-2 row-span-2',
  },
  { src: '/images/service-terrace-garden.webp', label: 'Terrace garden', place: 'Sarjapur' },
  { src: '/images/service-vertical-garden.webp', label: 'Vertical garden', place: 'Koramangala' },
  { src: '/images/service-balcony-garden.webp', label: 'Balcony garden', place: 'Bellandur' },
  { src: '/images/service-kitchen-garden.webp', label: 'Kitchen garden', place: 'Rajajinagar' },
  { src: '/images/service-green-roofs.webp', label: 'Green roof', place: 'Bengaluru' },
  { src: '/images/service-office-plants.webp', label: 'Office plants', place: 'Corporate campus' },
  { src: '/images/service-indoor-plants.webp', label: 'Indoor planters', place: 'Bengaluru' },
  { src: '/images/service-plants-on-hire.webp', label: 'Plants on hire', place: 'Corporate office' },
]

const trustPoints = [
  'Free site visit',
  'Own production nursery',
  'Free plant replacement',
  'Turnkey execution',
]

export default function Home() {
  useSEO({
    title: 'Star Gardens | Landscape Design & Plants on Hire — Bangalore',
    description:
      'Bringing nature into your space — for a happier & healthier life. Landscape design, vertical gardens, terrace & balcony gardens and plants on hire across Bangalore & Karnataka since 2009.',
    image: company.ogImage,
    path: '/',
    jsonLd: organizationJsonLd,
  })

  return (
    <>
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden">
        <img
          src={media.homeHero}
          alt=""
          aria-hidden="true"
          fetchPriority="high"
          className="absolute inset-0 -z-20 h-full w-full object-cover"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-forest-950/95 via-forest-900/88 to-forest-950/95" />
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_20%,rgba(234,191,81,0.18),transparent_45%),radial-gradient(circle_at_85%_75%,rgba(151,186,156,0.2),transparent_45%)]" />
        <LeafBlob className="pointer-events-none absolute -left-24 -top-24 -z-10 h-96 w-96 text-forest-700/25 animate-float-slow" />
        <LeafBlob className="pointer-events-none absolute -right-32 top-1/3 -z-10 h-[28rem] w-[28rem] text-gold-500/10 animate-float" />
        <LeafSprig className="pointer-events-none absolute right-[8%] top-16 -z-10 hidden h-20 w-20 text-gold-300/35 animate-float sm:block" />
        <LeafSprig className="pointer-events-none absolute bottom-40 left-[10%] -z-10 hidden h-24 w-24 rotate-[30deg] text-forest-300/25 animate-float-slow sm:block" />

        <div className="mx-auto flex max-w-4xl flex-col items-center px-5 pb-36 pt-20 text-center sm:px-6 sm:pb-40 sm:pt-28 lg:px-8">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-gold-300 ring-1 ring-inset ring-white/15 backdrop-blur sm:text-[11px]">
            <Icon name="Sparkles" size={13} /> Family business · Since {company.founded}
          </span>

          <h1 className="mt-7 text-balance font-display text-[2.05rem] font-semibold leading-[1.1] text-white sm:text-5xl lg:text-[3.75rem]">
            {company.tagline}
            <span className="mt-1.5 block text-gold-300">{company.subTagline}</span>
          </h1>

          <p className="mt-6 max-w-xl text-pretty text-[15px] leading-relaxed text-forest-200 sm:text-lg">
            From landscape design and vertical gardens to plants on hire for corporate offices — Star
            Gardens has been greening Bangalore &amp; Andhra Pradesh with turnkey design, delivery and
            maintenance.
          </p>

          <div className="mt-9 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
            <Link
              to="/contact"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gold-400 px-7 py-3.5 text-sm font-semibold text-forest-950 shadow-lg shadow-gold-500/25 transition hover:-translate-y-0.5 hover:bg-gold-300 sm:w-auto"
            >
              <Icon name="Sprout" size={17} /> Get a Free Site Visit
            </Link>
            <a
              href={`tel:${company.phoneHref}`}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/25 px-7 py-3.5 text-sm font-semibold text-white backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/10 sm:w-auto"
            >
              <Icon name="Phone" size={16} /> {company.phone}
            </a>
          </div>

          <ul className="mt-10 grid grid-cols-2 gap-x-5 gap-y-2.5 text-xs text-forest-300 sm:flex sm:flex-wrap sm:justify-center sm:gap-x-7">
            {trustPoints.map((item) => (
              <li key={item} className="flex items-center gap-1.5">
                <Icon name="Check" size={13} className="shrink-0 text-gold-300" /> {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Stat strip straddling the hero's bottom edge */}
      <div className="relative z-10 mx-auto -mt-24 max-w-6xl px-5 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 rounded-3xl bg-cream/95 p-7 shadow-2xl shadow-forest-950/25 ring-1 ring-black/5 backdrop-blur sm:grid-cols-4 sm:gap-6 sm:p-9">
          {homeStatsShort.map((s) => (
            <StatCounter key={s.label} {...s} />
          ))}
        </div>
      </div>

      {/* ── ABOUT TEASER ─────────────────────────────────────────────────── */}
      <Section>
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-600">
              Our Story
            </span>
            <h2 className="mt-3 text-balance font-display text-[1.75rem] font-semibold leading-[1.15] text-forest-900 sm:text-4xl">
              Rooted in agriculture. Grown into Karnataka &amp; Andhra Pradesh&apos;s green backbone.
            </h2>
            <p className="mt-5 text-pretty leading-relaxed text-forest-600">
              {company.intro} What began as a natural extension of family farming grew into Star Gardens,
              formally established in {company.founded} — now running its own nursery, importing specialty
              plants, and maintaining some of Bangalore&apos;s largest landscapes.
            </p>

            <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-6 border-t border-forest-100 pt-7">
              {finishedProjects.slice(0, 4).map((p) => (
                <div key={p.name + p.place}>
                  <dt className="font-display text-[15px] font-semibold leading-snug text-forest-900">
                    {p.name}
                  </dt>
                  <dd className="mt-1 text-xs text-forest-500">{p.place}</dd>
                  <dd className="mt-1.5 text-sm font-semibold text-gold-600">{p.area}</dd>
                </div>
              ))}
            </dl>

            <Link
              to="/about"
              className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-forest-800 transition hover:text-gold-600"
            >
              Read our full story <Icon name="ArrowUpRight" size={16} />
            </Link>
          </Reveal>

          <Reveal delay={120} className="relative">
            <div className="overflow-hidden rounded-[1.75rem] shadow-2xl shadow-forest-950/15">
              <img
                src={media.aboutBanner}
                alt="A Star Gardens landscape project in Bengaluru"
                loading="lazy"
                decoding="async"
                width={1200}
                height={1200}
                className="aspect-[4/5] w-full object-cover"
              />
            </div>
            <div className="absolute -bottom-5 -left-4 hidden w-48 rounded-2xl bg-forest-900 p-5 text-cream shadow-xl lg:block">
              <p className="font-display text-3xl font-semibold text-gold-300">27 lakh</p>
              <p className="mt-1 text-xs leading-relaxed text-forest-200">
                sq. ft. landscaped since {company.founded}
              </p>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* ── SERVICES ─────────────────────────────────────────────────────── */}
      <Section tone="muted">
        <SectionHeading
          eyebrow="What We Do"
          title="End-to-end green solutions, on a turnkey basis"
          body="We take entire responsibility for soft landscaping and hard-scape gardening — design, delivery and ongoing maintenance, all from one team."
        />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:mt-16 lg:grid-cols-4">
          {services.map((s, i) => (
            <ServiceCard key={s.slug} service={s} index={i} />
          ))}
        </div>
      </Section>

      {/* ── PROJECT SHOWCASE ─────────────────────────────────────────────── */}
      <Section>
        <SectionHeading
          eyebrow="Recent Work"
          title="Spaces we've planted, built and kept green"
        />
        <div className="mt-12 grid auto-rows-[160px] grid-cols-2 gap-3 sm:auto-rows-[200px] sm:grid-cols-4 sm:gap-4 lg:mt-16">
          {showcase.map((item, i) => (
            <Reveal
              key={item.src}
              delay={(i % 4) * 80}
              className={`group relative overflow-hidden rounded-2xl ${item.span || ''}`}
            >
              <img
                src={item.src}
                alt={`${item.label} — ${item.place}`}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition-transform duration-500 will-change-transform group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-forest-950/80 via-forest-950/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
                <p className="font-display text-[13px] font-semibold leading-tight text-white sm:text-base">
                  {item.label}
                </p>
                <p className="mt-0.5 text-[11px] text-forest-200 sm:text-xs">{item.place}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ── PANORAMA BAND ────────────────────────────────────────────────── */}
      {/* gallery-1 is a 1800x433 panorama — shown near its own ratio, not cropped square. */}
      <section className="relative isolate overflow-hidden">
        <img
          src={media.homePanorama}
          alt="Landscaped courtyard gardens at a Star Gardens villa township project"
          loading="lazy"
          decoding="async"
          width={1800}
          height={433}
          className="h-[180px] w-full object-cover sm:h-auto"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-forest-950/55 via-transparent to-transparent" />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-7xl px-5 pb-4 sm:px-6 sm:pb-6 lg:px-8">
          <p className="font-display text-sm font-semibold text-white drop-shadow sm:text-xl">
            Casa Grande Luxus — 110 villas, three parks, 12 acres
          </p>
        </div>
      </section>

      {/* ── PROCESS ──────────────────────────────────────────────────────── */}
      <Section tone="muted">
        <SectionHeading eyebrow="How It Works" title="Three steps to a greener space" />
        <div className="relative mt-20 grid gap-y-16 md:mt-24 md:grid-cols-3 md:gap-8">
          <div className="absolute inset-x-0 top-8 hidden h-px bg-gradient-to-r from-transparent via-forest-200 to-transparent md:block" />
          {process.map((p, i) => (
            <Reveal
              key={p.step}
              delay={i * 120}
              className="relative rounded-3xl border border-forest-100 bg-white px-6 pb-8 pt-0 text-center shadow-sm sm:px-7"
            >
              <span className="mx-auto -mt-8 mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-forest-900 font-display text-xl font-semibold text-gold-300 shadow-lg shadow-forest-950/20">
                {p.step}
              </span>
              <h3 className="font-display text-lg font-semibold text-forest-900">{p.title}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-forest-600">{p.detail}</p>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ── WHY CHOOSE US ────────────────────────────────────────────────── */}
      <Section tone="dark" className="relative isolate overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_80%_10%,rgba(234,191,81,0.14),transparent_50%)]" />
        <SectionHeading
          eyebrow="Why Star Gardens"
          title="What sets our maintenance apart"
          dark
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:mt-16 lg:grid-cols-3 lg:gap-5">
          {whyChooseUs.map((w, i) => (
            <Reveal
              key={w.title}
              delay={(i % 3) * 100}
              className="rounded-2xl border border-white/10 bg-white/[0.06] p-6 backdrop-blur transition-colors hover:border-gold-400/30 hover:bg-white/10"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-gold-400 text-forest-950">
                <Icon name={w.icon} size={20} />
              </span>
              <h3 className="mt-4 font-display text-lg font-semibold text-white">{w.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-forest-300">{w.detail}</p>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ── CLIENTS ──────────────────────────────────────────────────────── */}
      <Section tone="white" size="compact" className="overflow-hidden border-b border-forest-100">
        <SectionHeading
          eyebrow="Trusted By"
          title="Corporate parks, hospitality & townships across South India"
        />
      </Section>

      {/* Duplicated track so the -50% translate loops seamlessly. */}
      <div className="border-b border-forest-100 bg-white pb-12">
        <div className="relative flex overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]">
          <div className="flex shrink-0 animate-marquee items-center gap-10 pr-10 sm:gap-14 sm:pr-14">
            {[...clientNames, ...clientNames].map((c, i) => (
              <span
                key={c + i}
                className="whitespace-nowrap font-display text-lg font-semibold text-forest-300 sm:text-2xl"
              >
                {c}
              </span>
            ))}
          </div>
        </div>

        <div className="mx-auto mt-12 max-w-6xl px-5 sm:px-6 lg:px-8">
          <Reveal>
            <img
              src={media.clientsCollage}
              alt="Logos of Star Gardens' corporate clients"
              loading="lazy"
              decoding="async"
              width={1600}
              height={900}
              className="w-full rounded-2xl border border-forest-100"
            />
          </Reveal>
          <Reveal delay={100} className="mt-8 text-center">
            <Link
              to="/clients"
              className="inline-flex items-center gap-2 rounded-full bg-forest-900 px-6 py-3 text-sm font-semibold text-cream transition hover:bg-forest-800"
            >
              See all clients &amp; projects <Icon name="ArrowUpRight" size={16} />
            </Link>
          </Reveal>
        </div>
      </div>

      {/* ── MAINTENANCE SNAPSHOT ─────────────────────────────────────────── */}
      <Section>
        <SectionHeading eyebrow="Under Our Care" title="Landscapes we maintain every week" />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:mt-16 lg:grid-cols-3">
          {currentMaintenance.slice(0, 6).map((m, i) => (
            <Reveal
              key={m.name}
              delay={(i % 3) * 90}
              className="flex items-start gap-4 rounded-2xl border border-forest-100 bg-white p-5 shadow-sm"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-forest-50 text-forest-700">
                <Icon name="Trees" size={18} />
              </span>
              <div className="min-w-0">
                <p className="font-display text-[15px] font-semibold leading-snug text-forest-900">
                  {m.name}
                </p>
                <p className="mt-0.5 text-xs text-forest-500">{m.place}</p>
                <p className="mt-1.5 text-sm font-semibold text-gold-600">{m.area}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ── PLANTS TEASER ────────────────────────────────────────────────── */}
      <Section tone="muted">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <SectionHeading
            align="left"
            eyebrow="Our Nursery"
            title="A catalogue grown for Bangalore's climate"
            className="sm:max-w-lg"
          />
          <Reveal delay={100} className="shrink-0">
            <Link
              to="/plants"
              className="inline-flex items-center gap-2 rounded-full bg-forest-900 px-6 py-3 text-sm font-semibold text-cream transition hover:bg-forest-800"
            >
              All {plants.length} plants <Icon name="ArrowUpRight" size={16} />
            </Link>
          </Reveal>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {plants.slice(0, 4).map((p, i) => (
            <Reveal
              key={p.name}
              delay={(i % 4) * 80}
              className="rounded-2xl border border-forest-100 bg-white p-5 shadow-sm"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-forest-50 text-forest-700">
                <Icon name="Leaf" size={18} />
              </span>
              <p className="mt-4 font-display text-[15px] font-semibold text-forest-900">{p.name}</p>
              <p className="mt-0.5 text-xs italic text-forest-400">{p.sci}</p>
              <p className="mt-2.5 line-clamp-3 text-sm leading-relaxed text-forest-600">{p.desc}</p>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ── BLOG TEASER ──────────────────────────────────────────────────── */}
      <Section>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <SectionHeading
            align="left"
            eyebrow="From the Blog"
            title="Guides for growing greener spaces"
            className="sm:max-w-lg"
          />
          <Reveal delay={100} className="shrink-0">
            <Link
              to="/blog"
              className="inline-flex items-center gap-2 rounded-full bg-forest-900 px-6 py-3 text-sm font-semibold text-cream transition hover:bg-forest-800"
            >
              All articles <Icon name="ArrowUpRight" size={16} />
            </Link>
          </Reveal>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {posts.slice(0, 3).map((p, i) => (
            <BlogCard key={p.slug} post={p} index={i} />
          ))}
        </div>
      </Section>

      <CTASection />
    </>
  )
}
