import { useState } from 'react'
import Icon from '../components/Icon'
import PageHero from '../components/PageHero'
import Reveal from '../components/Reveal'
import useSEO from '../hooks/useSEO'
import { company, media } from '../data/content'

const contactCards = [
  { icon: 'Phone', label: 'Mobile', value: company.phone, href: `tel:${company.phoneHref}` },
  { icon: 'PhoneCall', label: 'Landline', value: company.landline, href: `tel:${company.landlineHref}` },
  { icon: 'Mail', label: 'Email', value: company.email, href: `mailto:${company.email}` },
  { icon: 'ShoppingBag', label: 'Online Store', value: company.storeLabel, href: company.storeUrl },
]

export default function Contact() {
  useSEO({
    title: 'Contact Us — Star Gardens | Bangalore Landscaping & Plants on Hire',
    description: `Get in touch with Star Gardens for a free site visit — ${company.phone}, ${company.email}, or visit our head office in Srinivasa Nagar, Bengaluru.`,
    image: media.contactBanner,
  })

  const [form, setForm] = useState({ name: '', phone: '', email: '', service: '', message: '' })

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const mailtoHref = () => {
    const subject = encodeURIComponent(`Enquiry from ${form.name || 'website visitor'}`)
    const body = encodeURIComponent(
      `Name: ${form.name}\nPhone: ${form.phone}\nEmail: ${form.email}\nInterested in: ${form.service}\n\nMessage:\n${form.message}`
    )
    return `mailto:${company.email}?subject=${subject}&body=${body}`
  }

  const onSubmit = (e) => {
    e.preventDefault()
    window.location.href = mailtoHref()
  }

  return (
    <>
      <PageHero
        eyebrow="Contact Us"
        title="Let's talk about your space"
        subtitle="Reach out for a free site visit, a maintenance quote, or just to ask what will grow best where you are."
        image={media.contactBanner}
      />

      <section className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {contactCards.map((c) => (
            <Reveal key={c.label} className="rounded-2xl border border-forest-100 bg-white p-6 text-center shadow-sm">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-forest-800 text-gold-300">
                <Icon name={c.icon} size={22} />
              </span>
              <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-forest-400">{c.label}</p>
              <a href={c.href} target={c.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="mt-1 block break-words font-display text-base font-semibold text-forest-900 hover:text-gold-600">
                {c.value}
              </a>
            </Reveal>
          ))}
        </div>

        <div className="mt-14 grid gap-10 lg:grid-cols-5">
          <Reveal className="lg:col-span-3 rounded-3xl border border-forest-100 bg-white p-8 shadow-sm">
            <h2 className="font-display text-2xl font-semibold text-forest-900">Send an enquiry</h2>
            <p className="mt-1 text-sm text-forest-500">
              This opens a pre-filled email to {company.email} via your mail app — no data is stored on this site.
            </p>
            <form onSubmit={onSubmit} className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-1">
                <label className="text-xs font-semibold text-forest-600">Name</label>
                <input required value={form.name} onChange={update('name')} className="mt-1.5 w-full rounded-xl border border-forest-200 px-4 py-2.5 text-sm outline-none focus:border-forest-500" placeholder="Your name" />
              </div>
              <div className="sm:col-span-1">
                <label className="text-xs font-semibold text-forest-600">Phone</label>
                <input required value={form.phone} onChange={update('phone')} className="mt-1.5 w-full rounded-xl border border-forest-200 px-4 py-2.5 text-sm outline-none focus:border-forest-500" placeholder="+91 ..." />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-forest-600">Email</label>
                <input type="email" value={form.email} onChange={update('email')} className="mt-1.5 w-full rounded-xl border border-forest-200 px-4 py-2.5 text-sm outline-none focus:border-forest-500" placeholder="you@example.com" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-forest-600">Interested In</label>
                <input value={form.service} onChange={update('service')} className="mt-1.5 w-full rounded-xl border border-forest-200 px-4 py-2.5 text-sm outline-none focus:border-forest-500" placeholder="e.g. Terrace garden, Office plants..." />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-forest-600">Message</label>
                <textarea required value={form.message} onChange={update('message')} rows={4} className="mt-1.5 w-full rounded-xl border border-forest-200 px-4 py-2.5 text-sm outline-none focus:border-forest-500" placeholder="Tell us about your space..." />
              </div>
              <button type="submit" className="sm:col-span-2 mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-gold-400 px-6 py-3.5 text-sm font-semibold text-forest-950 transition hover:bg-gold-300">
                <Icon name="Send" size={16} /> Send Enquiry
              </button>
            </form>
          </Reveal>

          <Reveal delay={0.1} className="lg:col-span-2 space-y-6">
            <div className="rounded-3xl border border-forest-100 bg-white p-7 shadow-sm">
              <h3 className="font-display text-lg font-semibold text-forest-900">Head Office</h3>
              <p className="mt-2 flex items-start gap-2 text-sm leading-relaxed text-forest-600">
                <Icon name="MapPin" size={18} className="mt-0.5 shrink-0 text-gold-600" /> {company.headOffice}
              </p>
              <h3 className="mt-5 font-display text-lg font-semibold text-forest-900">Wholesale Nursery</h3>
              <p className="mt-2 flex items-start gap-2 text-sm leading-relaxed text-forest-600">
                <Icon name="Sprout" size={18} className="mt-0.5 shrink-0 text-gold-600" /> {company.wholesaleNursery}
              </p>
              <h3 className="mt-5 font-display text-lg font-semibold text-forest-900">Contact Person</h3>
              <p className="mt-2 flex items-center gap-2 text-sm text-forest-600">
                <Icon name="User" size={18} className="text-gold-600" /> {company.contactPerson}
              </p>
            </div>

            <div className="overflow-hidden rounded-3xl border border-forest-100 shadow-sm">
              <iframe
                title="Star Gardens Head Office Location"
                className="h-72 w-full"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                src={`https://www.google.com/maps?q=${encodeURIComponent(company.headOffice)}&output=embed`}
              />
            </div>
          </Reveal>
        </div>
      </section>
    </>
  )
}
