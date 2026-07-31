import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import Icon from '../components/Icon'
import Reveal from '../components/Reveal'
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
  media,
} from '../data/content'
import { posts } from '../data/blog'

export default function Home() {
  useSEO({
    title: 'Star Gardens | Landscape Design & Plants on Hire — Bangalore',
    description:
      'Bringing nature into your space — for a happier & healthier life. Landscape design, vertical gardens, terrace & balcony gardens and plants on hire across Bangalore & Karnataka since 2009.',
    image: company.ogImage,
  })

  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <img src={media.homeHero} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-forest-900/95 via-forest-800/90 to-forest-950/95" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(234,191,81,0.16),transparent_45%),radial-gradient(circle_at_85%_75%,rgba(151,186,156,0.22),transparent_45%)]" />
        <LeafBlob className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 text-forest-700/30 animate-float-slow" />
        <LeafBlob className="pointer-events-none absolute -right-32 top-1/3 h-[28rem] w-[28rem] text-gold-500/10 animate-float" />
        <LeafSprig className="pointer-events-none absolute right-[8%] top-16 h-20 w-20 text-gold-300/40 animate-float" />
        <LeafSprig className="pointer-events-none absolute left-[10%] bottom-24 h-24 w-24 rotate-[30deg] text-forest-300/30 animate-float-slow" />

        <div className="relative mx-auto flex max-w-7xl flex-col items-center px-5 pb-28 pt-20 text-center lg:pt-28">
          <motion.span
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-gold-300 backdrop-blur"
          >
            <Icon name="Sparkles" size={14} /> Second-Generation Family Business · Since {company.founded}
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-6 max-w-4xl font-display text-4xl font-semibold leading-[1.08] text-white sm:text-6xl"
          >
            {company.tagline}
            <span className="mt-2 block text-gold-300">{company.subTagline}</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-6 max-w-2xl text-base leading-relaxed text-forest-200 sm:text-lg"
          >
            From landscape design and vertical gardens to plants on hire for corporate offices — Star Gardens
            has been greening Bangalore &amp; Andhra Pradesh with turnkey design, delivery and maintenance.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-9 flex flex-col items-center gap-4 sm:flex-row"
          >
            <a
              href={`tel:${company.phoneHref}`}
              className="inline-flex items-center gap-2 rounded-full bg-gold-400 px-7 py-3.5 text-sm font-semibold text-forest-950 shadow-lg shadow-gold-400/25 transition hover:-translate-y-0.5 hover:bg-gold-300"
            >
              <Icon name="Phone" size={18} /> Get a Free Consultation
            </a>
            <Link
              to="/services"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 px-7 py-3.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/10"
            >
              Explore Services <Icon name="ArrowUpRight" size={16} />
            </Link>
          </motion.div>
        </div>

        {/* stat strip overlapping hero bottom edge */}
        <div className="relative mx-auto -mb-16 max-w-6xl px-5">
          <div className="grid grid-cols-2 gap-6 rounded-3xl bg-white/95 p-8 shadow-2xl shadow-forest-950/20 ring-1 ring-black/5 backdrop-blur sm:grid-cols-4">
            {homeStatsShort.map((s) => (
              <StatCounter key={s.label} {...s} />
            ))}
          </div>
        </div>
      </section>

      {/* ABOUT TEASER */}
      <section className="mx-auto max-w-7xl px-5 pb-24 pt-32 lg:px-8">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          <Reveal>
            <span className="text-xs font-semibold uppercase tracking-widest text-gold-600">Our Story</span>
            <h2 className="mt-3 font-display text-3xl font-semibold text-forest-900 sm:text-4xl">
              Rooted in agriculture. Grown into Karnataka &amp; Andhra Pradesh&apos;s green backbone.
            </h2>
            <p className="mt-5 leading-relaxed text-forest-600">
              {company.intro} What began as a natural extension of family farming grew into Star Gardens,
              formally established in {company.founded} — now running its own nursery, importing specialty
              plants, and maintaining some of Bangalore&apos;s largest corporate and residential landscapes.
            </p>
            <Link
              to="/about"
              className="mt-6 inline-flex items-center gap-2 font-semibold text-forest-800 transition hover:text-gold-600"
            >
              Read our full story <Icon name="ArrowUpRight" size={16} />
            </Link>
          </Reveal>

          <Reveal delay={0.15} className="grid grid-cols-2 gap-4">
            {finishedProjects.slice(0, 4).map((p) => (
              <div key={p.name + p.place} className="rounded-2xl border border-forest-100 bg-forest-50/60 p-5">
                <Icon name="MapPin" size={18} className="text-gold-600" />
                <p className="mt-3 font-display text-base font-semibold text-forest-900">{p.name}</p>
                <p className="text-xs text-forest-500">{p.place}</p>
                <p className="mt-2 text-sm font-semibold text-forest-700">{p.area}</p>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* SERVICES */}
      <section className="bg-forest-50/60 py-24">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <Reveal className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-gold-600">What We Do</span>
            <h2 className="mt-3 font-display text-3xl font-semibold text-forest-900 sm:text-4xl">
              End-to-end green solutions, on a turnkey basis
            </h2>
            <p className="mt-4 text-forest-600">
              We take entire responsibility for soft landscaping and hard-scape gardening — design, delivery
              and ongoing maintenance, all from one team.
            </p>
          </Reveal>

          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {services.map((s, i) => (
              <ServiceCard key={s.slug} service={s} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* PROCESS */}
      <section className="mx-auto max-w-7xl px-5 py-24 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-semibold uppercase tracking-widest text-gold-600">How It Works</span>
          <h2 className="mt-3 font-display text-3xl font-semibold text-forest-900 sm:text-4xl">
            Three steps to a greener space
          </h2>
        </Reveal>

        <div className="relative mt-14 grid gap-8 md:grid-cols-3">
          <div className="absolute left-0 right-0 top-8 hidden h-px bg-forest-200 md:block" />
          {process.map((p, i) => (
            <Reveal key={p.step} delay={i * 0.12} className="relative rounded-3xl border border-forest-100 bg-white p-8 text-center shadow-sm">
              <span className="mx-auto -mt-14 mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-forest-800 font-display text-xl font-semibold text-gold-300 shadow-lg shadow-forest-900/20">
                {p.step}
              </span>
              <h3 className="font-display text-lg font-semibold text-forest-900">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-forest-600">{p.detail}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* WHY CHOOSE US */}
      <section className="bg-forest-900 py-24">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <Reveal className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-gold-300">Why Star Gardens</span>
            <h2 className="mt-3 font-display text-3xl font-semibold text-white sm:text-4xl">
              What sets our maintenance apart
            </h2>
          </Reveal>

          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {whyChooseUs.map((w, i) => (
              <Reveal key={w.title} delay={(i % 3) * 0.1} className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-gold-400 text-forest-950">
                  <Icon name={w.icon} size={20} />
                </span>
                <h3 className="mt-4 font-display text-lg font-semibold text-white">{w.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-forest-300">{w.detail}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CLIENTS MARQUEE */}
      <section className="overflow-hidden border-y border-forest-100 bg-white py-14">
        <Reveal className="mx-auto mb-8 max-w-2xl px-5 text-center">
          <span className="text-xs font-semibold uppercase tracking-widest text-gold-600">Trusted By</span>
          <h2 className="mt-2 font-display text-2xl font-semibold text-forest-900">
            Corporate parks, hospitality &amp; townships across South India
          </h2>
        </Reveal>
        <div className="relative flex overflow-hidden">
          <div className="flex shrink-0 animate-marquee items-center gap-14 pr-14">
            {[...clientNames, ...clientNames].map((c, i) => (
              <span key={c + i} className="whitespace-nowrap font-display text-2xl font-semibold text-forest-300">
                {c}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* PLANTS TEASER */}
      <section className="mx-auto max-w-7xl px-5 py-24 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <Reveal>
            <span className="text-xs font-semibold uppercase tracking-widest text-gold-600">Our Nursery</span>
            <h2 className="mt-3 font-display text-3xl font-semibold text-forest-900 sm:text-4xl">
              A catalogue grown for Bangalore&apos;s climate
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <Link
              to="/plants"
              className="inline-flex items-center gap-2 rounded-full bg-forest-800 px-6 py-3 text-sm font-semibold text-white transition hover:bg-forest-700"
            >
              Explore All {plants.length}+ Plants <Icon name="ArrowUpRight" size={16} />
            </Link>
          </Reveal>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {plants.slice(0, 4).map((p, i) => (
            <Reveal key={p.name} delay={i * 0.08} className="rounded-2xl border border-forest-100 bg-forest-50/60 p-5">
              <p className="font-display text-base font-semibold text-forest-900">{p.name}</p>
              <p className="text-xs italic text-forest-400">{p.sci}</p>
              <p className="mt-2 line-clamp-3 text-sm text-forest-600">{p.desc}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* BLOG TEASER */}
      <section className="bg-forest-50/60 py-24">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <Reveal>
              <span className="text-xs font-semibold uppercase tracking-widest text-gold-600">From the Blog</span>
              <h2 className="mt-3 font-display text-3xl font-semibold text-forest-900 sm:text-4xl">
                Guides for growing greener spaces
              </h2>
            </Reveal>
            <Reveal delay={0.1}>
              <Link
                to="/blog"
                className="inline-flex items-center gap-2 rounded-full bg-forest-800 px-6 py-3 text-sm font-semibold text-white transition hover:bg-forest-700"
              >
                Read All Articles <Icon name="ArrowUpRight" size={16} />
              </Link>
            </Reveal>
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.slice(0, 3).map((p, i) => (
              <BlogCard key={p.slug} post={p} index={i} />
            ))}
          </div>
        </div>
      </section>

      <CTASection />
    </>
  )
}
