import { Link, Navigate, useParams } from 'react-router-dom'
import Icon from '../components/Icon'
import Reveal from '../components/Reveal'
import BlogCard from '../components/BlogCard'
import Section from '../components/Section'
import SectionHeading from '../components/SectionHeading'
import CTASection from '../components/CTASection'
import useSEO from '../hooks/useSEO'
import { posts } from '../data/blog'
import { company, services } from '../data/content'

function Block({ block }) {
  if (block.h2) {
    return (
      <h2 className="mb-3 mt-10 font-display text-2xl font-semibold text-forest-900 first:mt-0">
        {block.h2}
      </h2>
    )
  }
  if (block.ul) {
    return (
      <ul className="my-5 space-y-2.5">
        {block.ul.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-base leading-relaxed text-forest-700">
            <Icon name="Leaf" size={16} className="mt-1.5 shrink-0 text-gold-600" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    )
  }
  return <p className="mb-5 text-base leading-relaxed text-forest-700 last:mb-0">{block.p}</p>
}

function articleJsonLd(post) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.seoDescription || post.excerpt,
    image: `${company.siteUrl}${post.image}`,
    datePublished: post.date,
    dateModified: post.date,
    articleSection: post.category,
    mainEntityOfPage: `${company.siteUrl}/blog/${post.slug}`,
    author: { '@type': 'Organization', name: company.name, url: company.siteUrl },
    publisher: {
      '@type': 'Organization',
      name: company.name,
      logo: { '@type': 'ImageObject', url: `${company.siteUrl}${company.logo}` },
    },
  }
}

export default function BlogPost() {
  const { slug } = useParams()
  const post = posts.find((p) => p.slug === slug)

  useSEO(
    post
      ? {
          title: `${post.title} — Star Gardens`,
          description: post.seoDescription,
          image: post.image,
          path: `/blog/${post.slug}`,
          type: 'article',
          jsonLd: articleJsonLd(post),
        }
      : { title: 'Article not found — Star Gardens' }
  )

  if (!post) return <Navigate to="/blog" replace />

  const relatedService = services.find((s) => s.slug === post.relatedService)
  const morePosts = posts.filter((p) => p.slug !== post.slug).slice(0, 3)

  return (
    <>
      <section className="relative isolate overflow-hidden bg-forest-900">
        <img
          src={post.image}
          alt=""
          aria-hidden="true"
          fetchPriority="high"
          className="absolute inset-0 -z-10 h-full w-full object-cover"
        />
        <div className="absolute inset-0 -z-10 bg-forest-950/78" />
        <div className="relative mx-auto max-w-3xl px-5 py-16 text-center sm:px-6 sm:py-20 lg:py-24">
          <span className="inline-block rounded-full bg-forest-800/70 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-gold-300 ring-1 ring-inset ring-white/10">
            {post.category}
          </span>
          <h1 className="mt-4 text-balance font-display text-3xl font-semibold leading-tight text-white sm:text-[2.75rem]">
            {post.title}
          </h1>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-forest-200">
            <time dateTime={post.date}>
              {new Date(post.date).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </time>
            <span aria-hidden="true">&middot;</span>
            <span>{post.readTime}</span>
            <span aria-hidden="true">&middot;</span>
            <span>Star Gardens Team</span>
          </div>

          <nav aria-label="Breadcrumb" className="mt-7">
            <ol className="flex flex-wrap items-center justify-center gap-2 text-xs text-forest-300">
              <li>
                <Link to="/" className="transition hover:text-gold-300">
                  Home
                </Link>
              </li>
              <Icon name="ChevronRight" size={12} className="text-forest-500" />
              <li>
                <Link to="/blog" className="transition hover:text-gold-300">
                  Blog
                </Link>
              </li>
            </ol>
          </nav>
        </div>
      </section>

      <article className="mx-auto max-w-3xl px-5 py-16 sm:px-6 sm:py-20 lg:px-8">
        <Reveal>
          <p className="mb-6 text-pretty text-lg leading-relaxed text-forest-800">{post.excerpt}</p>
          {post.body.map((block, i) => (
            <Block block={block} key={block.h2 || block.p || `list-${i}`} />
          ))}
        </Reveal>

        {relatedService && (
          <Reveal className="mt-14 rounded-3xl border border-forest-100 bg-forest-50/70 p-8 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-gold-600">
              Need this done, not just explained?
            </p>
            <h2 className="mt-2 text-balance font-display text-xl font-semibold text-forest-900">
              Star Gardens handles {relatedService.name.toLowerCase()} end-to-end
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-forest-600">
              {relatedService.short}
            </p>
            <Link
              to={`/services/${relatedService.slug}`}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-forest-900 px-6 py-3 text-sm font-semibold text-cream transition hover:bg-forest-800"
            >
              Explore {relatedService.name} <Icon name="ArrowUpRight" size={16} />
            </Link>
          </Reveal>
        )}
      </article>

      <Section tone="muted">
        <SectionHeading eyebrow="Keep Reading" title="More from the blog" />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {morePosts.map((p, i) => (
            <BlogCard key={p.slug} post={p} index={i} />
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link
            to="/blog"
            className="inline-flex items-center gap-2 text-sm font-semibold text-forest-800 transition hover:text-gold-600"
          >
            View all articles <Icon name="ArrowUpRight" size={16} />
          </Link>
        </div>
      </Section>

      <CTASection />
    </>
  )
}
