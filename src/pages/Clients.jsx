import Icon from '../components/Icon'
import PageHero from '../components/PageHero'
import Reveal from '../components/Reveal'
import CTASection from '../components/CTASection'
import useSEO from '../hooks/useSEO'
import {
  allClientNames,
  finishedProjects,
  ongoingProjects,
  currentMaintenance,
  media,
} from '../data/content'

function ProjectTable({ title, icon, rows, tone = 'default' }) {
  return (
    <Reveal className="rounded-3xl border border-forest-100 bg-white p-7 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={`grid h-11 w-11 place-items-center rounded-xl ${tone === 'gold' ? 'bg-gold-400 text-forest-950' : 'bg-forest-800 text-gold-300'}`}>
          <Icon name={icon} size={20} />
        </span>
        <h3 className="font-display text-lg font-semibold text-forest-900">{title}</h3>
      </div>
      <div className="mt-5 divide-y divide-forest-100">
        {rows.map((r) => (
          <div key={r.name + r.place} className="flex items-center justify-between gap-3 py-3">
            <div>
              <p className="text-sm font-semibold text-forest-800">{r.name}</p>
              <p className="text-xs text-forest-500">{r.place}</p>
            </div>
            <span className="shrink-0 rounded-full bg-forest-50 px-3 py-1 text-xs font-semibold text-forest-700">{r.area}</span>
          </div>
        ))}
      </div>
    </Reveal>
  )
}

export default function Clients() {
  useSEO({
    title: 'Our Clients & Projects — Star Gardens | Bangalore',
    description:
      'Airbus, Boeing, Accenture, Wipro, Swiss Re, OLA, Hotel Hilton and 80+ corporates, resorts and townships trust Star Gardens for landscape maintenance across Bangalore & Karnataka.',
    image: media.clientsBanner,
  })

  return (
    <>
      <PageHero
        eyebrow="Our Clients"
        title="Trusted across corporate campuses, resorts & townships"
        subtitle="From 5-star hospitality to multi-acre residential townships, Star Gardens maintains landscapes that stay green year-round."
        image={media.clientsBanner}
      />

      <section className="mx-auto max-w-6xl px-5 py-20 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-semibold uppercase tracking-widest text-gold-600">Client Portfolio</span>
          <h2 className="mt-3 font-display text-3xl font-semibold text-forest-900">Names that trust us with their landscapes</h2>
        </Reveal>

        <Reveal delay={0.1} className="mx-auto mt-10 overflow-hidden rounded-3xl border border-forest-100 shadow-sm">
          <img src={media.clientsCollage} alt="Our esteemed clients — Star Gardens" className="w-full" />
        </Reveal>

        <div className="mt-10 flex flex-wrap justify-center gap-2.5">
          {allClientNames.map((c) => (
            <span key={c} className="rounded-full border border-forest-200 bg-white px-4 py-2 text-xs font-semibold text-forest-800 shadow-sm">
              {c}
            </span>
          ))}
        </div>
      </section>

      <section className="bg-forest-50/60 py-20">
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-2">
            <ProjectTable title="Finished Landscape Projects" icon="CheckCircle2" rows={finishedProjects} />
            <ProjectTable title="Ongoing Projects" icon="Hammer" rows={ongoingProjects} tone="gold" />
          </div>
          <div className="mt-6">
            <ProjectTable title="Current Maintenance (2021–2022)" icon="Wrench" rows={currentMaintenance} />
          </div>
        </div>
      </section>

      <CTASection />
    </>
  )
}
