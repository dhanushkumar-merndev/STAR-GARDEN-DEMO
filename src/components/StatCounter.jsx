import { useInView } from 'react-intersection-observer'
import useCountUp from '../hooks/useCountUp'

export default function StatCounter({ value, suffix = '', note, label, dark = false }) {
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.4 })
  const count = useCountUp(value, { start: inView, duration: 2000 })

  return (
    <div ref={ref} className="text-center">
      <div className={`font-display text-4xl font-semibold tabular-nums sm:text-5xl ${dark ? 'text-white' : 'text-forest-900'}`}>
        {count.toLocaleString('en-IN')}
        <span className={dark ? 'text-gold-300' : 'text-gold-500'}>{suffix}</span>
      </div>
      <p className={`mt-2 text-sm font-medium ${dark ? 'text-forest-200' : 'text-forest-600'}`}>{label}</p>
      {note && <p className={`text-xs ${dark ? 'text-forest-400' : 'text-forest-400'}`}>{note}</p>}
    </div>
  )
}
