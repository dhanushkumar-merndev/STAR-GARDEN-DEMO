import PageHero from '../components/PageHero'
import Reveal from '../components/Reveal'
import useSEO from '../hooks/useSEO'
import { company } from '../data/content'

export default function PrivacyPolicy() {
  useSEO({ title: 'Privacy Policy — Star Gardens', description: 'How Star Gardens handles information submitted through this website.' })

  return (
    <>
      <PageHero eyebrow="Legal" title="Privacy Policy" />
      <section className="mx-auto max-w-3xl px-5 py-20 lg:px-8">
        <Reveal className="space-y-5 text-sm leading-relaxed text-forest-700">
          <p>
            Star Gardens respects your privacy. Any information you share through our contact form or by
            phone/email — such as your name, phone number, email address and enquiry details — is used solely
            to respond to your request for landscaping, plants-on-hire or maintenance services.
          </p>
          <p>
            We do not sell, rent or share your personal information with third parties for marketing purposes.
            Enquiries submitted through this website are sent directly to {company.email} and are not stored
            on any server operated by this site.
          </p>
          <p>
            For any questions about how your information is handled, please contact us at{' '}
            <a href={`mailto:${company.email}`} className="font-semibold text-forest-900 underline">{company.email}</a>{' '}
            or call {company.phone}.
          </p>
        </Reveal>
      </section>
    </>
  )
}
