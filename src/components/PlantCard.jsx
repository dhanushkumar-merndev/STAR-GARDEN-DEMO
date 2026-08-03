import Icon from './Icon'

const categoryStyle = {
  'Air-Purifying': { chip: 'bg-forest-100 text-forest-700', icon: 'Droplets' },
  Foliage: { chip: 'bg-gold-100 text-gold-700', icon: 'Leaf' },
  Flowering: { chip: 'bg-rose-100 text-rose-700', icon: 'Flower2' },
  'Landscape Tree': { chip: 'bg-amber-100 text-amber-700', icon: 'Trees' },
}

export default function PlantCard({ plant }) {
  const style = categoryStyle[plant.category] || categoryStyle.Foliage

  return (
    <article className="group flex flex-col rounded-2xl border border-forest-100 bg-white p-5 shadow-sm transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-forest-900/5">
      <div className="flex items-start justify-between gap-3">
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-colors ${style.chip}`}
        >
          <Icon name={style.icon} size={18} />
        </span>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${style.chip}`}>
          {plant.category}
        </span>
      </div>
      <h3 className="mt-4 font-display text-lg font-semibold leading-snug text-forest-900">
        {plant.name}
      </h3>
      <p className="mt-0.5 text-xs italic text-forest-400">{plant.sci}</p>
      <p className="mt-3 text-sm leading-relaxed text-forest-600">{plant.desc}</p>
    </article>
  )
}
