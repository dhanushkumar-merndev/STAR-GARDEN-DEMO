import { useMemo, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import Icon from '../components/Icon'
import PageHero from '../components/PageHero'
import PlantCard from '../components/PlantCard'
import CTASection from '../components/CTASection'
import useSEO from '../hooks/useSEO'
import { plants, plantCategories, media } from '../data/content'

export default function Plants() {
  useSEO({
    title: 'All Plants — Indoor, Outdoor & Flowering Varieties | Star Gardens',
    description: `Browse ${plants.length}+ indoor, outdoor and flowering plant varieties grown and maintained by Star Gardens for Bangalore's climate — searchable by category.`,
    image: media.plantsBanner,
  })

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')

  const filtered = useMemo(() => {
    return plants.filter((p) => {
      const matchesCategory = category === 'All' || p.category === category
      const q = query.trim().toLowerCase()
      const matchesQuery = !q || p.name.toLowerCase().includes(q) || p.sci.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q)
      return matchesCategory && matchesQuery
    })
  }, [query, category])

  return (
    <>
      <PageHero
        eyebrow="All Plants"
        title="Our nursery catalogue"
        subtitle={`${plants.length} indoor, outdoor and flowering varieties — grown, imported and maintained for Bangalore's climate.`}
        image={media.plantsBanner}
      />

      <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
        <div className="sticky top-[68px] z-30 -mx-5 mb-10 bg-cream/90 px-5 py-4 backdrop-blur lg:top-[76px]">
          <div className="flex flex-col gap-4 rounded-2xl border border-forest-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Icon name="Search" size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-forest-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search plants by name..."
                className="w-full rounded-xl border border-forest-100 bg-forest-50/50 py-2.5 pl-10 pr-4 text-sm text-forest-800 outline-none placeholder:text-forest-400 focus:border-forest-400 focus:bg-white"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {plantCategories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                    category === c ? 'bg-forest-800 text-white' : 'bg-forest-50 text-forest-700 hover:bg-forest-100'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-forest-200 py-20 text-center text-forest-500">
            No plants match &ldquo;{query}&rdquo;. Try another search or category.
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <AnimatePresence>
              {filtered.map((p, i) => (
                <PlantCard key={p.name} plant={p} index={i} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>

      <CTASection />
    </>
  )
}
