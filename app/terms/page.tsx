import Link from 'next/link'

export const metadata = { title: 'Terms & Conditions — Sundeas' }

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background py-16 px-4">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">← Back</Link>
          <h1 className="text-2xl font-bold mt-4">Terms & Conditions</h1>
          <p className="text-sm text-muted-foreground mt-1">Last updated: August 2026</p>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">1. Acceptance of terms</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            By accessing or using Sundeas you agree to be bound by these terms. If you do not agree,
            do not use the service.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">2. Not financial advice</h2>
          <p className="text-sm text-muted-foreground leading-relaxed font-medium text-foreground">
            Sundeas is a personal finance tracking and planning tool only. Nothing on Sundeas constitutes
            financial advice, investment advice, tax advice, or any other form of regulated financial guidance.
            All information, calculations, projections, and AI-generated content are provided for
            informational and educational purposes only.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You should always consult a qualified and regulated financial adviser before making any
            financial decisions. Sundeas accepts no responsibility for any financial decisions made
            based on information or outputs from this service.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">3. AI-generated content</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Sundeas uses artificial intelligence (Anthropic Claude) to generate summaries, suggestions,
            and projections. AI-generated content:
          </p>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>May be inaccurate, incomplete, or outdated</li>
            <li>Is not reviewed or verified by a financial professional</li>
            <li>Should never be relied upon as the sole basis for financial decisions</li>
            <li>Does not account for your full personal or financial circumstances</li>
          </ul>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We expressly disclaim all liability for any loss or damage arising from reliance on
            AI-generated content within Sundeas.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">4. Disclaimer of warranties</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Sundeas is provided "as is" and "as available" without any warranty of any kind, express
            or implied, including but not limited to warranties of merchantability, fitness for a
            particular purpose, or non-infringement. We do not warrant that the service will be
            uninterrupted, error-free, or free from inaccuracies.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">5. Limitation of liability</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            To the fullest extent permitted by law, Sundeas and its operators shall not be liable for
            any direct, indirect, incidental, consequential, or special damages arising from your use
            of or inability to use the service, including but not limited to:
          </p>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>Financial losses resulting from decisions made using Sundeas</li>
            <li>Inaccuracies in financial projections or calculations</li>
            <li>AI-generated content that is incorrect or misleading</li>
            <li>Loss of data or service interruptions</li>
            <li>Unauthorised access to your data</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">6. Your responsibilities</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You are solely responsible for the accuracy of data you enter into Sundeas and for any
            financial decisions you make. You must not use Sundeas for any unlawful purpose or
            attempt to circumvent any security measures.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">7. Third-party services</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Sundeas integrates with third-party services including Supabase, Anthropic, Trading 212,
            and Google. We are not responsible for the availability, accuracy, or conduct of these
            services. Your use of third-party integrations is subject to their respective terms.
            Trading 212 integration is read-only and does not allow any transactions or account changes.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">8. Changes to the service</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We reserve the right to modify, suspend, or discontinue the service at any time without notice.
            We may update these terms at any time. Continued use of Sundeas constitutes acceptance
            of updated terms.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">9. Governing law</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            These terms are governed by the laws of England and Wales. Any disputes shall be subject
            to the exclusive jurisdiction of the courts of England and Wales.
          </p>
        </section>

        <p className="text-sm text-muted-foreground pt-4 border-t border-border">
          Questions? Contact us at{' '}
          <a href="mailto:hello@sundeas.com" className="underline hover:text-foreground">hello@sundeas.com</a>
        </p>

        <div className="flex gap-4 text-sm text-muted-foreground">
          <Link href="/privacy" className="hover:text-foreground underline">Privacy Policy</Link>
        </div>
      </div>
    </div>
  )
}
