import useInView from '../hooks/useInView'
import useCountUp from '../hooks/useCountUp'

export default function StatCounter({ value, suffix = '', note, label, dark = false }) {
  const [ref, inView] = useInView({ threshold: 0.4, rootMargin: '0px' })
  const count = useCountUp(value, { start: inView, duration: 1800 })

  return (
    <div ref={ref} className="text-center">
      <div
        className={`font-display text-3xl font-semibold tabular-nums sm:text-4xl lg:text-[2.75rem] ${
          dark ? 'text-white' : 'text-forest-900'
        }`}
      >
        {count.toLocaleString('en-IN')}
        <span className={dark ? 'text-gold-300' : 'text-gold-500'}>{suffix}</span>
      </div>
      <p className={`mt-2 text-sm font-medium ${dark ? 'text-forest-200' : 'text-forest-700'}`}>
        {label}
      </p>
      {note && <p className={`mt-0.5 text-xs ${dark ? 'text-forest-400' : 'text-forest-400'}`}>{note}</p>}
    </div>
  )
}
