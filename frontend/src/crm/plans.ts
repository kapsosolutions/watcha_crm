// The SaaS plans, as the landing page, the plans dialog (Buy Now) and
// Settings → Billing show them. What each plan really includes is enforced
// by the server (backend/services/plans.js): the tiers, prices and limits
// here must match it.
//
//   Starter  ₹499 (tier key 'free'): WhatsApp team inbox, 50 templates
//            (standard; Marketing + Utility), 10 campaigns/month at 5/s,
//            journeys + native WhatsApp Flows (with the form request
//            pages), and Orders & bookings.
//   Basic    100 templates (standard + carousel, Authentication too), 25
//            campaigns at 10/s, journeys + WhatsApp Flows, orders, calls,
//            polls, events, API keys, catalog, payments, Instagram and
//            Messenger. No Ads or Create.
//   Pro      Every feature and template format, 300 templates, 50
//            campaigns at 20/s, Ads and Create.
//   Premium  Everything, no template or campaign limits, 40/s.
// Every new business gets every feature for 7 days first (the free trial),
// with up to 5 templates and 3 campaigns during it (TRIAL_LIMITS).
// No plan limits contacts.
// Prices are per month and are what the customer pays; quarterly and annual
// are paid upfront.
import type { PlanFeature, PlanLimits, PlanState, PlanTierKey, TemplateKind } from './types';

export type BillingCycle = 'monthly' | 'quarterly' | 'annual';

export const BILLING_CYCLES: { key: BillingCycle; label: string; months: number; save?: string }[] = [
  { key: 'monthly', label: 'Monthly', months: 1 },
  { key: 'quarterly', label: 'Quarterly', months: 3, save: 'Save up to 10%' },
  { key: 'annual', label: 'Annual', months: 12, save: 'Save up to 25%' },
];

export const TRIAL_DAYS = 7;
/** The free trial opens every feature but caps templates (in the account) and campaigns (the whole trial). Matches the server. */
export const TRIAL_LIMITS = { templates: 5, campaigns: 3 };

/** Meta's per-message prices, in every country (public/meta-whatsapp-pricing.pdf). */
export const META_PRICING_PDF = '/meta-whatsapp-pricing.pdf';

const ALL: PlanFeature[] = [
  'chats', 'templates', 'campaigns', 'journeys', 'flows', 'calls', 'polls', 'events', 'api',
  'catalog', 'categories', 'members', 'offers', 'orders',
  'payment-config', 'ads', 'create', 'instagram', 'messenger',
];
export const TEMPLATE_KINDS: TemplateKind[] = ['standard', 'carousel', 'lto'];
export const KIND_NAMES: Record<TemplateKind, string> = { standard: 'Standard', carousel: 'Carousel', lto: 'Limited-time offer' };
const without = (...f: PlanFeature[]) => ALL.filter((x) => !f.includes(x));

export const LIMITS: Record<PlanTierKey, PlanLimits> = {
  free: {
    features: ['chats', 'templates', 'campaigns', 'journeys', 'flows', 'orders', 'ads', 'create', 'instagram'], contacts: null, templates: 50, templateKinds: ['standard'],
    campaignsPerMonth: 10, sendRate: 5, carousel: false, authTemplates: false,
  },
  basic: {
    features: without('messenger'), contacts: null, templates: 100, templateKinds: ['standard', 'carousel'],
    campaignsPerMonth: 25, sendRate: 10, carousel: true, authTemplates: true,
  },
  pro: {
    features: ALL, contacts: null, templates: 300, templateKinds: TEMPLATE_KINDS,
    campaignsPerMonth: 50, sendRate: 20, carousel: true, authTemplates: true,
  },
  premium: {
    features: ALL, contacts: null, templates: null, templateKinds: TEMPLATE_KINDS,
    campaignsPerMonth: null, sendRate: 40, carousel: true, authTemplates: true,
  },
};

export const TIER_ORDER: PlanTierKey[] = ['free', 'basic', 'pro', 'premium'];
export const TIER_NAMES: Record<PlanTierKey, string> = { free: 'Starter', basic: 'Basic', pro: 'Pro', premium: 'Premium' };

/** Per-month price in South African Rand (ZAR), for each cycle. */
export const PRICES: Record<PlanTierKey, Record<BillingCycle, number>> = {
  free: { monthly: 149, quarterly: 134, annual: 112 },
  basic: { monthly: 299, quarterly: 269, annual: 224 },
  pro: { monthly: 499, quarterly: 449, annual: 374 },
  premium: { monthly: 699, quarterly: 629, annual: 524 },
};

/**
 * The struck-through "was" price per month, shown before the real price on
 * every plan card (display only: what's charged is PRICES, on the server).
 * Matches the official Whatcha Black Friday vs Suggested Normal pricing catalogue.
 */
export const STRIKE_PRICES: Record<PlanTierKey, number> = {
  free: 249,
  basic: 399,
  pro: 699,
  premium: 999,
};

/** Setup & Additional Services (Whatcha 360 Catalogue - Page 7) */
export const SETUP_SERVICES = {
  standardActivation: { name: 'Standard Black Friday Activation', price: 0, text: 'No setup or onboarding fee' },
  assistedConfig: { name: 'Optional Assisted Configuration', price: 499, text: 'R499 once-off (assisted setup of enquiry menus, hours & automated replies)' },
  advancedConfig: { name: 'Advanced Configuration', price: 999, text: 'Suggested from R999 once-off (complex workflows, multi-staff routing & custom forms)' },
  customIntegrations: { name: 'Custom Integrations', price: null, text: 'Quoted on request (external software, custom databases & APIs)' },
};

/** Operational Safeguards & Exclusions Note */
export const PRICING_TERMS_NOTE = 'All subscriptions in ZAR, excluding VAT. Meta WhatsApp messaging fees billed directly by Meta. Custom integrations quoted separately.';

export interface PlanTier {
  key: PlanTierKey;
  name: string;
  badge?: string;
  theme: 'slate' | 'blue' | 'green' | 'purple';
  description: string;
  /** What's included, then what isn't. */
  includes: string[];
  excludes: string[];
  buttonColor: string;
}

const FREE_SERVICE = '1,000 free service messages a month (Meta)';

export const PLANS: PlanTier[] = [
  {
    key: 'free',
    name: 'Starter',
    theme: 'slate',
    description: 'Ideal for small businesses: WhatsApp CRM with automated replies, forms and bookings.',
    includes: [
      'WhatsApp CRM',
      'Automated replies',
      '50 templates',
      '10 campaigns/month',
      'Forms & bookings',
      'Ideal for small businesses',
      FREE_SERVICE,
      'Your own WhatsApp number · official Meta Cloud API',
    ],
    excludes: [
      'Carousel & limited-time offer templates',
      'Authentication (OTP) templates',
      'WhatsApp calls, polls & events',
      'Template API keys',
      'Catalog & payment configuration',
      'Instagram, Messenger & Ads',
    ],
    buttonColor: '#e2e8f0',
  },
  {
    key: 'basic',
    name: 'Basic',
    theme: 'blue',
    description: 'Grow your customer engagement with catalogues, orders and WhatsApp Pay.',
    includes: [
      'WhatsApp CRM: team inbox, unlimited contacts',
      '100 templates',
      '25 campaigns/month',
      'Product catalogues',
      'Orders & bookings',
      'WhatsApp Pay',
      'Instagram & FB link',
      'Grow your customer engagement',
      FREE_SERVICE,
    ],
    excludes: ['Limited-time offer templates', 'Ads', 'Create: Facebook & Instagram posts'],
    buttonColor: '#38bdf8',
  },
  {
    key: 'pro',
    name: 'Pro',
    badge: 'Best Value',
    theme: 'green',
    description: 'Advanced marketing & lead generation with Click-to-WhatsApp ads.',
    includes: [
      'WhatsApp CRM: team inbox, unlimited contacts',
      '300 templates',
      '50 campaigns/month',
      'Lead forms',
      'Click-to-WhatsApp ads',
      'Social media posts',
      'Advanced marketing & lead generation',
      FREE_SERVICE,
    ],
    excludes: [],
    buttonColor: '#0cbc04',
  },
  {
    key: 'premium',
    name: 'Premium',
    theme: 'purple',
    description: 'Maximum campaign capacity with unlimited templates and priority support.',
    includes: [
      'WhatsApp CRM: team inbox, unlimited contacts',
      'Unlimited templates',
      'Unlimited campaigns',
      'High campaign speed',
      'Priority support',
      'Maximum campaign capacity',
      FREE_SERVICE,
    ],
    excludes: [],
    buttonColor: '#f472b6',
  },
];

export const cycleLabel = (c: string) => BILLING_CYCLES.find((x) => x.key === c)?.label || c;
export const cycleMonths = (c: string) => BILLING_CYCLES.find((x) => x.key === c)?.months || 1;

const zar = (n: number) => `R${n.toLocaleString('en-ZA', { maximumFractionDigits: 2 })}`;
export const rand = (cents: number) => zar(Math.round(cents) / 100);
export const inr = zar;
export const rupees = rand;

/** "R499" per month for a plan + cycle. */
export function monthlyPrice(tier: PlanTierKey, cycle: BillingCycle): string {
  return zar(PRICES[tier][cycle]);
}

/** The struck-through "was" price per month ("R749"), or '' when it isn't above the real price. */
export function strikePrice(tier: PlanTierKey, cycle: BillingCycle): string {
  const was = STRIKE_PRICES[tier];
  return was > PRICES[tier][cycle] ? zar(was) : '';
}

/** What the period costs upfront: "R5,988 billed annually". */
export function billedText(tier: PlanTierKey, cycle: BillingCycle): string {
  const total = PRICES[tier][cycle] * cycleMonths(cycle);
  return cycle === 'monthly' ? 'billed monthly' : `${zar(total)} billed ${cycle === 'annual' ? 'annually' : 'quarterly'}`;
}

/** "R499/month, billed annually (R5,988)" */
export function priceText(tier: PlanTierKey, cycle: BillingCycle): string {
  return `${monthlyPrice(tier, cycle)}/month, ${billedText(tier, cycle)}`;
}

export const hasFeature = (state: PlanState | null | undefined, f: PlanFeature) =>
  !state || state.limits.features.includes(f);

/** The template formats a plan may create (an older server only says `carousel`). */
export function kindsOf(l: PlanLimits | null | undefined): TemplateKind[] {
  if (!l) return TEMPLATE_KINDS;
  return l.templateKinds?.length ? l.templateKinds : l.carousel ? ['standard', 'carousel', 'lto'] : ['standard'];
}

/** The cheapest plan that unlocks a feature or template format (for "Upgrade to Basic"). */
export function tierFor(f: PlanFeature | TemplateKind | 'authTemplates'): PlanTierKey {
  if (f === 'authTemplates') return TIER_ORDER.find((t) => LIMITS[t].authTemplates) || 'premium';
  if ((TEMPLATE_KINDS as string[]).includes(f)) return TIER_ORDER.find((t) => kindsOf(LIMITS[t]).includes(f as TemplateKind)) || 'premium';
  return TIER_ORDER.find((t) => LIMITS[t].features.includes(f as PlanFeature)) || 'premium';
}

export const tierRank = (t: PlanTierKey) => TIER_ORDER.indexOf(t);

/** A short line for the plan's status: "Free trial · 3 days left", "Pro · until 12 Dec 2026". */
export function planStatusText(s: PlanState | null | undefined): string {
  if (!s) return '';
  const date = s.endsAt ? new Date(s.endsAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  if (s.status === 'trial') return `Free trial · ${s.daysLeft === 1 ? '1 day' : `${s.daysLeft} days`} left`;
  if (s.status === 'active') return `${s.name} · until ${date}`;
  if (s.status === 'legacy') return `${s.name}`;
  return 'No active plan';
}
