import Icon from '../components/Icon'
import PageHero from '../components/PageHero'
import Reveal from '../components/Reveal'
import StatCounter from '../components/StatCounter'
import CTASection from '../components/CTASection'
import useSEO from '../hooks/useSEO'
import { company, foundingStory, stats, maintenance, media } from '../data/content'

const timeline = [
  { year: '~20 yrs ago', title: 'Punganur, Andhra Pradesh', detail: 'The first garden business begins on 30 acres of land, born from a family background in agriculture.' },
  { year: company.founded, title: 'Star Gardens Established', detail: 'The venture is formally established as Star Gardens, expanding into Bangalore.' },
  { year: '2014 – 2022', title: 'Rapid Growth', detail: 'Over 27 lakh sq. ft. (63 acres) of green area developed, with a dedicated nursery and imports.' },
  { year: 'Today', title: 'A Karnataka & AP Leader', detail: 'One of the largest landscaping & garden centres in the region, maintaining major corporate campuses.' },
]

export default function About() {
  useSEO({
    title: 'About Us — Star Gardens | A Second-Generation Landscaping Family Business',
    description:
      "Star Gardens' story — from a family agricultural background in Punganur, Andhra Pradesh, to one of Karnataka's largest landscaping and garden centres, established 2009.",
    image: media.aboutBanner,
  })

  return (
    <>
      <PageHero
        eyebrow="About Us"
        title="A second-generation family business, grown from the soil up"
        subtitle={company.establishedNote}
        image={media.aboutBanner}
      />

      <section className="mx-auto max-w-4xl px-5 py-20 lg:px-8">
        {foundingStory.map((p, i) => (
          <Reveal key={i} delay={i * 0.08} className="mb-6 text-base leading-relaxed text-forest-700 last:mb-0">
            <p>{p}</p>
          </Reveal>
        ))}
      </section>

      <section className="bg-forest-50/60 py-20">
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <Reveal className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-gold-600">Our Journey</span>
            <h2 className="mt-3 font-display text-3xl font-semibold text-forest-900">From Punganur to a Karnataka-wide operation</h2>
          </Reveal>

          <div className="relative mx-auto mt-14 max-w-2xl">
            <div className="absolute left-4 top-1 h-[calc(100%-1rem)] w-px bg-forest-200" />
            <div className="space-y-10">
              {timeline.map((t, i) => (
                <Reveal key={t.title} delay={i * 0.1} className="relative flex flex-col gap-1.5 pl-12">
                  <span className="absolute left-2.5 top-1.5 h-3.5 w-3.5 rounded-full bg-gold-400 ring-4 ring-forest-50" />
                  <span className="text-xs font-semibold uppercase tracking-widest text-gold-600">{t.year}</span>
                  <h3 className="font-display text-lg font-semibold text-forest-900">{t.title}</h3>
                  <p className="text-sm leading-relaxed text-forest-600">{t.detail}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-semibold uppercase tracking-widest text-gold-600">By The Numbers</span>
          <h2 className="mt-3 font-display text-3xl font-semibold text-forest-900">Green area covered, 2014–2022</h2>
        </Reveal>
        <div className="mt-12 grid grid-cols-2 gap-8 rounded-3xl border border-forest-100 bg-white p-10 shadow-sm lg:grid-cols-4">
          {stats.map((s) => (
            <StatCounter key={s.label} {...s} />
          ))}
        </div>
      </section>

      <section className="bg-forest-900 py-20">
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <Reveal className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-gold-300">Maintenance Programs</span>
            <h2 className="mt-3 font-display text-3xl font-semibold text-white">
              Care that keeps every space consistently green
            </h2>
          </Reveal>

          <div className="mt-14 grid gap-6 lg:grid-cols-3">
            {[maintenance.indoor, maintenance.outdoor].map((m) => (
              <Reveal key={m.title} className="rounded-2xl border border-white/10 bg-white/5 p-7 backdrop-blur">
                <h3 className="font-display text-lg font-semibold text-white">{m.title}</h3>
                {m.detail && <p className="mt-1 text-sm text-forest-300">{m.detail}</p>}
                <ul className="mt-4 space-y-2">
                  {m.items.map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm text-forest-200">
                      <Icon name="CheckCircle2" size={16} className="shrink-0 text-gold-300" /> {item}
                    </li>
                  ))}
                </ul>
              </Reveal>
            ))}
            <Reveal delay={0.1} className="rounded-2xl border border-white/10 bg-white/5 p-7 backdrop-blur">
              <h3 className="font-display text-lg font-semibold text-white">{maintenance.consulting.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-forest-200">{maintenance.consulting.detail}</p>
            </Reveal>
          </div>
        </div>
      </section>

      <CTASection />
    </>
  )
}
