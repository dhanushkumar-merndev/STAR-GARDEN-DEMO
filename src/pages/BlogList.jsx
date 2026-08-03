import { useMemo, useState } from 'react'
import Icon from '../components/Icon'
import PageHero from '../components/PageHero'
import BlogCard from '../components/BlogCard'
import FilterBar from '../components/FilterBar'
import Section from '../components/Section'
import CTASection from '../components/CTASection'
import useSEO from '../hooks/useSEO'
import { posts, blogCategories } from '../data/blog'
import { media, breadcrumbJsonLd } from '../data/content'

export default function BlogList() {
  useSEO({
    title: 'Gardening & Landscaping Guides — Star Gardens Blog',
    description:
      'Practical, Bangalore-specific guides on terrace gardens, vertical gardens, kitchen gardens, office plants and landscape maintenance from Star Gardens.',
    image: media.aboutBanner,
    path: '/blog',
    jsonLd: breadcrumbJsonLd([
      { name: 'Home', path: '/' },
      { name: 'Blog', path: '/blog' },
    ]),
  })

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return posts.filter((p) => {
      if (category !== 'All' && p.category !== category) return false
      if (!q) return true
      return p.title.toLowerCase().includes(q) || p.excerpt.toLowerCase().includes(q)
    })
  }, [query, category])

  return (
    <>
      <PageHero
        eyebrow="The Star Gardens Blog"
        title="Gardening & landscaping guides, written for Bangalore"
        subtitle="Practical advice on terrace gardens, vertical gardens, office plants and maintenance — from the team that actually installs and maintains them."
        image={media.aboutBanner}
        crumbs={[{ label: 'Home', to: '/' }, { label: 'Blog' }]}
      />

      <Section size="compact">
        <FilterBar
          id="blog-search"
          label="Search articles"
          placeholder="Search articles..."
          query={query}
          onQueryChange={setQuery}
          categories={blogCategories}
          category={category}
          onCategoryChange={setCategory}
        />

        <p aria-live="polite" className="sr-only">
          {filtered.length} articles shown
        </p>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-forest-200 px-6 py-20 text-center">
            <Icon name="Search" size={26} className="mx-auto text-forest-300" />
            <p className="mt-4 text-forest-500">
              No articles match &ldquo;{query}&rdquo;. Try another search or category.
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
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p, i) => (
              <BlogCard key={p.slug} post={p} index={i} />
            ))}
          </div>
        )}
      </Section>

      <CTASection />
    </>
  )
}
