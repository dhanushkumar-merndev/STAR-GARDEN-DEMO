import { useEffect } from 'react'

function setMeta(name, content, attr = 'name') {
  if (!content) return
  let tag = document.querySelector(`meta[${attr}="${name}"]`)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute(attr, name)
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', content)
}

export default function useSEO({ title, description, image }) {
  useEffect(() => {
    if (title) document.title = title
    setMeta('description', description)
    setMeta('og:title', title, 'property')
    setMeta('og:description', description, 'property')
    if (image) setMeta('og:image', image, 'property')
  }, [title, description, image])
}
