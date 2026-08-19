import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon'
import PageHero from '../components/PageHero'
import Reveal from '../components/Reveal'
import Section from '../components/Section'
import TurnstileWidget from '../components/TurnstileWidget'
import useSEO from '../hooks/useSEO'
import { company, media, services, breadcrumbJsonLd } from '../data/content'

const contactCards = [
  { icon: 'Phone', label: 'Phone', value: company.phone, href: `tel:${company.phoneHref}` },
  {
    icon: 'WhatsApp',
    label: 'WhatsApp',
    value: company.phone,
    href: `https://wa.me/${company.whatsappHref}`,
  },
  { icon: 'Mail', label: 'Email', value: company.email, href: `mailto:${company.email}` },
  { icon: 'User', label: 'Contact Person', value: company.contactPerson, href: `tel:${company.phoneHref}` },
]

const emptyForm = {
  name: '',
  phone: '',
  email: '',
  city: '',
  service: '',
  message: '',
  companyWebsite: '',
  consent: false,
}

const enquiryEndpoint =
  import.meta.env.VITE_CRM_ENQUIRY_URL ||
  (import.meta.env.DEV ? 'http://localhost:3000/api/public/enquiry' : '')
const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || ''

export default function Contact() {
  useSEO({
    title: 'Contact Us — Star Gardens | Bangalore Landscaping & Plants on Hire',
    description: `Get in touch with Star Gardens for a free site visit — ${company.phone}, ${company.email}, or visit our head office in Srinivasa Nagar, Bengaluru.`,
    image: media.contactBanner,
    path: '/contact',
    jsonLd: breadcrumbJsonLd([
      { name: 'Home', path: '/' },
      { name: 'Contact Us', path: '/contact' },
    ]),
  })

  const [form, setForm] = useState(emptyForm)
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [turnstileToken, setTurnstileToken] = useState('')
  const [turnstileResetKey, setTurnstileResetKey] = useState(0)

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const verifyTurnstile = useCallback((token) => setTurnstileToken(token), [])
  const turnstileError = useCallback(
    () => setError('Human verification could not load. Please refresh and try again.'),
    []
  )

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (turnstileSiteKey && !turnstileToken) {
      setError('Please complete the human verification.')
      return
    }
    if (!enquiryEndpoint) {
      setError('The enquiry form is temporarily unavailable.')
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch(enquiryEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          mobile: form.phone,
          email: form.email || undefined,
          city: form.city || undefined,
          service: form.service || undefined,
          message: form.message,
          company_website: form.companyWebsite,
          turnstile_token: turnstileToken || undefined,
          consent: form.consent,
        }),
      })
      const result = await response.json().catch(() => ({}))

      if (!response.ok) {
        const fieldMessage = result.fields && Object.values(result.fields).flat().find(Boolean)
        throw new Error(fieldMessage || result.error || 'We could not send your enquiry.')
      }

      setSent(true)
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'We could not send your enquiry. Please try again.'
      )
      setTurnstileToken('')
      setTurnstileResetKey((key) => key + 1)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <PageHero
        eyebrow="Contact Us"
        title="Let's talk about your space"
        subtitle="Reach out for a free site visit, a maintenance quote, or just to ask what will grow best where you are."
        image={media.contactBanner}
        crumbs={[{ label: 'Home', to: '/' }, { label: 'Contact Us' }]}
      />

      <Section>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {contactCards.map((c, i) => (
            <Reveal
              key={c.label}
              delay={(i % 4) * 80}
              className="group rounded-2xl border border-forest-100 bg-white p-6 text-center shadow-sm transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-lg"
            >
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-forest-900 text-forest-200 transition-colors duration-300 group-hover:text-gold-300">
                <Icon name={c.icon} size={21} />
              </span>
              <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-forest-400">
                {c.label}
              </p>
              <a
                href={c.href}
                target={c.href.startsWith('http') ? '_blank' : undefined}
                rel="noreferrer"
                className="mt-1 block break-words font-display text-base font-semibold text-forest-900 transition hover:text-gold-600"
              >
                {c.value}
              </a>
            </Reveal>
          ))}
        </div>

        <div className="mt-12 grid gap-6 lg:mt-16 lg:grid-cols-5">
          {/* ── ENQUIRY FORM ─────────────────────────────────────────────── */}
          <Reveal className="rounded-3xl border border-forest-100 bg-white p-7 shadow-sm sm:p-8 lg:col-span-3">
            {sent ? (
              <div className="flex min-h-[26rem] flex-col items-center justify-center text-center">
                <span className="grid h-16 w-16 place-items-center rounded-2xl bg-forest-100 text-forest-800">
                  <Icon name="CircleCheck" size={32} />
                </span>
                <h2 className="mt-5 font-display text-2xl font-semibold text-forest-900">
                  Thank you, {form.name.split(' ')[0] || 'there'}!
                </h2>
                <p className="mx-auto mt-3 max-w-sm text-pretty text-sm leading-relaxed text-forest-600">
                  Your enquiry has been saved securely. Our team can now see it in the CRM and will
                  normally contact you within one working day.
                </p>
                <p className="mt-4 text-sm text-forest-500">
                  In a hurry? Call{' '}
                  <a
                    href={`tel:${company.phoneHref}`}
                    className="font-semibold text-forest-800 underline underline-offset-2"
                  >
                    {company.phone}
                  </a>
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSent(false)
                    setForm(emptyForm)
                    setTurnstileToken('')
                    setTurnstileResetKey((key) => key + 1)
                  }}
                  className="mt-7 inline-flex items-center gap-2 rounded-full border border-forest-200 px-5 py-2.5 text-sm font-semibold text-forest-700 transition hover:bg-forest-50"
                >
                  <Icon name="ArrowLeft" size={15} /> Send another enquiry
                </button>
              </div>
            ) : (
              <>
                <h2 className="font-display text-2xl font-semibold text-forest-900">Send an enquiry</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-forest-500">
                  Fill this in and your enquiry will go directly to our team. No account is needed.
                </p>

                <form onSubmit={onSubmit} className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="name" className="text-xs font-semibold text-forest-600">
                      Name <span className="text-gold-600">*</span>
                    </label>
                    <input
                      id="name"
                      required
                      autoComplete="name"
                      value={form.name}
                      onChange={update('name')}
                      className="mt-1.5 w-full rounded-xl border border-forest-200 px-4 py-2.5 text-sm outline-none transition focus:border-forest-500"
                      placeholder="Your name"
                    />
                  </div>
                  <div>
                    <label htmlFor="phone" className="text-xs font-semibold text-forest-600">
                      Phone <span className="text-gold-600">*</span>
                    </label>
                    <input
                      id="phone"
                      required
                      type="tel"
                      autoComplete="tel"
                      value={form.phone}
                      onChange={update('phone')}
                      className="mt-1.5 w-full rounded-xl border border-forest-200 px-4 py-2.5 text-sm outline-none transition focus:border-forest-500"
                      placeholder="+91 ..."
                    />
                  </div>
                  <div>
                    <label htmlFor="email" className="text-xs font-semibold text-forest-600">
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      value={form.email}
                      onChange={update('email')}
                      className="mt-1.5 w-full rounded-xl border border-forest-200 px-4 py-2.5 text-sm outline-none transition focus:border-forest-500"
                      placeholder="you@example.com"
                    />
                  </div>
                  <div>
                    <label htmlFor="city" className="text-xs font-semibold text-forest-600">
                      Area or locality
                    </label>
                    <input
                      id="city"
                      autoComplete="address-level2"
                      value={form.city}
                      onChange={update('city')}
                      className="mt-1.5 w-full rounded-xl border border-forest-200 px-4 py-2.5 text-sm outline-none transition focus:border-forest-500"
                      placeholder="Whitefield, Bengaluru"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="service" className="text-xs font-semibold text-forest-600">
                      Interested In
                    </label>
                    <select
                      id="service"
                      value={form.service}
                      onChange={update('service')}
                      className="mt-1.5 w-full rounded-xl border border-forest-200 bg-white px-4 py-2.5 text-sm text-forest-800 outline-none transition focus:border-forest-500"
                    >
                      <option value="">Select a service…</option>
                      {services.map((s) => (
                        <option key={s.slug} value={s.name}>
                          {s.name}
                        </option>
                      ))}
                      <option value="Something else">Something else</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="message" className="text-xs font-semibold text-forest-600">
                      Message <span className="text-gold-600">*</span>
                    </label>
                    <textarea
                      id="message"
                      required
                      rows={4}
                      value={form.message}
                      onChange={update('message')}
                      className="mt-1.5 w-full resize-y rounded-xl border border-forest-200 px-4 py-2.5 text-sm outline-none transition focus:border-forest-500"
                      placeholder="Tell us about your space — size, location, and what you have in mind..."
                    />
                  </div>

                  <div className="absolute -left-[9999px]" aria-hidden="true">
                    <label htmlFor="company-website">Company website</label>
                    <input
                      id="company-website"
                      tabIndex={-1}
                      autoComplete="off"
                      value={form.companyWebsite}
                      onChange={update('companyWebsite')}
                    />
                  </div>

                  <label className="flex items-start gap-3 text-xs leading-relaxed text-forest-600 sm:col-span-2">
                    <input
                      type="checkbox"
                      required
                      checked={form.consent}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, consent: event.target.checked }))
                      }
                      className="mt-0.5 h-4 w-4 shrink-0 accent-forest-800"
                    />
                    <span>
                      I agree that Star Gardens may use these details to respond to my enquiry, as
                      explained in the{' '}
                      <Link to="/privacy-policy" className="font-semibold underline underline-offset-2">
                        Privacy Policy
                      </Link>
                      .
                    </span>
                  </label>

                  <div className="sm:col-span-2">
                    <TurnstileWidget
                      siteKey={turnstileSiteKey}
                      onVerify={verifyTurnstile}
                      onError={turnstileError}
                      resetKey={turnstileResetKey}
                    />
                  </div>

                  {error && (
                    <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 sm:col-span-2">
                      {error} You can also call us on {company.phone}.
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting || (turnstileSiteKey && !turnstileToken)}
                    className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-forest-900 px-6 py-3.5 text-sm font-semibold text-cream transition hover:-translate-y-0.5 hover:bg-forest-800 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 sm:col-span-2"
                  >
                    <Icon name="Send" size={18} /> {submitting ? 'Sending…' : 'Send enquiry'}
                  </button>

                  <p className="text-center text-xs text-forest-400 sm:col-span-2">
                    Prefer email? Write to{' '}
                    <a
                      href={`mailto:${company.email}`}
                      className="font-semibold text-forest-600 underline underline-offset-2"
                    >
                      {company.email}
                    </a>
                  </p>
                </form>
              </>
            )}
          </Reveal>

          {/* ── DETAILS + MAP ────────────────────────────────────────────── */}
          <Reveal delay={120} className="space-y-6 lg:col-span-2">
            <div className="rounded-3xl border border-forest-100 bg-white p-7 shadow-sm">
              <h2 className="font-display text-lg font-semibold text-forest-900">Head Office</h2>
              {/* div, not p — <address> is flow content and cannot nest inside <p>. */}
              <div className="mt-2 flex items-start gap-2.5 text-sm leading-relaxed text-forest-600">
                <Icon name="MapPin" size={18} className="mt-0.5 shrink-0 text-gold-600" />
                <address className="not-italic">{company.headOffice}</address>
              </div>

              <h2 className="mt-5 font-display text-lg font-semibold text-forest-900">
                Wholesale Nursery
              </h2>
              <p className="mt-2 flex items-start gap-2.5 text-sm leading-relaxed text-forest-600">
                <Icon name="Sprout" size={18} className="mt-0.5 shrink-0 text-gold-600" />
                {company.wholesaleNursery}
              </p>

              <h2 className="mt-5 font-display text-lg font-semibold text-forest-900">
                Contact Person
              </h2>
              <p className="mt-2 flex items-center gap-2.5 text-sm text-forest-600">
                <Icon name="User" size={18} className="shrink-0 text-gold-600" />
                {company.contactPerson}
              </p>

              <a
                href={`https://wa.me/${company.whatsappHref}`}
                target="_blank"
                rel="noreferrer"
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-forest-900 px-5 py-3 text-sm font-semibold text-cream transition hover:bg-forest-800"
              >
                <Icon name="WhatsApp" size={17} /> Chat with us now
              </a>
            </div>

            <div className="overflow-hidden rounded-3xl border border-forest-100 shadow-sm">
              <iframe
                title="Star Gardens head office location on Google Maps"
                className="h-72 w-full"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                src={`https://www.google.com/maps?q=${encodeURIComponent(company.headOffice)}&output=embed`}
              />
            </div>
          </Reveal>
        </div>
      </Section>
    </>
  )
}
