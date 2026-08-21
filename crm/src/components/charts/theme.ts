/**
 * Chart theme (AGENTS.md §16).
 *
 * One place for every colour and axis style a chart uses, so four cards on the
 * dashboard read as one system instead of four separate drawings.
 *
 * The categorical palette below was validated, not chosen by eye: all five
 * slots sit inside the light-mode lightness band, clear the chroma floor, and
 * hold a worst all-pairs separation of ΔE 13.0 under simulated protanopia and
 * 16.3 under normal vision (OKLab ×100; the floors are 6 and 15). "All pairs"
 * rather than "adjacent" because a donut's slices get compared right across the
 * ring, not just against their neighbours.
 *
 * Yellow and magenta fall below 3:1 against white, which the method allows only
 * with relief — so every chart using them ships visible direct labels. Do not
 * drop those labels, and do not add a sixth slot without re-running the
 * validator: orange was the obvious next hue and it failed against both.
 */

/** Ink and line tokens, mirroring `globals.css` so charts match the chrome. */
export const CHART_INK = {
  primary: '#2c3530',
  muted: '#64706a',
  subtle: '#8b968f',
  line: '#e4e9e5',
  surface: '#ffffff',
} as const;

/** The brand green, used wherever a chart carries a single series. */
export const CHART_BRAND = {
  base: '#00713e',
  strong: '#00572e',
  soft: '#b0e2c0',
  wash: 'rgba(0, 113, 62, 0.12)',
} as const;

/**
 * Fixed categorical slots. Assign by entity and never by rank — a filter that
 * drops a category must not repaint the ones that remain.
 */
export const CHART_SERIES = ['#00713e', '#2a78d6', '#eda100', '#4a3aa7', '#e87ba4'] as const;

/** Lead sources are a closed enum, so each one owns a slot for good. */
export const SOURCE_COLORS: Record<string, string> = {
  MANUAL: CHART_SERIES[0],
  WEBSITE: CHART_SERIES[1],
  OTHER: CHART_SERIES[2],
  META_FACEBOOK: CHART_SERIES[3],
  META_INSTAGRAM: CHART_SERIES[4],
};

export function sourceColor(source: string, index: number): string {
  return SOURCE_COLORS[source] ?? CHART_SERIES[index % CHART_SERIES.length]!;
}

export const CHART_FONT =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/** Tooltip chrome shared by every chart. */
/**
 * `confine`, and deliberately not `appendToBody`.
 *
 * Appending to `<body>` escapes any clipping ancestor, but it also positions
 * the tooltip against the document — and a seven-row legend is wider than a
 * phone, so it spilled past the right edge and dragged the whole page into a
 * sideways scroll. `confine` keeps it inside the chart's own box, which is the
 * only box guaranteed to be on screen.
 *
 * The width cap and wrapping matter for the same reason: without them a long
 * series name sets the tooltip's width and it hangs off a narrow screen even
 * when confined.
 */
export const TOOLTIP_BASE = {
  backgroundColor: CHART_INK.surface,
  borderColor: CHART_INK.line,
  borderWidth: 1,
  confine: true,
  padding: [8, 10] as [number, number],
  textStyle: { color: CHART_INK.primary, fontSize: 12, fontFamily: CHART_FONT },
  extraCssText:
    'border-radius:10px;box-shadow:0 6px 20px rgba(16,32,24,0.10);max-width:min(18rem,78vw);white-space:normal;',
} as const;

export const AXIS_LABEL = {
  color: CHART_INK.muted,
  fontSize: 11,
  fontFamily: CHART_FONT,
} as const;
