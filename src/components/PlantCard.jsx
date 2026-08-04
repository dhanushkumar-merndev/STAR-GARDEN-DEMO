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
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-forest-100 bg-white shadow-sm transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-forest-900/5">
      <div className="relative aspect-[4/5] overflow-hidden bg-forest-50">
        {plant.img ? (
          <img
            src={plant.img}
            alt={plant.name}
            width={600}
            height={750}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          // Not every catalogue entry has a photograph — a tinted leaf tile keeps
          // the grid even rather than leaving a hole.
          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-forest-100 to-forest-200">
            <Icon name={style.icon} size={44} className="text-forest-400" />
          </div>
        )}
        <span
          className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold shadow-sm ${style.chip}`}
        >
          {plant.category}
        </span>
      </div>

      <div className="flex flex-col p-5">
        <h3 className="font-display text-lg font-semibold leading-snug text-forest-900">
          {plant.name}
        </h3>
        <p className="mt-0.5 text-xs italic text-forest-400">{plant.sci}</p>
        <p className="mt-3 text-sm leading-relaxed text-forest-600">{plant.desc}</p>
      </div>
    </article>
  )
}
