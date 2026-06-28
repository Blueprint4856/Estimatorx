import { Link } from "wouter";
import SiteFooter from "@/components/SiteFooter";

const EFFECTIVE = "June 5, 2026";
const CONTACT = "privacy@estimatorx.pro";
const DOMAIN = "https://estimatorx.pro";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-10">
      <h2 className="text-xl font-black font-serif uppercase mb-4 text-[#1A1A1A] border-l-4 border-[#E85D26] pl-4">{title}</h2>
      <div className="text-[#3A3530] leading-relaxed space-y-4">{children}</div>
    </div>
  );
}

export default function PrivacyPolicy() {
  return (
    <div className="min-h-[100dvh] bg-[#F7F4F0] text-[#1A1A1A]">

      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-[#E0DAD3] bg-white shadow-sm">
        <div className="container mx-auto px-4 h-20 flex items-center justify-between">
          <Link href="/">
            <img src="/logo.svg" alt="EstimatorX.pro Logo" className="h-16 object-contain" />
          </Link>
          <Link href="/" className="text-sm font-bold uppercase tracking-wider text-[#444] hover:text-[#E85D26] transition-colors">
            ← Back to Home
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-16 max-w-3xl">

        {/* Title block */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-[2px] bg-[#E85D26]" />
            <span className="text-[#E85D26] font-bold uppercase tracking-widest text-sm">Legal</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black font-serif uppercase mb-4">Privacy Policy</h1>
          <p className="text-[#888] text-sm">Effective Date: {EFFECTIVE} &nbsp;·&nbsp; <a href={DOMAIN} className="text-[#E85D26] hover:underline">{DOMAIN}</a></p>
        </div>

        <div className="bg-white border border-[#E0DAD3] p-8 md:p-12">

          <p className="text-[#3A3530] leading-relaxed mb-10">
            EstimatorX.pro ("we," "us," or "our") is committed to protecting your privacy. This Privacy Policy explains what information we collect, how we use it, and what rights you have regarding your data when you use our website and construction estimating application at <a href={DOMAIN} className="text-[#E85D26] hover:underline">{DOMAIN}</a>.
          </p>

          <Section title="1. Information We Collect">
            <p><strong>Account information.</strong> When you sign up, we collect your email address through our authentication provider (Clerk). We do not store passwords — all sign-ins use a one-time email code.</p>
            <p><strong>Estimate data.</strong> The estimates you create are stored in our database (PostgreSQL) and in your browser's local storage. This includes project dimensions, material quantities, labor rates, and any custom line items you enter.</p>
            <p><strong>Payment information.</strong> If you purchase a print credit ($0.99) or subscribe to the X Plan ($9.99/mo), payment is processed by Stripe. We do not store your credit card number, card number, or any payment credentials — Stripe handles all payment data under their own privacy policy.</p>
            <p><strong>Usage data.</strong> We may collect basic usage information such as pages visited, features used, and error logs to improve the application. This data is not sold or shared with third parties for advertising purposes.</p>
          </Section>

          <Section title="2. How We Use Your Information">
            <ul className="list-disc pl-6 space-y-2">
              <li>To create and manage your account</li>
              <li>To save, retrieve, and sync your estimates</li>
              <li>To process payments and manage your subscription</li>
              <li>To send transactional emails (e.g., one-time sign-in codes)</li>
              <li>To respond to support requests and feedback</li>
              <li>To improve and maintain the application</li>
            </ul>
            <p>We do not sell your personal data. We do not use your data for advertising or share it with marketing third parties.</p>
          </Section>

          <Section title="3. Third-Party Services">
            <p>We use the following third-party services to operate EstimatorX.pro:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Clerk</strong> — authentication and user account management (<a href="https://clerk.com/privacy" className="text-[#E85D26] hover:underline" target="_blank" rel="noopener noreferrer">clerk.com/privacy</a>)</li>
              <li><strong>Stripe</strong> — payment processing (<a href="https://stripe.com/privacy" className="text-[#E85D26] hover:underline" target="_blank" rel="noopener noreferrer">stripe.com/privacy</a>)</li>
              <li><strong>Replit</strong> — application hosting and infrastructure</li>
            </ul>
            <p>Each of these providers has their own privacy policy governing how they handle your data.</p>
          </Section>

          <Section title="4. Data Retention">
            <p>We retain your account and estimate data as long as your account remains active. If you delete your account, we will delete your personal data and stored estimates within 30 days, except where retention is required by law.</p>
            <p>Stripe retains payment records according to their own data retention policies and applicable financial regulations.</p>
          </Section>

          <Section title="5. Cookies and Local Storage">
            <p>EstimatorX.pro uses browser local storage to cache your estimate inputs between sessions. This data stays on your device and is not shared with third parties.</p>
            <p>We may use cookies to maintain your authenticated session. These are session-only cookies necessary for the application to function and are not used for tracking or advertising.</p>
          </Section>

          <Section title="6. Your Rights">
            <p>Depending on your location, you may have the right to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your account and data</li>
              <li>Object to or restrict certain processing activities</li>
            </ul>
            <p>To exercise any of these rights, contact us at <a href={`mailto:${CONTACT}`} className="text-[#E85D26] hover:underline">{CONTACT}</a>.</p>
          </Section>

          <Section title="7. Children's Privacy">
            <p>EstimatorX.pro is not intended for use by anyone under the age of 13. We do not knowingly collect personal information from children. If you believe a child has provided us with personal information, please contact us and we will promptly delete it.</p>
          </Section>

          <Section title="8. Security">
            <p>We take reasonable technical and organizational measures to protect your data, including encrypted connections (HTTPS), database access controls, and industry-standard authentication. No system is completely secure, and we cannot guarantee absolute security.</p>
          </Section>

          <Section title="9. Changes to This Policy">
            <p>We may update this Privacy Policy from time to time. When we make material changes, we will update the effective date at the top of this page. Continued use of the service after changes are posted constitutes your acceptance of the revised policy.</p>
          </Section>

          <Section title="10. Contact Us">
            <p>If you have questions or concerns about this Privacy Policy or how we handle your data, please contact us at:</p>
            <div className="bg-[#FAF8F5] border border-[#E0DAD3] p-4 mt-2">
              <p className="font-bold">EstimatorX.pro</p>
              <p><a href={`mailto:${CONTACT}`} className="text-[#E85D26] hover:underline">{CONTACT}</a></p>
              <p><a href={DOMAIN} className="text-[#E85D26] hover:underline">{DOMAIN}</a></p>
            </div>
          </Section>

        </div>

        <div className="mt-8 flex gap-6 text-sm text-[#888]">
          <Link href="/terms/" className="hover:text-[#E85D26] transition-colors">Terms of Use</Link>
          <Link href="/" className="hover:text-[#E85D26] transition-colors">Back to Home</Link>
        </div>

      </main>

      <SiteFooter />

    </div>
  );
}
