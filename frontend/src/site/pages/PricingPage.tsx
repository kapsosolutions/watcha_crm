// /pricing: the plan cards (shared with the landing page and the CRM), a
// full comparison built from crm/plans.ts LIMITS, and billing questions.
import { Fragment, useState } from 'react';
import { CtaBand, PageHero, SiteLink, SitePage } from '../SiteChrome';
import { PAGE_META } from '../siteMeta';
import { CycleToggle, MessageChargesLink, PlanCards } from '../../crm/components/PlanCards';
import { BuyNowSvg } from '../../crm/components/TemplateIcons';
import { LIMITS, SETUP_SERVICES, TIER_NAMES, TIER_ORDER, TRIAL_DAYS, TRIAL_LIMITS, kindsOf, type BillingCycle } from '../../crm/plans';
import type { PlanFeature, PlanTierKey } from '../../crm/types';
import { WHATCHA_360_SOLUTIONS } from '../content/solutions';
import { FaqList, Section } from './parts';

type Cell = boolean | string;
type Row = { label: string; cell: (t: PlanTierKey) => Cell };

const has = (f: PlanFeature) => (t: PlanTierKey) => LIMITS[t].features.includes(f);
const count = (v: number | null, unit = '') => (v === null ? 'Unlimited' : `${v.toLocaleString('en-ZA')}${unit}`);

const ROWS: { group: string; rows: Row[] }[] = [
  {
    group: 'WhatsApp CRM',
    rows: [
      { label: 'Team inbox on the official WhatsApp Business API', cell: has('chats') },
      { label: 'Contacts', cell: (t) => count(LIMITS[t].contacts) },
      { label: 'Your own WhatsApp number', cell: () => true },
      { label: 'Free service messages from Meta', cell: () => '1,000 a month' },
    ],
  },
  {
    group: 'Templates',
    rows: [
      { label: 'Message templates', cell: (t) => count(LIMITS[t].templates) },
      { label: 'Standard templates (text, media, buttons)', cell: (t) => kindsOf(LIMITS[t]).includes('standard') },
      { label: 'Carousel templates', cell: (t) => kindsOf(LIMITS[t]).includes('carousel') },
      { label: 'Limited-time offer templates', cell: (t) => kindsOf(LIMITS[t]).includes('lto') },
      { label: 'Authentication (OTP) templates', cell: (t) => LIMITS[t].authTemplates },
    ],
  },
  {
    group: 'Campaigns',
    rows: [
      { label: 'Campaigns a month (broadcast & drip)', cell: (t) => count(LIMITS[t].campaignsPerMonth) },
      { label: 'Sending speed', cell: (t) => `${LIMITS[t].sendRate} messages / second` },
    ],
  },
  {
    group: 'Automation',
    rows: [
      { label: 'Journeys & keyword replies (chatbot)', cell: has('journeys') },
      { label: 'WhatsApp Flows (native forms)', cell: has('flows') },
    ],
  },
  {
    group: 'In the chat',
    rows: [
      { label: 'WhatsApp calls', cell: has('calls') },
      { label: 'Polls', cell: has('polls') },
      { label: 'Events', cell: has('events') },
    ],
  },
  {
    group: 'Sell & book',
    rows: [
      { label: 'Catalog & categories', cell: has('catalog') },
      { label: 'Offers', cell: has('offers') },
      { label: 'Members (doctors, stylists, rooms…) & their slots', cell: has('members') },
      { label: 'Orders & appointments (bookings)', cell: has('orders') },
      { label: 'WhatsApp Pay configuration', cell: has('payment-config') },
    ],
  },
  {
    group: 'Channels & ads',
    rows: [
      { label: 'Instagram & Messenger', cell: has('instagram') },
      { label: 'Click-to-WhatsApp ads & lead forms', cell: has('ads') },
      { label: 'Create: Facebook & Instagram posts', cell: has('create') },
    ],
  },
  {
    group: 'Developers',
    rows: [
      { label: 'API keys: messaging, OTP, catalog & members', cell: has('api') },
      { label: 'Bookings API (book & cancel slots)', cell: (t) => has('api')(t) && has('orders')(t) },
      { label: 'Website keys for your web pages', cell: has('api') },
    ],
  },
  {
    group: 'Support',
    rows: [
      { label: 'Help by WhatsApp, phone and email', cell: () => true },
      { label: 'Priority support', cell: (t) => t === 'premium' },
    ],
  },
];

function CellView({ v }: { v: Cell }) {
  if (v === true) return <span className="yes" aria-label="Included">✓</span>;
  if (v === false) return <span className="no" aria-label="Not included">—</span>;
  return <>{v}</>;
}

const FAQS = [
  { q: 'Is there a free trial?', a: `Yes. Every new account gets ${TRIAL_DAYS} days with every feature of every plan, with up to ${TRIAL_LIMITS.templates} templates and ${TRIAL_LIMITS.campaigns} campaigns during the trial. No card is needed to start.` },
  { q: 'What happens when the trial ends?', a: 'Your data is kept. Without a plan, only the Starter features stay open; the rest unlock again when you buy a plan that includes them.' },
  { q: 'Do plans renew automatically?', a: 'No. You pay for a month, a quarter or a year in advance, and we never charge you again on our own. Renew before the period ends to continue without a break.' },
  { q: 'How do I pay?', a: 'Online via secure card payment (Visa, Mastercard), Instant EFT, and electronic payments. All prices are in South African Rand (ZAR) excluding VAT.' },
  { q: 'Are WhatsApp message charges included?', a: 'No. Subscriptions exclude Meta WhatsApp message fees. Meta charges each delivered message directly to your WhatsApp Business Account payment method, at its published rates. Every number gets 1,000 free service conversations each month from Meta.' },
  { q: 'Is there a setup fee?', a: 'Standard Black Friday activation has NO setup or onboarding fee (R0). If you would like our specialists to handle menu configuration and templates for you, optional assisted configuration is available for R499 once-off, or advanced configuration from R999 once-off.' },
  { q: 'Can I change my plan?', a: 'You can upgrade at any time. A lower plan can be bought once your current paid period has ended.' },
  { q: 'Can I get a refund?', a: 'See our Refund and Cancellation Policy for when refunds apply.' },
];

export function PricingPage() {
  const [cycle, setCycle] = useState<BillingCycle>('quarterly');
  const [selectedSector, setSelectedSector] = useState<string>('all');

  const filteredSolutions = selectedSector === 'all'
    ? WHATCHA_360_SOLUTIONS
    : WHATCHA_360_SOLUTIONS.filter((s) => s.sector === selectedSector);

  const sectors: { key: string; label: string; count: number }[] = [
    { key: 'all', label: 'All Solutions', count: WHATCHA_360_SOLUTIONS.length },
    { key: 'Business, Manufacturing & Trade', label: 'Business & Trade', count: WHATCHA_360_SOLUTIONS.filter((s) => s.sector === 'Business, Manufacturing & Trade').length },
    { key: 'Education & Training', label: 'Education & Training', count: WHATCHA_360_SOLUTIONS.filter((s) => s.sector === 'Education & Training').length },
    { key: 'Property & Facilities', label: 'Property & Facilities', count: WHATCHA_360_SOLUTIONS.filter((s) => s.sector === 'Property & Facilities').length },
    { key: 'Professional & Membership Services', label: 'Professional Services', count: WHATCHA_360_SOLUTIONS.filter((s) => s.sector === 'Professional & Membership Services').length },
  ];

  return (
    <SitePage meta={PAGE_META.get('/pricing')}>
      {(openDemo) => (
        <>
          <PageHero
            eyebrow="Pricing"
            title={<>Simple plans, <em>no setup fee</em></>}
            sub={`Official WhatsApp Business API automation from R149 a month (was R249). Unlimited contacts on every plan. Start with a ${TRIAL_DAYS}-day free trial of every feature.`}
          />
          <section className="lp-pricing-section sx-pricing" id="plans">
            <div className="lp-pricing-container">
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#dc2626', color: '#fff', padding: '6px 14px', borderRadius: '20px', fontWeight: 700, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  🔥 Limited-Time Black Friday Subscription Deals
                </span>
              </div>
              <div className="lp-pricing-banner">
                <div className="lp-pricing-banner-text">
                  Every plan starts with a <span className="lp-pricing-banner-link">{TRIAL_DAYS}-day free trial</span> of every feature · up to ~25% off with annual billing
                </div>
                <CycleToggle value={cycle} onChange={setCycle} />
              </div>
              <PlanCards
                cycle={cycle}
                action={(plan) => (
                  <>
                    <a href="/#/register" className="lp-plan-try-btn" style={{ backgroundColor: plan.buttonColor }}>
                      Start {TRIAL_DAYS}-day free trial
                    </a>
                    <a href="/#/register" className="lp-plan-buy-link">
                      <BuyNowSvg width={16} height={16} stroke="currentColor" />
                      <span>Buy now</span>
                    </a>
                  </>
                )}
              />
              <div className="sx-pricing-charges">
                All prices are in ZAR, excluding VAT. Meta’s WhatsApp message charges are billed directly by Meta. <MessageChargesLink />
              </div>
            </div>
          </section>

          {/* ---------- Setup & Additional Services (PDF Page 7) ---------- */}
          <Section title="Setup & Additional Services" sub="Transparent pricing with zero hidden fees." tint>
            <div className="sx-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
              <div className="sx-card" style={{ padding: '24px', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                <div style={{ display: 'inline-block', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 700, marginBottom: '12px' }}>
                  LIMITED OFFER
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 8px 0', color: '#0f172a' }}>{SETUP_SERVICES.standardActivation.name}</h3>
                <div style={{ fontSize: '28px', fontWeight: 800, color: '#16a34a', marginBottom: '8px' }}>R0</div>
                <p style={{ fontSize: '14px', color: '#64748b', lineHeight: 1.5, margin: 0 }}>
                  No setup or onboarding fee during Black Friday. Includes self-service onboarding, full documentation, and instant Meta API connection.
                </p>
              </div>

              <div className="sx-card" style={{ padding: '24px', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                <div style={{ display: 'inline-block', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 700, marginBottom: '12px' }}>
                  OPTIONAL
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 8px 0', color: '#0f172a' }}>{SETUP_SERVICES.assistedConfig.name}</h3>
                <div style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>R499 <span style={{ fontSize: '14px', fontWeight: 500, color: '#64748b' }}>once-off</span></div>
                <p style={{ fontSize: '14px', color: '#64748b', lineHeight: 1.5, margin: 0 }}>
                  Assisted configuration of your enquiry menu, operating hours, and standard automated reply templates by our WhatsApp experts.
                </p>
              </div>

              <div className="sx-card" style={{ padding: '24px', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                <div style={{ display: 'inline-block', background: '#fdf2f8', color: '#db2777', border: '1px solid #fbcfe8', padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 700, marginBottom: '12px' }}>
                  ADVANCED
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 8px 0', color: '#0f172a' }}>{SETUP_SERVICES.advancedConfig.name}</h3>
                <div style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>from R999 <span style={{ fontSize: '14px', fontWeight: 500, color: '#64748b' }}>once-off</span></div>
                <p style={{ fontSize: '14px', color: '#64748b', lineHeight: 1.5, margin: 0 }}>
                  Tailored configuration for complex multi-step journeys, custom WhatsApp Flows forms, and multi-agent team routing.
                </p>
              </div>

              <div className="sx-card" style={{ padding: '24px', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                <div style={{ display: 'inline-block', background: '#f8fafc', color: '#475569', border: '1px solid #cbd5e1', padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 700, marginBottom: '12px' }}>
                  ENTERPRISE
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 8px 0', color: '#0f172a' }}>{SETUP_SERVICES.customIntegrations.name}</h3>
                <div style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>Quoted</div>
                <p style={{ fontSize: '14px', color: '#64748b', lineHeight: 1.5, margin: 0 }}>
                  Custom integrations with bespoke databases, accounting software, ERP, LMS, or internal enterprise platforms.
                </p>
              </div>
            </div>
          </Section>

          {/* ---------- Whatcha 360 Industry Solutions Catalogue ---------- */}
          <Section title="Whatcha Solutions 360" sub="Specialised WhatsApp automation packages tailored for 17 South African industries." id="solutions-360">
            {/* Sector Selector Tabs */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '32px' }}>
              {sectors.map((sec) => (
                <button
                  key={sec.key}
                  type="button"
                  onClick={() => setSelectedSector(sec.key)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '20px',
                    border: '1px solid',
                    borderColor: selectedSector === sec.key ? '#0cbc04' : '#cbd5e1',
                    background: selectedSector === sec.key ? '#0cbc04' : '#ffffff',
                    color: selectedSector === sec.key ? '#ffffff' : '#475569',
                    fontWeight: 600,
                    fontSize: '13.5px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {sec.label} ({sec.count})
                </button>
              ))}
            </div>

            {/* 360 Grid */}
            <div className="sx-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
              {filteredSolutions.map((sol) => (
                <div
                  key={sol.id}
                  style={{
                    background: '#ffffff',
                    borderRadius: '16px',
                    border: '1px solid #e2e8f0',
                    padding: '24px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                      <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', margin: 0 }}>{sol.name}</h3>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#055b02', background: '#f0fbf0', border: '1px solid #bbf7d0', padding: '2px 8px', borderRadius: '12px' }}>
                        {sol.sector.split(',')[0]}
                      </span>
                    </div>
                    <p style={{ fontSize: '13.5px', color: '#64748b', lineHeight: 1.5, margin: '0 0 18px 0' }}>{sol.summary}</p>
                  </div>

                  {/* 3-Tier Pricing Breakdown */}
                  <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '14px', border: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
                      Monthly Black Friday Tiers (excl. VAT)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', textAlign: 'center' }}>
                      <div style={{ background: '#ffffff', padding: '10px 6px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 600 }}>Starter</div>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: '#0cbc04' }}>R{sol.pricing.starter.blackFriday}</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', textDecoration: 'line-through' }}>R{sol.pricing.starter.normal}</div>
                      </div>
                      <div style={{ background: '#ffffff', padding: '10px 6px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 600 }}>Growth</div>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: '#0cbc04' }}>R{sol.pricing.growth.blackFriday}</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', textDecoration: 'line-through' }}>R{sol.pricing.growth.normal}</div>
                      </div>
                      <div style={{ background: '#ffffff', padding: '10px 6px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 600 }}>Premium</div>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: '#0cbc04' }}>R{sol.pricing.premium.blackFriday}</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', textDecoration: 'line-through' }}>R{sol.pricing.premium.normal}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Understanding 360 Packages Explainer Box */}
            <div style={{ marginTop: '36px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '28px' }}>
              <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', margin: '0 0 16px 0', textAlign: 'center' }}>
                Understanding Whatcha 360 Packages
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
                <div style={{ background: '#ffffff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontWeight: 800, fontSize: '16px', color: '#0f172a', marginBottom: '8px' }}>Starter Tier</div>
                  <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13.5px', color: '#475569', lineHeight: 1.6 }}>
                    <li>Industry-specific WhatsApp enquiry menu</li>
                    <li>Standard automated replies for FAQs, hours & pricing</li>
                    <li>1 simple automated workflow (e.g., lead or enquiry form)</li>
                    <li>Self-service onboarding & setup guide</li>
                  </ul>
                </div>
                <div style={{ background: '#ffffff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontWeight: 800, fontSize: '16px', color: '#0f172a', marginBottom: '8px' }}>Growth Tier</div>
                  <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13.5px', color: '#475569', lineHeight: 1.6 }}>
                    <li>Everything in Starter</li>
                    <li>Additional enquiry & response workflows</li>
                    <li>Automated follow-ups for unconfirmed leads</li>
                    <li>Booking, quote, or application request forms</li>
                    <li>Shared inbox support for multiple team members</li>
                  </ul>
                </div>
                <div style={{ background: '#ffffff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontWeight: 800, fontSize: '16px', color: '#0f172a', marginBottom: '8px' }}>Premium Tier</div>
                  <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13.5px', color: '#475569', lineHeight: 1.6 }}>
                    <li>Everything in Growth</li>
                    <li>Complex tailored workflows for your organisation</li>
                    <li>Expanded campaign allowances for broadcasts</li>
                    <li>Agreed monthly reporting and review</li>
                    <li>Dedicated priority support</li>
                  </ul>
                </div>
              </div>

              {/* Scope & Exclusions Note */}
              <div style={{ marginTop: '20px', padding: '16px 20px', background: '#f1f5f9', borderRadius: '12px', fontSize: '13px', color: '#475569', lineHeight: 1.6 }}>
                <strong>Scope & Safeguards:</strong> Packages include Business WhatsApp setup, enquiry menus, automated replies, follow-ups, and dashboard access.
                Base subscriptions exclude VAT, paid Meta message fees, custom transactional databases, live financial accounting records, staff attendance management, dynamic live stock inventory sync, and external ERP/LMS integrations unless explicitly quoted.
              </div>
            </div>
          </Section>

          <Section title="Compare plans" sub="Everything each plan includes." id="compare">
            <div className="sx-table-wrap">
              <table className="sx-table sx-compare" data-testid="pricing-compare">
                <thead>
                  <tr>
                    <th scope="col">Feature</th>
                    {TIER_ORDER.map((t) => <th key={t} scope="col" className="c">{TIER_NAMES[t]}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((g) => (
                    <Fragment key={g.group}>
                      <tr className="grp"><td colSpan={TIER_ORDER.length + 1}>{g.group}</td></tr>
                      {g.rows.map((r) => (
                        <tr key={r.label}>
                          <th scope="row">{r.label}</th>
                          {TIER_ORDER.map((t) => <td key={t} className="c"><CellView v={r.cell(t)} /></td>)}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Billing questions" tint center>
            <FaqList items={FAQS} />
            <p className="sx-note sx-center">
              More in the <SiteLink href="/help">Help center</SiteLink>, the <SiteLink href="/resources/whatsapp-pricing">WhatsApp pricing guide</SiteLink> and
              our <SiteLink href="/refund">Refund and Cancellation Policy</SiteLink>.
            </p>
          </Section>

          <CtaBand onDemo={openDemo} title="Try every feature free for 7 days" />
        </>
      )}
    </SitePage>
  );
}
