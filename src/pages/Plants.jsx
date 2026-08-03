import { useMemo, useState } from 'react'
import Icon from '../components/Icon'
import PageHero from '../components/PageHero'
import PlantCard from '../components/PlantCard'
import FilterBar from '../components/FilterBar'
import Section from '../components/Section'
import CTASection from '../components/CTASection'
import useSEO from '../hooks/useSEO'
import { plants, plantCategories, media, breadcrumbJsonLd } from '../data/content'

export default function Plants() {
  useSEO({
    title: 'All Plants — Indoor, Outdoor & Flowering Varieties | Star Gardens',
    description: `Browse ${plants.length} indoor, outdoor and flowering plant varieties grown and maintained by Star Gardens for Bangalore's climate — searchable by category.`,
    image: media.plantsBanner,
    path: '/plants',
    jsonLd: breadcrumbJsonLd([
      { name: 'Home', path: '/' },
      { name: 'All Plants', path: '/plants' },
    ]),
  })

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return plants.filter((p) => {
      if (category !== 'All' && p.category !== category) return false
      if (!q) return true
      return (
        p.name.toLowerCase().includes(q) ||
        p.sci.toLowerCase().includes(q) ||
        p.desc.toLowerCase().includes(q)
      )
    })
  }, [query, category])

  return (
    <>
      <PageHero
        eyebrow="All Plants"
        title="Our nursery catalogue"
        subtitle={`${plants.length} indoor, outdoor and flowering varieties — grown, imported and maintained for Bangalore's climate.`}
        image={media.plantsBanner}
        crumbs={[{ label: 'Home', to: '/' }, { label: 'All Plants' }]}
      />

      <Section size="compact">
        <FilterBar
          id="plant-search"
          label="Search plants"
          placeholder="Search plants by name..."
          query={query}
          onQueryChange={setQuery}
          categories={plantCategories}
          category={category}
          onCategoryChange={setCategory}
        />

        <p aria-live="polite" className="sr-only">
          {filtered.length} plants shown
        </p>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-forest-200 px-6 py-20 text-center">
            <Icon name="Search" size={26} className="mx-auto text-forest-300" />
            <p className="mt-4 text-forest-500">
              No plants match &ldquo;{query}&rdquo;. Try another search or category.
            </p>
            <button
              type="button"
              onClick={() => {
                setQuery('')
                setCategory('All')
              }}
              className="mt-5 rounded-full bg-forest-900 px-5 py-2.5 text-sm font-semibold text-cream transition hover:bg-forest-800"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((p) => (
              <PlantCard key={p.name + p.sci} plant={p} />
            ))}
          </div>
        )}
      </Section>

      <CTASection
        title="Not sure which plants suit your space?"
        body="Send us a photo of the spot on WhatsApp — we'll tell you what will thrive there, and what it costs to hire or buy."
      />
    </>
  )
}
