import PageHero from '../components/PageHero'
import Reveal from '../components/Reveal'
import Section from '../components/Section'
import useSEO from '../hooks/useSEO'
import { company } from '../data/content'

// Named Legal, not PrivacyPolicy — ad blockers match that filename and block the
// module request, which takes down the whole app in dev. Route stays /privacy-policy.
export default function Legal() {
  useSEO({
    title: 'Privacy Policy — Star Gardens',
    description: 'How Star Gardens handles information submitted through this website.',
    path: '/privacy-policy',
  })

  return (
    <>
      <PageHero
        eyebrow="Legal"
        title="Privacy Policy"
        crumbs={[{ label: 'Home', to: '/' }, { label: 'Privacy Policy' }]}
      />

      <Section width="narrow">
        <Reveal className="space-y-5 text-[0.9375rem] leading-relaxed text-forest-700">
          <p>
            Star Gardens respects your privacy. Any information you share through our contact form or by
            phone/email — such as your name, phone number, email address and enquiry details — is used
            solely to respond to your request for landscaping, plants-on-hire or maintenance services.
          </p>
          <p>
            The enquiry form on this website does not store anything. Submitting it opens WhatsApp (or
            your email client) on your own device with the details pre-filled, so the message is sent
            directly by you to {company.phone} — no copy is written to any server operated by this site.
          </p>
          <p>
            We do not sell, rent or share your personal information with third parties for marketing
            purposes.
          </p>
          <p>
            This site embeds a Google Maps frame on the contact page. Google may set its own cookies and
            collect usage data when that map loads; this is governed by Google&apos;s own privacy policy
            rather than ours.
          </p>
          <p>
            For any questions about how your information is handled, please contact us at{' '}
            <a
              href={`mailto:${company.email}`}
              className="font-semibold text-forest-900 underline underline-offset-2"
            >
              {company.email}
            </a>{' '}
            or call {company.phone}.
          </p>
        </Reveal>
      </Section>
    </>
  )
}
