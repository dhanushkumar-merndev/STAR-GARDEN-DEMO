import { Link } from 'react-router-dom'
import Icon from '../components/Icon'
import useSEO from '../hooks/useSEO'

export default function NotFound() {
  useSEO({ title: 'Page Not Found — Star Gardens' })

  return (
    <section className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-5 py-24 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-2xl bg-forest-800 text-gold-300">
        <Icon name="Leaf" size={28} />
      </span>
      <h1 className="mt-6 font-display text-3xl font-semibold text-forest-900">This page hasn&apos;t sprouted yet</h1>
      <p className="mt-3 text-forest-600">The page you&apos;re looking for doesn&apos;t exist or may have moved.</p>
      <Link to="/" className="mt-7 inline-flex items-center gap-2 rounded-full bg-forest-800 px-6 py-3 text-sm font-semibold text-white hover:bg-forest-700">
        Back to Home <Icon name="ArrowUpRight" size={16} />
      </Link>
    </section>
  )
}
