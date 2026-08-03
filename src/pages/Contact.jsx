import { useState } from 'react'
import Icon from '../components/Icon'
import PageHero from '../components/PageHero'
import Reveal from '../components/Reveal'
import Section from '../components/Section'
import useSEO from '../hooks/useSEO'
import { company, media, services, breadcrumbJsonLd } from '../data/content'

const contactCards = [
  { icon: 'Phone', label: 'Mobile', value: company.phone, href: `tel:${company.phoneHref}` },
  { icon: 'PhoneCall', label: 'Landline', value: company.landline, href: `tel:${company.landlineHref}` },
  { icon: 'Mail', label: 'Email', value: company.email, href: `mailto:${company.email}` },
  { icon: 'ShoppingBag', label: 'Online Store', value: company.storeLabel, href: company.storeUrl },
]

const emptyForm = { name: '', phone: '', email: '', service: '', message: '' }

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

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const onSubmit = (e) => {
    e.preventDefault()

    // Filter the optional rows only — filtering the whole list would also drop the
    // '' spacers and run every line together.
    const details = [
      `Name: ${form.name}`,
      `Phone: ${form.phone}`,
      form.email ? `Email: ${form.email}` : null,
      form.service ? `Interested in: ${form.service}` : null,
    ].filter(Boolean)

    const text = ['New enquiry from stargardens.in', '', ...details, '', form.message].join('\n')

    // Opened in a new tab so the site stays put behind WhatsApp — the visitor comes
    // back to the confirmation panel rather than a blank history entry.
    window.open(
      `https://wa.me/${company.whatsappHref}?text=${encodeURIComponent(text)}`,
      '_blank',
      'noopener,noreferrer'
    )
    setSent(true)
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
                <span className="grid h-16 w-16 place-items-center rounded-2xl bg-[#25D366]/15 text-[#25D366]">
                  <Icon name="WhatsApp" size={32} />
                </span>
                <h2 className="mt-5 font-display text-2xl font-semibold text-forest-900">
                  Thank you, {form.name.split(' ')[0] || 'there'}!
                </h2>
                <p className="mx-auto mt-3 max-w-sm text-pretty text-sm leading-relaxed text-forest-600">
                  We&apos;ve opened WhatsApp with your enquiry pre-filled — just press send and it
                  reaches us directly. We usually reply within one working day, and a free site visit
                  can normally be arranged the same week.
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
                  Fill this in and we&apos;ll open WhatsApp with your details ready to send — no
                  account signup, nothing stored on this site.
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
                  <div className="sm:col-span-2">
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

                  <button
                    type="submit"
                    className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-[#25D366] px-6 py-3.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:brightness-105 sm:col-span-2"
                  >
                    <Icon name="WhatsApp" size={18} /> Send via WhatsApp
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
