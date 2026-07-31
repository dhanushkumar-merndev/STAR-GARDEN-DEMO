import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import Icon from './Icon'

export default function BlogCard({ post, index = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay: (index % 6) * 0.06 }}
      className="h-full"
    >
      <Link
        to={`/blog/${post.slug}`}
        className="group flex h-full flex-col overflow-hidden rounded-3xl border border-forest-100 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-forest-900/10"
      >
        <div className="relative h-44 overflow-hidden">
          <img
            src={post.image}
            alt={post.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
          <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-[11px] font-semibold text-forest-700 shadow-sm">
            {post.category}
          </span>
        </div>
        <div className="flex flex-1 flex-col p-6">
          <div className="flex items-center gap-3 text-xs text-forest-400">
            <span>{new Date(post.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            <span aria-hidden="true">&middot;</span>
            <span>{post.readTime}</span>
          </div>
          <h3 className="mt-2 font-display text-lg font-semibold leading-snug text-forest-900">{post.title}</h3>
          <p className="mt-2 flex-1 text-sm leading-relaxed text-forest-600">{post.excerpt}</p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-forest-700 transition-colors group-hover:text-gold-600">
            Read article <Icon name="ArrowUpRight" size={16} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
        </div>
      </Link>
    </motion.div>
  )
}
