import Link from 'next/link'

export const metadata = { title: 'Privacy Policy — Sundeas' }

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background py-16 px-4">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">← Back</Link>
          <h1 className="text-2xl font-bold mt-4">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground mt-1">Last updated: August 2026</p>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">1. Who we are</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Sundeas is a personal finance and retirement planning tool operated as a private application.
            By using Sundeas you agree to this policy.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">2. What data we collect</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We collect only what is necessary to provide the service:
          </p>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>Your Google account email and name (via Google OAuth sign-in)</li>
            <li>Financial data you manually enter (account balances, budgets, goals)</li>
            <li>Bank connection data if you connect external accounts</li>
            <li>Usage data such as page visits and feature interactions</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">3. How we use your data</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your data is used solely to provide the Sundeas service — displaying your financial overview,
            calculating retirement projections, and generating AI-assisted summaries. We do not sell,
            share, or use your data for advertising purposes.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">4. AI and third-party services</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Sundeas uses Anthropic's Claude AI to generate financial summaries and suggestions.
            Relevant financial data may be sent to Anthropic's API to generate responses.
            Anthropic's data handling is governed by their own privacy policy.
            We also use Supabase for data storage and authentication, and Resend for email delivery.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">5. Data storage and security</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your data is stored securely on Supabase infrastructure with row-level security enforced.
            Only you can access your own data. We use industry-standard encryption in transit and at rest.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">6. Data retention and deletion</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You may request deletion of your account and all associated data at any time by contacting us.
            Upon deletion, all personal data is permanently removed from our systems within 30 days.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">7. Your rights</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You have the right to access, correct, export, or delete your data at any time.
            To exercise these rights, use the backup export feature within the app or contact us directly.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">8. Changes to this policy</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We may update this policy from time to time. Continued use of Sundeas after changes
            constitutes acceptance of the updated policy.
          </p>
        </section>

        <p className="text-sm text-muted-foreground pt-4 border-t border-border">
          Questions? Contact us at{' '}
          <a href="mailto:hello@sundeas.com" className="underline hover:text-foreground">hello@sundeas.com</a>
        </p>

        <div className="flex gap-4 text-sm text-muted-foreground">
          <Link href="/terms" className="hover:text-foreground underline">Terms & Conditions</Link>
        </div>
      </div>
    </div>
  )
}
