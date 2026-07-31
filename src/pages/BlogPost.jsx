import { Link, Navigate, useParams } from 'react-router-dom'
import Icon from '../components/Icon'
import Reveal from '../components/Reveal'
import BlogCard from '../components/BlogCard'
import CTASection from '../components/CTASection'
import useSEO from '../hooks/useSEO'
import { posts } from '../data/blog'
import { services } from '../data/content'

function Block({ block, i }) {
  if (block.h2) return <h2 key={i} className="mt-10 mb-3 font-display text-2xl font-semibold text-forest-900 first:mt-0">{block.h2}</h2>
  if (block.ul) {
    return (
      <ul key={i} className="my-5 space-y-2.5">
        {block.ul.map((item, j) => (
          <li key={j} className="flex items-start gap-2.5 text-base leading-relaxed text-forest-700">
            <Icon name="Leaf" size={16} className="mt-1.5 shrink-0 text-gold-600" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    )
  }
  return <p key={i} className="mb-5 text-base leading-relaxed text-forest-700 last:mb-0">{block.p}</p>
}

export default function BlogPost() {
  const { slug } = useParams()
  const post = posts.find((p) => p.slug === slug)

  useSEO(
    post
      ? { title: `${post.title} — Star Gardens`, description: post.seoDescription, image: post.image }
      : { title: 'Article not found — Star Gardens' }
  )

  if (!post) return <Navigate to="/blog" replace />

  const relatedService = services.find((s) => s.slug === post.relatedService)
  const morePosts = posts.filter((p) => p.slug !== post.slug).slice(0, 3)

  return (
    <>
      <section className="relative overflow-hidden bg-forest-900">
        <img src={post.image} alt={post.title} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-forest-950/70" />
        <div className="relative mx-auto max-w-3xl px-5 py-24 text-center">
          <span className="inline-block rounded-full bg-forest-800/80 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-gold-300">
            {post.category}
          </span>
          <h1 className="mt-4 font-display text-3xl font-semibold text-white sm:text-4xl">{post.title}</h1>
          <div className="mt-4 flex items-center justify-center gap-3 text-sm text-forest-200">
            <span>{new Date(post.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            <span aria-hidden="true">&middot;</span>
            <span>{post.readTime}</span>
            <span aria-hidden="true">&middot;</span>
            <span>Star Gardens Team</span>
          </div>
        </div>
      </section>

      <article className="mx-auto max-w-3xl px-5 py-16 lg:px-8">
        <Reveal>
          <p className="mb-6 text-lg leading-relaxed text-forest-800">{post.excerpt}</p>
          {post.body.map((block, i) => (
            <Block block={block} i={i} key={i} />
          ))}
        </Reveal>

        {relatedService && (
          <Reveal className="mt-14 rounded-3xl border border-forest-100 bg-forest-50/60 p-8 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-gold-600">Need this done, not just explained?</p>
            <h3 className="mt-2 font-display text-xl font-semibold text-forest-900">
              Star Gardens handles {relatedService.name.toLowerCase()} end-to-end
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-forest-600">{relatedService.short}</p>
            <Link
              to={`/services/${relatedService.slug}`}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-forest-800 px-6 py-3 text-sm font-semibold text-white transition hover:bg-forest-700"
            >
              Explore {relatedService.name} <Icon name="ArrowUpRight" size={16} />
            </Link>
          </Reveal>
        )}
      </article>

      <section className="bg-forest-50/60 py-20">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <Reveal className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-gold-600">Keep Reading</span>
            <h2 className="mt-3 font-display text-2xl font-semibold text-forest-900">More from the blog</h2>
          </Reveal>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {morePosts.map((p, i) => (
              <BlogCard key={p.slug} post={p} index={i} />
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link to="/blog" className="inline-flex items-center gap-2 font-semibold text-forest-800 hover:text-gold-600">
              View all articles <Icon name="ArrowUpRight" size={16} />
            </Link>
          </div>
        </div>
      </section>

      <CTASection />
    </>
  )
}
