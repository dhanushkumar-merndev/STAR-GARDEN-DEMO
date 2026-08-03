import Icon from './Icon'

/** Sticky search + category filter shared by the plant catalogue and the blog index. */
export default function FilterBar({
  id,
  label,
  placeholder,
  query,
  onQueryChange,
  categories,
  category,
  onCategoryChange,
}) {
  return (
    <div className="sticky top-[60px] z-30 -mx-5 mb-10 bg-cream/90 px-5 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:top-[76px] lg:-mx-8 lg:px-8">
      <div className="flex flex-col gap-3 rounded-2xl border border-forest-100 bg-white p-3 shadow-sm lg:flex-row lg:items-center lg:gap-4 lg:p-4">
        <div className="relative flex-1">
          <Icon
            name="Search"
            size={17}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-forest-400"
          />
          <label htmlFor={id} className="sr-only">
            {label}
          </label>
          <input
            id={id}
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-xl border border-forest-100 bg-forest-50/50 py-2.5 pl-10 pr-4 text-sm text-forest-800 outline-none transition placeholder:text-forest-400 focus:border-forest-400 focus:bg-white"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onCategoryChange(c)}
              aria-pressed={category === c}
              className={`rounded-full px-3.5 py-2 text-xs font-semibold transition ${
                category === c
                  ? 'bg-forest-900 text-cream'
                  : 'bg-forest-50 text-forest-700 hover:bg-forest-100'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
