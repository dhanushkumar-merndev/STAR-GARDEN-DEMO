import Reveal from './Reveal'

/**
 * The eyebrow / title / body block that opens most sections. Centralised so the
 * type scale and the gap down to the section body are identical on every page.
 */
export default function SectionHeading({
  eyebrow,
  title,
  body,
  align = 'center',
  dark = false,
  className = '',
}) {
  const centered = align === 'center'

  return (
    <Reveal
      className={`${centered ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'} ${className}`.trim()}
    >
      {eyebrow && (
        <span
          className={`text-xs font-semibold uppercase tracking-[0.18em] ${
            dark ? 'text-gold-300' : 'text-gold-600'
          }`}
        >
          {eyebrow}
        </span>
      )}
      <h2
        className={`mt-3 text-balance font-display text-[1.75rem] font-semibold leading-[1.15] sm:text-4xl ${
          dark ? 'text-white' : 'text-forest-900'
        }`}
      >
        {title}
      </h2>
      {body && (
        <p
          className={`mt-4 text-pretty leading-relaxed ${
            dark ? 'text-forest-300' : 'text-forest-600'
          }`}
        >
          {body}
        </p>
      )}
    </Reveal>
  )
}
