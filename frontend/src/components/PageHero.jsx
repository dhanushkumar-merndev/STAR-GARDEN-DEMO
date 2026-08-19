import { Link } from 'react-router-dom'
import Icon from './Icon'
import { LeafSprig } from './Leaves'

/**
 * Shared inner-page banner. `crumbs` is [{ label, to }] for the breadcrumb trail;
 * the last entry renders as plain text for the current page.
 */
export default function PageHero({ eyebrow, title, subtitle, image, crumbs = [] }) {
  return (
    <section className="relative isolate overflow-hidden bg-forest-900 py-16 text-center sm:py-20 lg:py-24">
      {image && (
        <img
          src={image}
          alt=""
          aria-hidden="true"
          fetchPriority="high"
          className="absolute inset-0 -z-10 h-full w-full scale-105 object-cover"
        />
      )}
      <div
        className={`pointer-events-none absolute inset-0 -z-10 ${
          image
            ? 'bg-forest-950/80 bg-[radial-gradient(circle_at_20%_20%,rgba(234,191,81,0.2),transparent_50%)]'
            : 'bg-[radial-gradient(circle_at_20%_20%,rgba(234,191,81,0.15),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(151,186,156,0.2),transparent_40%)]'
        }`}
      />
      <LeafSprig className="pointer-events-none absolute -left-6 top-8 -z-10 h-28 w-28 text-forest-700/40" />
      <LeafSprig className="pointer-events-none absolute -right-4 bottom-4 -z-10 h-36 w-36 rotate-45 text-forest-700/30" />

      <div className="relative mx-auto max-w-3xl px-5">
        {eyebrow && (
          <span className="inline-block rounded-full bg-forest-800/70 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-gold-300 ring-1 ring-inset ring-white/10">
            {eyebrow}
          </span>
        )}
        <h1 className="mt-4 text-balance font-display text-3xl font-semibold leading-[1.12] text-white sm:text-5xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mx-auto mt-4 max-w-2xl text-pretty text-base leading-relaxed text-forest-200">
            {subtitle}
          </p>
        )}

        {crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mt-7">
            <ol className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-forest-300">
              {crumbs.map((c, i) => (
                <li key={c.label} className="flex items-center gap-2">
                  {c.to ? (
                    <Link to={c.to} className="transition hover:text-gold-300">
                      {c.label}
                    </Link>
                  ) : (
                    <span className="text-forest-400">{c.label}</span>
                  )}
                  {i < crumbs.length - 1 && (
                    <Icon name="ChevronRight" size={12} className="text-forest-500" />
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}
      </div>
    </section>
  )
}
