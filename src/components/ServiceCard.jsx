import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import Icon from './Icon'

export default function ServiceCard({ service, index = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay: (index % 3) * 0.1 }}
    >
      <Link
        to={`/services/${service.slug}`}
        className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-forest-100 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-forest-900/10"
      >
        {service.image && (
          <div className="relative h-40 overflow-hidden">
            <img
              src={service.image}
              alt={service.name}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-forest-950/50 via-transparent to-transparent" />
            <span className="absolute bottom-3 left-4 z-10 grid h-11 w-11 place-items-center rounded-xl bg-forest-800 text-gold-300 shadow-lg transition-colors group-hover:bg-gold-400 group-hover:text-forest-950">
              <Icon name={service.icon} size={20} />
            </span>
          </div>
        )}

        <div className="relative flex flex-1 flex-col p-7">
          {!service.image && (
            <span className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-forest-800 text-gold-300 transition-colors group-hover:bg-gold-400 group-hover:text-forest-950">
              <Icon name={service.icon} size={26} />
            </span>
          )}
          <h3 className="font-display text-xl font-semibold text-forest-900">{service.name}</h3>
          <p className="mt-2 flex-1 text-sm leading-relaxed text-forest-600">{service.short}</p>
          <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-forest-700 transition-colors group-hover:text-gold-600">
            Learn more <Icon name="ArrowUpRight" size={16} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
        </div>
      </Link>
    </motion.div>
  )
}
