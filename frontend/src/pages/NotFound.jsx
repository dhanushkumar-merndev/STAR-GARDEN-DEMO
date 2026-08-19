import { Link } from 'react-router-dom'
import Icon from '../components/Icon'
import useSEO from '../hooks/useSEO'
import { navLinks } from '../data/content'

export default function NotFound() {
  useSEO({
    title: 'Page Not Found — Star Gardens',
    description: 'The page you were looking for has moved or no longer exists.',
  })

  return (
    <section className="mx-auto flex min-h-[65vh] max-w-xl flex-col items-center justify-center px-5 py-24 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-2xl bg-forest-900 text-gold-300">
        <Icon name="Sprout" size={28} />
      </span>
      <p className="mt-6 font-display text-5xl font-semibold text-forest-200">404</p>
      <h1 className="mt-2 text-balance font-display text-3xl font-semibold text-forest-900">
        This page hasn&apos;t sprouted yet
      </h1>
      <p className="mt-3 text-forest-600">
        The page you&apos;re looking for doesn&apos;t exist or may have moved.
      </p>

      <Link
        to="/"
        className="mt-7 inline-flex items-center gap-2 rounded-full bg-forest-900 px-6 py-3 text-sm font-semibold text-cream transition hover:bg-forest-800"
      >
        Back to Home <Icon name="ArrowUpRight" size={16} />
      </Link>

      <ul className="mt-10 flex flex-wrap items-center justify-center gap-2">
        {navLinks
          .filter((l) => l.to !== '/')
          .map((l) => (
            <li key={l.to}>
              <Link
                to={l.to}
                className="inline-block rounded-full border border-forest-200 bg-white px-4 py-2 text-xs font-semibold text-forest-700 transition hover:border-gold-400 hover:text-gold-700"
              >
                {l.label}
              </Link>
            </li>
          ))}
      </ul>
    </section>
  )
}
