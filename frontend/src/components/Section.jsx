const tones = {
  cream: '',
  muted: 'bg-forest-50/70',
  white: 'bg-white',
  dark: 'bg-forest-900',
  darker: 'bg-forest-950',
}

const sizes = {
  // One vertical rhythm for the whole site. Every section picks from this scale
  // rather than inventing its own py-* so the page cadence stays even.
  default: 'py-16 sm:py-20 lg:py-28',
  compact: 'py-12 sm:py-16 lg:py-20',
  tight: 'py-10 sm:py-12 lg:py-16',
  flush: '',
}

const widths = {
  default: 'max-w-7xl',
  wide: 'max-w-6xl',
  medium: 'max-w-5xl',
  narrow: 'max-w-3xl',
}

export default function Section({
  children,
  tone = 'cream',
  size = 'default',
  width = 'default',
  className = '',
  innerClassName = '',
  ...rest
}) {
  return (
    <section className={`${tones[tone]} ${sizes[size]} ${className}`.trim()} {...rest}>
      <div className={`mx-auto ${widths[width]} px-5 sm:px-6 lg:px-8 ${innerClassName}`.trim()}>
        {children}
      </div>
    </section>
  )
}
