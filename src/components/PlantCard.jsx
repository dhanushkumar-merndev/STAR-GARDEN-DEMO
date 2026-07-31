import { motion } from 'framer-motion'

const categoryColor = {
  'Air-Purifying': 'bg-forest-100 text-forest-700',
  Foliage: 'bg-gold-100 text-gold-700',
  Flowering: 'bg-rose-100 text-rose-700',
  'Landscape Tree': 'bg-amber-100 text-amber-700',
}

export default function PlantCard({ plant, index = 0 }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.35, delay: (index % 12) * 0.03 }}
      className="group flex flex-col rounded-2xl border border-forest-100 bg-white p-5 shadow-sm transition hover:shadow-lg hover:shadow-forest-900/5"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-lg font-semibold text-forest-900">{plant.name}</h3>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${categoryColor[plant.category] || 'bg-forest-100 text-forest-700'}`}>
          {plant.category}
        </span>
      </div>
      <p className="mt-0.5 text-xs italic text-forest-400">{plant.sci}</p>
      <p className="mt-3 text-sm leading-relaxed text-forest-600">{plant.desc}</p>
    </motion.div>
  )
}
