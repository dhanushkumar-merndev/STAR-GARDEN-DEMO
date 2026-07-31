import * as Icons from 'lucide-react'

export default function Icon({ name, className = '', size = 24, strokeWidth = 1.75 }) {
  const Cmp = Icons[name] || Icons.Leaf
  return <Cmp className={className} size={size} strokeWidth={strokeWidth} />
}
