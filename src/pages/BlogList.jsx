import { useMemo, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import Icon from '../components/Icon'
import PageHero from '../components/PageHero'
import BlogCard from '../components/BlogCard'
import CTASection from '../components/CTASection'
import useSEO from '../hooks/useSEO'
import { posts, blogCategories } from '../data/blog'
import { media } from '../data/content'

export default function BlogList() {
  useSEO({
    title: 'Gardening & Landscaping Guides — Star Gardens Blog',
    description:
      'Practical, Bangalore-specific guides on terrace gardens, vertical gardens, kitchen gardens, office plants and landscape maintenance from Star Gardens.',
  })

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')

  const filtered = useMemo(() => {
    return posts.filter((p) => {
      const matchesCategory = category === 'All' || p.category === category
      const q = query.trim().toLowerCase()
      const matchesQuery = !q || p.title.toLowerCase().includes(q) || p.excerpt.toLowerCase().includes(q)
      return matchesCategory && matchesQuery
    })
  }, [query, category])

  return (
    <>
      <PageHero
        eyebrow="The Star Gardens Blog"
        title="Gardening & landscaping guides, written for Bangalore"
        subtitle="Practical advice on terrace gardens, vertical gardens, office plants and maintenance — from the team that actually installs and maintains them."
        image={media.aboutBanner}
      />

      <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
        <div className="sticky top-[68px] z-30 -mx-5 mb-10 bg-cream/90 px-5 py-4 backdrop-blur lg:top-[76px]">
          <div className="flex flex-col gap-4 rounded-2xl border border-forest-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Icon name="Search" size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-forest-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search articles..."
                className="w-full rounded-xl border border-forest-100 bg-forest-50/50 py-2.5 pl-10 pr-4 text-sm text-forest-800 outline-none placeholder:text-forest-400 focus:border-forest-400 focus:bg-white"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {blogCategories.map((c) => (
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
            No articles match &ldquo;{query}&rdquo;. Try another search or category.
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence>
              {filtered.map((p, i) => (
                <BlogCard key={p.slug} post={p} index={i} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>

      <CTASection />
    </>
  )
}
