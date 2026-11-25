import type { ReactNode } from 'react';
import { SiteFooter, SiteHeader, SiteLink } from './SiteChrome';
import { PAGE_META } from './siteMeta';
import { useSeo } from './siteNav';
import './site.css';

// ---------------------------------------------------------------------------
// Public legal pages: Terms, Privacy, Refunds, Data deletion and Contact.
// Every company detail lives in LEGAL so a change (address, grievance officer,
// court city) is one edit. Empty values are left out of the pages rather than
// shown as blanks.
// ---------------------------------------------------------------------------
export const LEGAL = {
  company: 'Whatcha Solutions',
  product: 'Whatcha WhatsApp Business Automation',
  website: 'https://whatcha.co.za',
  supportEmail: 'hello@whatcha.co.za',
  privacyEmail: 'kgupi@whatcha.co.za',
  phone: '072 893 2456',
  phoneHref: 'tel:+27728932456',
  whatsappHref: 'https://wa.me/27728932456',
  /** Registered office, one line. Shown only when filled in. */
  address: 'Johannesburg, South Africa',
  /** Grievance / Information Officer */
  grievanceName: 'Information Officer',
  grievanceEmail: 'kgupi@whatcha.co.za',
  /** City whose courts hear disputes. */
  courtsCity: 'Johannesburg, Republic of South Africa',
  updated: '25 November 2026',
};

const courts = LEGAL.courtsCity ? `the competent courts of ${LEGAL.courtsCity}` : 'the competent courts in South Africa';
const mail = (to: string) => <a href={`mailto:${to}`}>{to}</a>;

const DOCS = [
  { route: '/terms', label: 'Terms' },
  { route: '/privacy', label: 'Privacy' },
  { route: '/refund', label: 'Refunds' },
  { route: '/data-deletion', label: 'Data deletion' },
  { route: '/contact', label: 'Contact' },
] as const;

function LegalLayout({ route, title, children }: { route: Exclude<(typeof DOCS)[number]['route'], '/contact'>; title: string; children: ReactNode }) {
  // Also reached as #/privacy (older links, Meta's app settings): the
  // canonical address is the path.
  useSeo(PAGE_META.get(route));
  return (
    <div className="lp-legal-page">
      <SiteHeader compact />
      <main className="lp-legal-main">
        <div className="lp-legal-container">
          <div className="lp-legal-nav">
            <SiteLink href="/" className="lp-legal-back">
              <span className="material-icons">arrow_back</span>
              Back to Home
            </SiteLink>
            <nav className="lp-legal-tabs" aria-label="Legal documents">
              {DOCS.map((d) => (
                <SiteLink key={d.route} href={d.route} className={`lp-legal-tab${d.route === route ? ' active' : ''}`} aria-current={d.route === route ? 'page' : undefined}>
                  {d.label}
                </SiteLink>
              ))}
            </nav>
          </div>

          <article className="lp-legal-article">
            <h1>{title}</h1>
            <p className="lp-legal-date">Last updated: {LEGAL.updated}</p>
            {children}
          </article>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

export function GrievanceBlock() {
  return (
    <div className="lp-legal-box">
      <p><strong>Grievance Officer</strong></p>
      <p>
        {LEGAL.grievanceName ? <>{LEGAL.grievanceName}, </> : null}
        {LEGAL.company}
        <br />
        Email: {mail(LEGAL.grievanceEmail)}
        <br />
        Phone: <a href={LEGAL.phoneHref}>{LEGAL.phone}</a>
        {LEGAL.address ? (
          <>
            <br />
            Address: {LEGAL.address}
          </>
        ) : null}
      </p>
      <p>We acknowledge a complaint within 24 hours and resolve it within 15 days of receiving it.</p>
    </div>
  );
}

// Who processes data for us. Keep this in step with the "data processors"
// answer in the Meta app's Data Handling Questions.
const PROCESSORS = [
  { name: 'Meta Platforms, Inc. and Meta Platforms Ireland Ltd.', service: 'WhatsApp Business Platform, Messenger, Instagram, Marketing API, Commerce Manager and Facebook Login', where: 'Worldwide (Meta data centres)' },
  { name: 'Cloud Hosting & Infrastructure Partners', service: 'Application servers, API hosting and compute', where: 'South Africa, Europe and Worldwide' },
  { name: 'Supabase, Inc.', service: 'Secure database, authentication and session management', where: 'European Union (Stockholm)' },
  { name: 'BunnyWay d.o.o. (bunny.net)', service: 'Storage and delivery of encrypted media files (images, documents, audio, video)', where: 'Content delivery network worldwide' },
  { name: 'OpenStreetMap Foundation & Map Providers', service: 'Address lookup, geocoding and map visualisations for shared locations', where: 'United Kingdom and European Union' },
  { name: 'Secure Payment Gateway Partners', service: 'Online payment processing for subscription plans', where: 'South Africa and International' },
  { name: 'Business Email & Communication Providers', service: 'Business email and operational notices', where: 'European Union, United States' },
];

// ------------------------------------------------------------------ terms --
export function TermsPage() {
  return (
    <LegalLayout route="/terms" title="Terms and Conditions">
      <section>
        <p>
          These Terms and Conditions (“Terms”) are an agreement between you and {LEGAL.company} (“{LEGAL.company}”, “we”, “us”)
          for the use of {LEGAL.product}, the website {LEGAL.website} and related services (together, the “Service”).
          By creating an account, starting a free trial or paying for a plan, you accept these Terms and our{' '}
          <a href="/privacy">Privacy Policy</a>. If you accept on behalf of a business, you confirm you are authorised to bind it.
        </p>
      </section>

      <section>
        <h2>1. The Service</h2>
        <p>
          The Service is software you use in your web browser. It connects to the official WhatsApp Business Platform (Cloud API) and,
          where your plan includes them, Instagram, Facebook Messenger, Meta ads and Meta catalogs. It provides a shared inbox, contacts,
          message templates, campaigns, chatbot flows, catalog and order tools, and reports.
        </p>
        <p>
          The Service is for businesses. You must be at least 18 years old and use it for trade, business or professional purposes.
        </p>
      </section>

      <section>
        <h2>2. Your account</h2>
        <ul>
          <li>Give accurate sign-up details and keep them up to date.</li>
          <li>Keep your password private. You are responsible for everything done through your account and your team members’ accounts.</li>
          <li>Tell us at once at {mail(LEGAL.supportEmail)} if you think your account has been used without permission.</li>
        </ul>
      </section>

      <section>
        <h2>3. Meta, WhatsApp and other third-party services</h2>
        <p>
          WhatsApp, Instagram, Messenger, Meta ads and catalogs are provided by Meta Platforms, Inc. and its affiliates (“Meta”), not by us.
          By connecting them you also accept Meta’s terms, including the WhatsApp Business Terms of Service, the WhatsApp Business Messaging Policy,
          the WhatsApp Commerce Policy, Meta’s Advertising Standards and the Meta Platform Terms.
        </p>
        <ul>
          <li>Meta decides whether to approve your WhatsApp Business Account, display name, phone number and message templates, and may limit, restrict or ban them. We cannot reverse Meta’s decisions.</li>
          <li>
            Meta charges for WhatsApp messages (for example marketing, utility and authentication messages) and for ads. Meta bills these
            directly to the payment method in your Meta account. They are not part of our plan price and we do not collect them. See{' '}
            <a href="/meta-whatsapp-pricing.pdf" target="_blank" rel="noopener noreferrer">Meta’s current rates</a>.
          </li>
          <li>We are not responsible for outages, changes or limits in Meta’s or other third-party services, but we will work to keep the Service compatible with them.</li>
        </ul>
      </section>

      <section>
        <h2>4. Your customers and your content</h2>
        <p>
          You control the personal information of your own customers and contacts that you bring into or receive through the Service (contacts, messages, orders and similar).
          Under the Protection of Personal Information Act, 2013 (POPIA), you are the Responsible Party and we process such information as an Operator on your behalf, solely to run the Service for you. You agree to:
        </p>
        <ul>
          <li>Message only people who have opted in to hear from your business on WhatsApp, Instagram or Messenger, and respect every opt-out promptly in compliance with POPIA and the Consumer Protection Act (CPA).</li>
          <li>Have a lawful basis and justification, and give any required privacy notice, for the personal information you upload or collect.</li>
          <li>Make sure your messages, templates, products, ads and files are lawful and that you hold all required rights and permissions to use them.</li>
        </ul>
      </section>

      <section>
        <h2>5. Acceptable use</h2>
        <p>You must not use the Service to:</p>
        <ul>
          <li>Send spam, unsolicited bulk messages, or messages to bought or scraped lists.</li>
          <li>Offer goods or services that WhatsApp’s Commerce Policy or the laws of the Republic of South Africa prohibit (for example illegal substances, weapons, unlicensed financial schemes, adult content or counterfeit goods).</li>
          <li>Send content that is fraudulent, misleading, defamatory, hateful, harassing, obscene or that infringes someone else’s intellectual property or privacy rights.</li>
          <li>Break into, overload, scan, reverse-engineer or disrupt the Service, or attempt to access another customer’s data.</li>
          <li>Resell, sublicense or share unauthorized access to the Service without our written permission.</li>
        </ul>
      </section>

      <section>
        <h2>6. Plans, pricing, currency and billing</h2>
        <ul>
          <li><strong>Currency & VAT:</strong> All subscription prices are quoted in South African Rand (ZAR) and exclude Value Added Tax (VAT), unless explicitly stated otherwise.</li>
          <li><strong>Subscriptions:</strong> Standard plans include Starter (Black Friday R149/mo; Suggested Normal R249/mo), Basic (Black Friday R299/mo; Suggested Normal R399/mo), Pro (Black Friday R499/mo; Suggested Normal R699/mo), and Premium (Black Friday R699/mo; Suggested Normal R999/mo), paid in advance for monthly, quarterly or annual periods.</li>
          <li><strong>Free trial:</strong> A new account gets 7 days of Premium features from the moment it signs up. No credit card is needed.</li>
          <li><strong>Meta WhatsApp message charges:</strong> Meta charges separately for template and service messages delivered through the WhatsApp Business Cloud API. These fees are billed directly by Meta to your payment method registered in Meta Business Manager and are not included in Whatcha plan fees.</li>
          <li><strong>After the trial or a plan ends:</strong> When a plan is not renewed, your data is preserved, and the account transitions to the Starter plan limits. Features included in higher tiers unlock again upon subscription.</li>
          <li><strong>No automatic surprise renewal:</strong> We do not charge recurring subscriptions automatically without clear consent. You renew before the billing period ends to ensure uninterrupted service.</li>
          <li><strong>Upgrades:</strong> You can upgrade at any time. The unused prorated value of your current plan is credited toward the new tier.</li>
          <li><strong>Refunds:</strong> See our <a href="/refund">Refund and Cancellation Policy</a>.</li>
        </ul>
      </section>

      <section>
        <h2>7. Setup & Additional Services</h2>
        <ul>
          <li><strong>Standard Black Friday activation:</strong> No setup or onboarding fee (R0). Includes self-service onboarding access and setup documentation.</li>
          <li><strong>Optional assisted configuration:</strong> Available at R499 once-off. Includes guided setup of enquiry menus, operational hours, and standard automated reply templates.</li>
          <li><strong>Advanced configuration:</strong> Suggested from R999 once-off, tailored for organisations requiring complex multi-step workflows, custom WhatsApp Flows, and multi-staff routing.</li>
          <li><strong>Custom integrations:</strong> Integrations with bespoke databases, ERPs, or internal systems are scoped and quoted separately.</li>
        </ul>
      </section>

      <section>
        <h2>8. Scope of Base Packages & Excluded Core Systems</h2>
        <p>
          Whatcha subscription packages (including Whatcha 360 Industry Packages) provide communication, messaging automation, and workflow routing tools built on the WhatsApp Business API.
        </p>
        <ul>
          <li><strong>Included:</strong> Business WhatsApp configuration, enquiry menus, standard forms, approved automated replies, follow-up notifications, self-service onboarding, and access to the web management dashboard.</li>
          <li><strong>Excluded from base subscriptions:</strong> Custom transactional databases, live financial accounting records, staff attendance and payroll management, real-time dynamic inventory synchronization, complex multi-tier ticketing systems, and third-party software integrations (ERP, LMS, CRM, accounting suites) unless separately quoted and contracted in writing.</li>
        </ul>
      </section>

      <section>
        <h2>9. Operational Safeguards & Client Disclaimers</h2>
        <p>
          Clients operate their WhatsApp Business account subject to Meta's Business Messaging Policies, the Protection of Personal Information Act (POPIA), and sector-specific legislation.
        </p>
        <ul>
          <li>The Service provides automated messaging templates and workflow triggers. Whatcha does not exercise editorial control over your business communications.</li>
          <li><strong>Academic decisions:</strong> Educational institutions (schools, colleges, training providers) retain sole responsibility for admissions decisions, fee structures, academic records, and disciplinary determinations.</li>
          <li><strong>Financial & legal calculations:</strong> Debt counsellors, financial intermediaries, and property managers retain sole responsibility for statutory notices, debt restructuring calculations, interest assessments, and legal compliance.</li>
          <li><strong>Emergency dispatch:</strong> The Service is not an emergency response system. Medical practices, security providers, and facility teams must not use automated messaging as a substitute for dedicated 24/7 emergency dispatch.</li>
          <li><strong>Statutory notices:</strong> Formal legal, court, or statutory service notices must be served through recognized legal mechanisms, not solely via informal messaging automations.</li>
        </ul>
      </section>

      <section>
        <h2>10. Features in development</h2>
        <p>
          Features marked “Soon”, “Beta” or similar are not part of any plan yet. We may change or withdraw them, and they come without any commitment on availability.
        </p>
      </section>

      <section>
        <h2>11. Our intellectual property</h2>
        <p>
          We own the Service, its software, design and brand. We give you a limited, non-exclusive, non-transferable right to use it during your plan.
          You keep all rights in your content; you allow us to store, process and transmit it only as needed to provide the Service.
          If you send us suggestions, we may use them without any obligation to you.
        </p>
      </section>

      <section>
        <h2>12. Suspension and termination</h2>
        <ul>
          <li>You can stop using the Service at any time and ask us to delete your account (see <a href="/data-deletion">Data deletion</a>).</li>
          <li>We may suspend or close an account that breaks these Terms or Meta’s policies, puts other customers or the Service at risk, or where the law requires it. Where reasonable, we warn you first and give you a chance to fix the problem.</li>
          <li>If we close your account without a breach on your part, we refund the unused part of your current paid period.</li>
          <li>After closure we delete your data as described in our <a href="/privacy">Privacy Policy</a>.</li>
        </ul>
      </section>

      <section>
        <h2>13. Availability and disclaimers</h2>
        <p>
          We work to keep the Service available and secure, but we provide it “as is” and “as available”. We do not promise that it will be
          uninterrupted or error-free, that every message will be delivered, or that it will produce any particular business result.
          Message delivery depends on Meta, mobile networks and the recipient’s device.
        </p>
      </section>

      <section>
        <h2>14. Limitation of liability</h2>
        <p>
          To the extent permitted by South African law (including the Consumer Protection Act, 2008), we are not liable for indirect, special or consequential losses, such as lost profits, revenue, data or goodwill,
          or for actions taken by Meta or other third-party providers. Our total aggregate liability for any claim connected with the Service is limited to the
          fees you paid us in the 12 months preceding the event that gave rise to the claim.
        </p>
      </section>

      <section>
        <h2>15. Indemnity</h2>
        <p>
          You agree to indemnify and hold harmless {LEGAL.company}, its officers, and employees against claims, regulatory penalties, damages and legal costs arising from your content, your messages to your customers, or your breach of these
          Terms, POPIA, Meta’s policies, or applicable laws.
        </p>
      </section>

      <section>
        <h2>16. Governing law and disputes</h2>
        <p>
          These Terms are governed by and construed in accordance with the laws of the Republic of South Africa. We will first endeavor in good faith to resolve any dispute through amicable consultation. If that fails, {courts} shall
          have exclusive jurisdiction.
        </p>
      </section>

      <section>
        <h2>17. Changes to these Terms</h2>
        <p>
          We may update these Terms. For significant changes we tell you by email or in the CRM at least 15 days before they apply.
          Continuing to use the Service after that means you accept the new Terms.
        </p>
      </section>

      <section>
        <h2>18. Contact & Information Officer</h2>
        <p>
          Questions about these Terms or operational safeguards: {mail(LEGAL.supportEmail)} or <a href={LEGAL.phoneHref}>{LEGAL.phone}</a>.
        </p>
        <GrievanceBlock />
      </section>
    </LegalLayout>
  );
}

// ---------------------------------------------------------------- privacy --
export function PrivacyPage() {
  return (
    <LegalLayout route="/privacy" title="Privacy Policy">
      <section>
        <p>
          This policy explains what personal information {LEGAL.company} (“we”, “us”) processes through {LEGAL.product} and {LEGAL.website}
          (the “Service”), why, who we share it with, how long we keep it, and the choices you have. It is drafted to comply with the Republic of South Africa’s
          Protection of Personal Information Act, 2013 (POPIA), the Electronic Communications and Transactions Act, 2002 (ECTA), the Promotion of Access to Information Act, 2000 (PAIA), and the Meta Platform Terms.
        </p>
      </section>

      <section>
        <h2>1. Our roles under POPIA</h2>
        <ul>
          <li><strong>For your business account</strong> (the business that registers and its authorised users), we decide how account administration data is used. We act as the Responsible Party under POPIA.</li>
          <li><strong>For your customers’ communications data</strong> (the individuals and leads your business messages), your business is the Responsible Party that determines the purpose and means of processing. We process this personal information strictly as an Operator on your behalf and upon your instructions.</li>
        </ul>
      </section>

      <section>
        <h2>2. Data we collect</h2>
        <ul>
          <li><strong>Account data:</strong> your name, business name, business category, email, phone number, password (stored only as a one-way hash), and your team members’ names, emails and roles.</li>
          <li><strong>Google sign-in:</strong> if you choose “Continue with Google”, your name and email address from your Google account.</li>
          <li><strong>Billing data:</strong> the plan, period, amount, and Razorpay order and payment IDs. Card, UPI and bank details are entered on Razorpay’s checkout and are never sent to or stored by us.</li>
          <li>
            <strong>Data from Meta (Platform Data), only for the parts you connect:</strong>
            <ul>
              <li>WhatsApp: WhatsApp Business Account ID, phone number ID, display name, business profile, message templates and their status, quality and messaging limits, and an access token.</li>
              <li>Instagram and Messenger: Page and Instagram account IDs, names, usernames and profile pictures, and an access token.</li>
              <li>Ads: ad account IDs, campaigns, ad sets, ads, budgets and performance figures, and an access token.</li>
              <li>Catalog: catalog ID and name, the products in it, and an access token.</li>
              <li>Facebook Login: your Meta user ID, name and the permissions you granted.</li>
            </ul>
          </li>
          <li><strong>Your customers’ data, processed for you:</strong> names, phone numbers, WhatsApp, Instagram or Messenger profile names and IDs, messages, photos, documents, audio and video, shared locations, orders, form and chatbot answers, tags and notes your team adds.</li>
          <li><strong>Technical data:</strong> IP address, browser and device type, and server logs of requests and errors.</li>
          <li><strong>Demo bookings:</strong> the name, email, phone and time you give when you book a demo.</li>
        </ul>
      </section>

      <section>
        <h2>3. How we use it</h2>
        <ul>
          <li>To create and secure your account and let you and your team sign in.</li>
          <li>To provide the features you use: send and receive messages, show your inbox, run campaigns and chatbot flows, sync your catalog, show orders and reports, and manage ads you create through the Service.</li>
          <li>To turn a customer’s shared map pin into a readable delivery address and map image.</li>
          <li>To take payment for plans, show your billing history and remind you before a plan ends.</li>
          <li>To give support, fix problems, prevent abuse and keep the Service secure.</li>
          <li>To meet legal, tax and accounting duties.</li>
        </ul>
        <p>We do not:</p>
        <ul>
          <li>sell or rent personal data, or share it with data brokers;</li>
          <li>use Platform Data or your customers’ messages for our own advertising, profiling or to build audiences;</li>
          <li>use your customers’ messages to train artificial-intelligence models;</li>
          <li>read your conversations, except when you ask us for support or the law requires it.</li>
        </ul>
        <p>We use data received from Meta only to provide the features you turned on, and in line with the Meta Platform Terms and Developer Policies.</p>
      </section>

      <section>
        <h2>4. Legal basis</h2>
        <p>
          We process account data because it is needed to provide the Service you signed up for, with your consent, and to meet legal duties.
          You can withdraw consent at any time by deleting your account; this does not affect processing that already took place.
          For your customers’ data, your business is responsible for having their consent and for giving them notice.
        </p>
      </section>

      <section>
        <h2>5. Who we share data with</h2>
        <p>We share data only with the service providers below, only as much as each needs, and under contracts that require them to protect it.</p>
        <div className="lp-legal-table-wrap">
          <table className="lp-legal-table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>What they do for us</th>
                <th>Where data is processed</th>
              </tr>
            </thead>
            <tbody>
              {PROCESSORS.map((p) => (
                <tr key={p.name}>
                  <td>{p.name}</td>
                  <td>{p.service}</td>
                  <td>{p.where}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Our providers’ staff may access systems remotely, for example for support, from the country where the company is based.
          We may also disclose data when the law requires it (see section 10), or to a buyer if our business is sold, under this same policy.
        </p>
      </section>

      <section>
        <h2>6. Where data is stored & cross-border transfers</h2>
        <p>
          Our application servers, database infrastructure, and content delivery networks operate across secure enterprise facilities (including Europe and South Africa).
          Where personal information is transferred outside the Republic of South Africa, we ensure that transfers comply with Section 72 of the Protection of Personal Information Act (POPIA),
          ensuring the recipient is subject to a law, binding corporate rules, or binding agreement that provides an adequate level of protection effectively equivalent to POPIA.
        </p>
      </section>

      <section>
        <h2>7. How long we keep it</h2>
        <ul>
          <li>Account data, chats, contacts, media and catalog data: while your account is open. You can delete chats, contacts, products and media in the CRM at any time.</li>
          <li>When you delete your account, or ask us to: we delete your account and everything it holds within 30 days, including stored Meta access tokens and media files.</li>
          <li>Access tokens: deleted as soon as you disconnect the channel, ad account or catalog in the CRM.</li>
          <li>Database backups: removed when the backup cycle overwrites them, normally within 30 days.</li>
          <li>Billing records: kept as long as South African tax and corporate governance laws require (5 years under the Tax Administration Act, 2011).</li>
          <li>Server logs: kept only for security and troubleshooting, normally no longer than 90 days.</li>
        </ul>
      </section>

      <section>
        <h2>8. Deleting your data</h2>
        <p>
          See <a href="/data-deletion">Data deletion instructions</a> for how to delete your account, disconnect Meta, and how your customers
          can ask for their data to be deleted.
        </p>
      </section>

      <section>
        <h2>9. Security</h2>
        <ul>
          <li>All traffic to the Service and to Meta is encrypted with HTTPS (TLS).</li>
          <li>Meta access tokens are kept only on our servers and are never shown in the browser after you connect. Channel, ads and catalog tokens are encrypted with AES-256-GCM before they are stored.</li>
          <li>Every business’s data is kept separate, and team members only see what their role allows.</li>
          <li>Passwords are stored only as salted hashes.</li>
          <li>Access to production systems is limited to authorized technical personnel.</li>
        </ul>
        <p>No system is completely infallible. If a security compromise affects personal information, we will notify affected data subjects and the Information Regulator of South Africa as required by Section 22 of POPIA.</p>
      </section>

      <section>
        <h2>10. Requests from government and public authorities</h2>
        <p>If a public authority asks us for personal data, we:</p>
        <ul>
          <li>check that the request is lawful and properly made;</li>
          <li>challenge requests we consider unlawful or too broad;</li>
          <li>disclose only the minimum data needed to answer it;</li>
          <li>keep a record of each request, our response and the legal reasoning;</li>
          <li>tell the affected business, unless the law forbids it.</li>
        </ul>
      </section>

      <section>
        <h2>11. Cookies and browser storage</h2>
        <p>
          The Service stores your sign-in session and a few preferences in your browser’s local storage. When you connect Meta, pay through
          our secure payment gateway or sign in with Google, those providers’ own windows may set their cookies, under their own policies.
        </p>
        <p>
          <strong>Advertising measurement (Meta Pixel).</strong> Our public website pages (the home page, pricing and other website pages,
          log in and sign-up) use the Meta Pixel. It tells Meta (Facebook and Instagram) which of these pages were visited and whether someone
          booked a demo, sent the contact form or signed up, so we can measure our ads and show them to people likely to be interested. Meta may
          set cookies for this, under its own{' '}
          <a href="https://www.facebook.com/privacy/policy/" target="_blank" rel="noopener noreferrer">Privacy Policy</a>. The Pixel is not
          used inside the CRM or the admin panel, so nothing your business or your customers do in the CRM is sent to Meta this way. You can
          limit ad personalisation in your Facebook or Instagram ad settings, or block the Pixel with your browser’s tracking protection.
        </p>
      </section>

      <section>
        <h2>12. Your rights under POPIA</h2>
        <p>Under POPIA, data subjects have the right to:</p>
        <ul>
          <li>request confirmation of whether we hold personal information about you;</li>
          <li>request a copy or description of personal information held;</li>
          <li>request the correction, destruction, or deletion of personal information that is inaccurate, irrelevant, excessive, or unlawfully obtained;</li>
          <li>object on reasonable grounds to the processing of personal information;</li>
          <li>lodge a complaint with the Information Regulator of South Africa.</li>
        </ul>
        <p>
          Email {mail(LEGAL.privacyEmail)} from your account’s email address. We reply within 30 days. If you are not satisfied with our answer,
          you may lodge a complaint with the Information Regulator of South Africa:
          <br />
          <strong>The Information Regulator (South Africa)</strong>
          <br />
          JD House, 27 Stiemens Street, Braamfontein, Johannesburg, 2001
          <br />
          Email: <a href="mailto:POPIAComplaints@inforegulator.org.za">POPIAComplaints@inforegulator.org.za</a> / <a href="mailto:enquiries@inforegulator.org.za">enquiries@inforegulator.org.za</a>
        </p>
      </section>

      <section>
        <h2>13. Children</h2>
        <p>The Service is for businesses and is not meant for anyone under 18. We do not knowingly collect children’s data.</p>
      </section>

      <section>
        <h2>14. Changes to this policy</h2>
        <p>
          We will post any change here and update the date above. For significant changes we also tell account owners by email or in the CRM before they apply.
        </p>
      </section>

      <section>
        <h2>15. Contact</h2>
        <p>
          {LEGAL.company}
          {LEGAL.address ? <>, {LEGAL.address}</> : null}
          <br />
          Privacy questions: {mail(LEGAL.privacyEmail)}
        </p>
        <GrievanceBlock />
      </section>
    </LegalLayout>
  );
}

// ----------------------------------------------------------------- refund --
export function RefundPage() {
  return (
    <LegalLayout route="/refund" title="Refund and Cancellation Policy">
      <section>
        <h2>1. Try before you pay</h2>
        <p>
          Every new account gets a 7-day free trial with Premium features (up to 5 message templates and 3 campaigns during the trial) and no card required, so you can check that the Service fits your
          business before paying.
        </p>
      </section>

      <section>
        <h2>2. Cancellation</h2>
        <p>
          Plans are paid in advance for one period (monthly, quarterly or annual) and never renew automatically, so there is no subscription to
          cancel and no future charge. If you do not renew, your plan stays active until its end date; after that only the Starter plan's features stay open until you buy a plan.
          Your data stays in your account.
        </p>
      </section>

      <section>
        <h2>3. When we refund</h2>
        <p>Plan fees are not refunded for unused days or for a change of mind after payment, except in these cases:</p>
        <ul>
          <li><strong>Duplicate payment:</strong> you were charged twice for the same purchase. We refund the extra payment in full.</li>
          <li><strong>Plan not activated:</strong> money was debited but the plan did not start within 24 hours. We activate it or refund in full, as you prefer.</li>
          <li><strong>Account closed by us without a breach on your part:</strong> we refund the unused part of the current paid period.</li>
        </ul>
        <p>
          When you upgrade, the unused value of your current plan is credited against the new one at checkout. It is not paid out separately.
        </p>
      </section>

      <section>
        <h2>4. Charges we do not collect</h2>
        <p>
          WhatsApp message charges and ad spend are billed by Meta to your Meta account, not by us. We cannot refund them; contact Meta through
          WhatsApp Manager or Meta Business Support.
        </p>
      </section>

      <section>
        <h2>5. How to ask for a refund</h2>
        <ul>
          <li>Email {mail(LEGAL.supportEmail)} within 7 days of the payment, from your account’s email address.</li>
          <li>Include your business name and the Razorpay payment ID (it is on your Razorpay receipt and in Billing in the CRM).</li>
          <li>We reply within 2 working days. An approved refund goes back to the original payment method through Razorpay, and normally reaches you within 5 to 7 working days, depending on your bank.</li>
        </ul>
      </section>
    </LegalLayout>
  );
}

// ---------------------------------------------------------- data deletion --
export function DataDeletionPage() {
  return (
    <LegalLayout route="/data-deletion" title="Data Deletion Instructions">
      <section>
        <h2>1. Delete your account and all its data</h2>
        <ol className="lp-legal-steps">
          <li>Email {mail(LEGAL.privacyEmail)} from the email address you sign in with, with the subject “Delete my account”.</li>
          <li>Include your business name. We may ask you to confirm the request so that no one else can delete your account.</li>
          <li>Within 30 days we delete the account and everything it holds: team members, chats and messages, contacts, media files, products and categories, chatbot flows, orders, campaigns, and all stored Meta access tokens. We email you when it is done.</li>
        </ol>
        <p>We keep only the billing records that tax and accounting laws require us to keep.</p>
      </section>

      <section>
        <h2>2. Remove only data from Meta</h2>
        <ul>
          <li><strong>In the CRM:</strong> disconnecting Instagram, Messenger, an ad account or a catalog deletes the access token we stored for it straight away.</li>
          <li>
            <strong>On Facebook:</strong> go to Settings and privacy → Settings → Business integrations (or Apps and websites), find {LEGAL.company},
            and select Remove. Our access ends immediately. Then email {mail(LEGAL.privacyEmail)} if you also want us to delete the data we already received.
          </li>
          <li>
            <strong>WhatsApp:</strong> in Meta Business Suite go to Settings → Accounts → WhatsApp accounts → Partners and remove {LEGAL.company},
            then email us to delete the stored data.
          </li>
        </ul>
      </section>

      <section>
        <h2>3. If you messaged a business that uses our Service</h2>
        <p>
          The business you messaged controls your conversation with it. Ask that business to delete your data; it can delete your chat and contact
          in the CRM. If you cannot reach it, email {mail(LEGAL.privacyEmail)} with the business name and your phone number, and we will pass your
          request on and help it act on it.
        </p>
      </section>

      <section>
        <h2>4. Questions</h2>
        <p>
          Email {mail(LEGAL.privacyEmail)}. See our <a href="/privacy">Privacy Policy</a> for what we keep and for how long.
        </p>
      </section>
    </LegalLayout>
  );
}
