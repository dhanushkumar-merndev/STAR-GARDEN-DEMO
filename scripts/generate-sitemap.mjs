// Generates public/sitemap.xml from the same data the site renders from, so the
// sitemap can never drift out of sync with the routes. Runs as part of `pnpm build`.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { company, services } from '../src/data/content.js'
import { posts } from '../src/data/blog.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const today = new Date().toISOString().slice(0, 10)

const staticRoutes = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/about', changefreq: 'yearly', priority: '0.8' },
  { path: '/services', changefreq: 'monthly', priority: '0.9' },
  { path: '/clients', changefreq: 'monthly', priority: '0.7' },
  { path: '/plants', changefreq: 'monthly', priority: '0.7' },
  { path: '/blog', changefreq: 'weekly', priority: '0.8' },
  { path: '/contact', changefreq: 'yearly', priority: '0.9' },
  { path: '/privacy-policy', changefreq: 'yearly', priority: '0.2' },
]

const urls = [
  ...staticRoutes.map((r) => ({ ...r, lastmod: today })),
  ...services.map((s) => ({
    path: `/services/${s.slug}`,
    lastmod: today,
    changefreq: 'monthly',
    priority: '0.8',
  })),
  ...posts.map((p) => ({
    path: `/blog/${p.slug}`,
    lastmod: p.date,
    changefreq: 'yearly',
    priority: '0.6',
  })),
]

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${company.siteUrl}${u.path}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>
`

writeFileSync(resolve(root, 'public/sitemap.xml'), xml)
console.log(`sitemap.xml — ${urls.length} URLs`)
