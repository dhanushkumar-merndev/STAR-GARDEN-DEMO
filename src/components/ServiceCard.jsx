import { Link } from 'react-router-dom'
import Icon from './Icon'
import Reveal from './Reveal'

export default function ServiceCard({ service, index = 0 }) {
  return (
    <Reveal delay={(index % 4) * 80} className="h-full">
      <Link
        to={`/services/${service.slug}`}
        className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-forest-100 bg-white shadow-sm transition-[transform,box-shadow] duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-forest-900/10"
      >
        {service.image && (
          <div className="relative aspect-[16/10] overflow-hidden">
            <img
              src={service.image}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-500 will-change-transform group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-forest-950/60 via-forest-950/10 to-transparent" />
            {/* Chip background holds still; only the glyph warms to gold. */}
            <span className="absolute bottom-3 left-4 grid h-11 w-11 place-items-center rounded-xl bg-cream/95 text-forest-800 shadow-lg transition-colors duration-300 group-hover:text-gold-600">
              <Icon name={service.icon} size={20} />
            </span>
          </div>
        )}

        <div className="flex flex-1 flex-col p-6">
          {!service.image && (
            <span className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-forest-900 text-forest-200 transition-colors duration-300 group-hover:text-gold-300">
              <Icon name={service.icon} size={26} />
            </span>
          )}
          <h3 className="font-display text-lg font-semibold leading-snug text-forest-900">
            {service.name}
          </h3>
          <p className="mt-2 flex-1 text-sm leading-relaxed text-forest-600">{service.short}</p>
          <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-forest-700 transition-colors group-hover:text-gold-600">
            Learn more
            <Icon
              name="ArrowUpRight"
              size={16}
              className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            />
          </span>
        </div>
      </Link>
    </Reveal>
  )
}
