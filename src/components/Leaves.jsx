// Decorative, purely-CSS/SVG botanical accents — no external images needed.
export function LeafBlob({ className = '' }) {
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M45.6,-58.3C58.5,-49.6,68.1,-34.6,71.9,-18.2C75.7,-1.7,73.7,16.2,65.6,30.6C57.6,45,43.6,55.9,27.9,63.1C12.2,70.3,-5.2,73.8,-21.6,70.1C-38,66.5,-53.4,55.7,-63.1,41.1C-72.8,26.6,-76.8,8.3,-73.9,-8.4C-71,-25.1,-61.2,-40.2,-48,-49.3C-34.7,-58.4,-17.4,-61.5,0.7,-62.4C18.7,-63.3,33.3,-62.1,45.6,-58.3Z"
        transform="translate(100 100)"
      />
    </svg>
  )
}

export function LeafSprig({ className = '' }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" fill="none">
      <path d="M32 60V20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M32 30C20 26 12 16 12 4C26 6 34 16 32 30Z" fill="currentColor" opacity="0.85" />
      <path d="M32 42C44 38 52 28 52 16C38 18 30 28 32 42Z" fill="currentColor" opacity="0.6" />
    </svg>
  )
}

export function FieldPattern({ className = '' }) {
  return (
    <svg viewBox="0 0 400 100" className={className} aria-hidden="true" preserveAspectRatio="none">
      <path d="M0 100 C 50 40, 100 90, 150 50 S 250 20, 300 60 S 380 30, 400 55 L 400 100 Z" fill="currentColor" />
    </svg>
  )
}
