import { motion } from 'framer-motion'
import { LeafSprig } from './Leaves'

export default function PageHero({ eyebrow, title, subtitle, image }) {
  return (
    <section className="relative overflow-hidden bg-forest-900 py-24 text-center">
      {image && (
        <img
          src={image}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      <div
        className={`pointer-events-none absolute inset-0 ${
          image
            ? 'bg-forest-950/75 bg-[radial-gradient(circle_at_20%_20%,rgba(234,191,81,0.18),transparent_45%)]'
            : 'bg-[radial-gradient(circle_at_20%_20%,rgba(234,191,81,0.15),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(151,186,156,0.2),transparent_40%)]'
        }`}
      />
      <LeafSprig className="pointer-events-none absolute -left-6 top-8 h-28 w-28 text-forest-700/50" />
      <LeafSprig className="pointer-events-none absolute -right-4 bottom-4 h-36 w-36 rotate-45 text-forest-700/40" />
      <div className="relative mx-auto max-w-3xl px-5">
        {eyebrow && (
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-block rounded-full bg-forest-800/80 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-gold-300"
          >
            {eyebrow}
          </motion.span>
        )}
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-4 font-display text-4xl font-semibold text-white sm:text-5xl"
        >
          {title}
        </motion.h1>
        {subtitle && (
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-forest-200"
          >
            {subtitle}
          </motion.p>
        )}
      </div>
    </section>
  )
}
