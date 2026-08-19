import Icon from '../components/Icon'
import PageHero from '../components/PageHero'
import Reveal from '../components/Reveal'
import Section from '../components/Section'
import SectionHeading from '../components/SectionHeading'
import CTASection from '../components/CTASection'
import useSEO from '../hooks/useSEO'
import {
  finishedProjects,
  ongoingProjects,
  currentMaintenance,
  media,
  breadcrumbJsonLd,
} from '../data/content'

function ProjectTable({ title, icon, rows, tone = 'default', delay = 0 }) {
  return (
    <Reveal
      delay={delay}
      className="rounded-3xl border border-forest-100 bg-white p-6 shadow-sm sm:p-7"
    >
      <div className="flex items-center gap-3">
        <span
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
            tone === 'gold' ? 'bg-gold-400 text-forest-950' : 'bg-forest-900 text-gold-300'
          }`}
        >
          <Icon name={icon} size={19} />
        </span>
        <h2 className="font-display text-lg font-semibold leading-snug text-forest-900">{title}</h2>
      </div>
      <ul className="mt-5 divide-y divide-forest-100">
        {rows.map((r) => (
          <li key={r.name + r.place} className="flex items-center justify-between gap-3 py-3.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-forest-800">{r.name}</p>
              <p className="mt-0.5 truncate text-xs text-forest-500">{r.place}</p>
            </div>
            <span className="shrink-0 rounded-full bg-forest-50 px-3 py-1 text-xs font-semibold text-forest-700">
              {r.area}
            </span>
          </li>
        ))}
      </ul>
    </Reveal>
  )
}

export default function Clients() {
  useSEO({
    title: 'Our Clients & Projects — Star Gardens | Bangalore',
    description:
      'Airbus, Boeing, Accenture, Wipro, Swiss Re, OLA, Hotel Hilton and 80+ corporates, resorts and townships trust Star Gardens for landscape maintenance across Bangalore & Karnataka.',
    image: media.clientsBanner,
    path: '/clients',
    jsonLd: breadcrumbJsonLd([
      { name: 'Home', path: '/' },
      { name: 'Clients', path: '/clients' },
    ]),
  })

  return (
    <>
      <PageHero
        eyebrow="Our Clients"
        title="Trusted across corporate campuses, resorts & townships"
        subtitle="From 5-star hospitality to multi-acre residential townships, Star Gardens maintains landscapes that stay green year-round."
        image={media.clientsBanner}
        crumbs={[{ label: 'Home', to: '/' }, { label: 'Clients' }]}
      />

      <Section width="wide">
        <SectionHeading
          eyebrow="Client Portfolio"
          title="Names that trust us with their landscapes"
        />

        <Reveal
          delay={100}
          className="mt-12 overflow-hidden rounded-3xl border border-forest-100 bg-white p-3 shadow-sm sm:p-5 lg:mt-16"
        >
          <img
            src={media.clientsCollage}
            alt="Logos of Star Gardens' esteemed corporate clients"
            loading="lazy"
            decoding="async"
            width={1600}
            height={900}
            className="w-full rounded-2xl"
          />
        </Reveal>

      </Section>

      <Section tone="muted" width="wide">
        <SectionHeading
          eyebrow="Project Register"
          title="Delivered, in progress, and under weekly care"
        />

        <div className="mt-12 grid gap-5 lg:mt-16 lg:grid-cols-2">
          <ProjectTable title="Finished Landscape Projects" icon="CircleCheck" rows={finishedProjects} />
          <ProjectTable
            title="Ongoing Projects"
            icon="Sprout"
            rows={ongoingProjects}
            tone="gold"
            delay={100}
          />
        </div>
        <div className="mt-5">
          <ProjectTable
            title="Current Maintenance (2021–2022)"
            icon="Scissors"
            rows={currentMaintenance}
          />
        </div>
      </Section>

      <CTASection />
    </>
  )
}
