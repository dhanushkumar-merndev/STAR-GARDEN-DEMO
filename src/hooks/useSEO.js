import { useEffect } from 'react'
import { company } from '../data/content'

function upsertMeta(key, content, attr = 'name') {
  const head = document.head
  let tag = head.querySelector(`meta[${attr}="${key}"]`)

  if (!content) {
    if (tag) tag.remove()
    return
  }
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute(attr, key)
    head.appendChild(tag)
  }
  tag.setAttribute('content', content)
}

function upsertLink(rel, href) {
  const head = document.head
  let tag = head.querySelector(`link[rel="${rel}"]`)

  if (!href) {
    if (tag) tag.remove()
    return
  }
  if (!tag) {
    tag = document.createElement('link')
    tag.setAttribute('rel', rel)
    head.appendChild(tag)
  }
  tag.setAttribute('href', href)
}

const absolute = (path) => {
  if (!path) return undefined
  return path.startsWith('http') ? path : `${company.siteUrl}${path}`
}

/**
 * Per-route document head: title, description, canonical, Open Graph / Twitter cards
 * and optional JSON-LD. The JSON-LD block is removed on unmount so a route never
 * inherits the previous page's structured data.
 */
export default function useSEO({ title, description, image, path, type = 'website', jsonLd }) {
  useEffect(() => {
    if (title) document.title = title

    const url = absolute(path ?? window.location.pathname)
    const img = absolute(image || company.ogImage)

    upsertMeta('description', description)
    upsertLink('canonical', url)

    upsertMeta('og:title', title, 'property')
    upsertMeta('og:description', description, 'property')
    upsertMeta('og:url', url, 'property')
    upsertMeta('og:type', type, 'property')
    upsertMeta('og:image', img, 'property')
    upsertMeta('og:site_name', company.name, 'property')

    upsertMeta('twitter:card', 'summary_large_image')
    upsertMeta('twitter:title', title)
    upsertMeta('twitter:description', description)
    upsertMeta('twitter:image', img)

    if (!jsonLd) return undefined

    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.textContent = JSON.stringify(jsonLd)
    document.head.appendChild(script)

    return () => script.remove()
  }, [title, description, image, path, type, jsonLd])
}
