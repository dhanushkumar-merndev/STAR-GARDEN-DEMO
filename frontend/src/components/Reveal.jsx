import useInView from '../hooks/useInView'

/**
 * Scroll-reveal wrapper. Animates with plain CSS transitions on opacity/transform
 * only, so every frame stays on the compositor and no JS runs per frame.
 * `delay` is in milliseconds.
 */
export default function Reveal({
  children,
  as: Tag = 'div',
  delay = 0,
  className = '',
  style,
  ...rest
}) {
  const [ref, inView] = useInView()

  return (
    <Tag
      ref={ref}
      style={delay ? { ...style, transitionDelay: `${delay}ms` } : style}
      className={`sg-reveal${inView ? ' sg-reveal-in' : ''}${className ? ` ${className}` : ''}`}
      {...rest}
    >
      {children}
    </Tag>
  )
}
