// Ads Manager S1: the "Create campaign" wizard (Ads → Campaigns → Create
// campaign). Steps like Meta Ads Manager: goal, budget and schedule, audience,
// placements, identity, ad creative, review. A live preview sits on the right
// (below on narrow screens).
//
// The browser only collects choices. The server (services/metaAdsCreate.js)
// validates every field, checks every id against the connected ad account,
// builds Meta's payloads and creates everything PAUSED. "Publish" is a second,
// confirmed step that shows the budget and dates first. Meta's preview comes
// back as an iframe src only (checked on the server and here) and renders in a
// sandboxed iframe; Meta's HTML is never injected.
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CrmApi } from '../api';
import type {
  AdDraftItem, AdsCampaignSpec, AdsCreateOptions, AdsCreateResult, AdsDetailedItem, AdsEstimate, AdsExistingPost, AdsGeoItem, AdsLocaleItem,
  AdsObjectiveKey, AdsPageDetails, AdsPreviewFormat, AdsReviewState, LeadFormItem, MetaAdsConnection,
} from '../types';
import { useConfirm, useNotify } from './Dialogs';
import { useBackHandler } from '../useBackHandler';
import { AdsErrorState, VERSION_OLD_TITLE, errCode, errText, errTitle, newRequestId } from './MetaAdsDashboard';
import { BladeSpinner } from './BladeSpinner';
// Every placement's preview (sketches, and Meta's own rendering once the ad is complete).
import { AllPlacementsDialog, PLACEMENTS, PlacementSketch, placementOf, placementSkip } from './AdsPlacementPreviews';
// Ads Manager S4: custom / lookalike audiences and saved audiences in the audience step.
import { CustomAudiencePicker, SavedAudienceStart } from './AdsAudiencePickers';
// Ads Manager S5: the Sales goal's pixel, event and custom conversion.
import { SalesConversion } from './AdsPixelPicker';
import './AdsManager.css';

type ApiErr = Error & { status?: number; data?: { code?: string; field?: string; step?: string; rolledBack?: { level: string; id: string; deleted: boolean }[] } | null };
const errField = (e: unknown) => (e as ApiErr)?.data?.field || '';

// ------------------------------------------------------------ constants --

export const OBJECTIVES: Record<AdsObjectiveKey, {
  label: string; icon: string; text: string; goodFor: string[]; goals: { key: string; label: string }[]; ctas: string[]; url: 'none' | 'required' | 'optional';
}> = {
  awareness: {
    label: 'Awareness', icon: 'campaign', text: 'Show your ads to people who are most likely to remember them.',
    goodFor: ['Reach', 'Brand awareness', 'Video views', 'Store location awareness'],
    goals: [{ key: 'REACH', label: 'Reach' }, { key: 'IMPRESSIONS', label: 'Impressions' }], ctas: ['LEARN_MORE', 'SHOP_NOW', 'CONTACT_US', 'BOOK_NOW', 'ORDER_NOW', 'NO_BUTTON'], url: 'optional',
  },
  traffic: {
    label: 'Traffic', icon: 'ads_click', text: 'Send people to a destination, like your website, app or Facebook event.',
    goodFor: ['Link clicks', 'Landing page views', 'Messenger, Instagram and WhatsApp', 'Calls'],
    goals: [{ key: 'LINK_CLICKS', label: 'Link clicks' }, { key: 'LANDING_PAGE_VIEWS', label: 'Landing page views' }],
    ctas: ['LEARN_MORE', 'SHOP_NOW', 'SIGN_UP', 'BOOK_NOW', 'CONTACT_US', 'ORDER_NOW', 'GET_OFFER', 'SUBSCRIBE', 'APPLY_NOW', 'GET_QUOTE', 'DOWNLOAD', 'WATCH_MORE'],
    url: 'required',
  },
  engagement: {
    label: 'Engagement', icon: 'chat', text: 'Get more messages, video views, post engagement, Page likes or event responses.',
    goodFor: ['Messenger, Instagram and WhatsApp', 'Video views', 'Post engagement', 'Conversions'],
    goals: [{ key: 'CONVERSATIONS', label: 'Conversations' }, { key: 'LINK_CLICKS', label: 'Link clicks' }],
    ctas: ['WHATSAPP_MESSAGE', 'LEARN_MORE', 'SIGN_UP', 'CONTACT_US', 'BOOK_NOW', 'NO_BUTTON'], url: 'none',
  },
  leads: {
    label: 'Leads', icon: 'filter_alt', text: 'Collect leads for your business or brand.',
    goodFor: ['Instant forms', 'Messenger and Instagram', 'Conversions', 'Calls'],
    goals: [{ key: 'LEAD_GENERATION', label: 'Leads' }], ctas: ['SIGN_UP', 'LEARN_MORE', 'APPLY_NOW', 'GET_QUOTE', 'SUBSCRIBE', 'DOWNLOAD'], url: 'none',
  },
  app_promotion: {
    label: 'App promotion', icon: 'install_mobile', text: 'Find new people to install your app and continue using it.',
    goodFor: ['App installs', 'App events'],
    goals: [{ key: 'LINK_CLICKS', label: 'Link clicks' }], ctas: ['DOWNLOAD', 'LEARN_MORE', 'SHOP_NOW'], url: 'optional',
  },
  sales: {
    label: 'Sales', icon: 'shopping_bag', text: 'Find people likely to purchase your product or service.',
    goodFor: ['Conversions', 'Catalog sales', 'Messenger, Instagram and WhatsApp', 'Calls'],
    goals: [{ key: 'OFFSITE_CONVERSIONS', label: 'Conversions' }], ctas: ['SHOP_NOW', 'BUY_NOW', 'ORDER_NOW', 'LEARN_MORE', 'SIGN_UP', 'BOOK_NOW', 'GET_OFFER'], url: 'required',
  },
  whatsapp: {
    label: 'Click-to-WhatsApp messages', icon: 'chat', text: 'People tap your ad and start a WhatsApp chat with you.',
    goodFor: ['WhatsApp messages', 'Direct customer engagement', 'Faster lead conversion'],
    goals: [{ key: 'CONVERSATIONS', label: 'Conversations' }, { key: 'LINK_CLICKS', label: 'Link clicks' }], ctas: ['WHATSAPP_MESSAGE'], url: 'none',
  },
};

export const META_OBJECTIVES: AdsObjectiveKey[] = ['awareness', 'traffic', 'engagement', 'leads', 'app_promotion', 'sales'];

const CTA_LABEL: Record<string, string> = {
  WHATSAPP_MESSAGE: 'Send WhatsApp message', LEARN_MORE: 'Learn more', SHOP_NOW: 'Shop now', SIGN_UP: 'Sign up', BOOK_NOW: 'Book now',
  CONTACT_US: 'Contact us', ORDER_NOW: 'Order now', GET_OFFER: 'Get offer', SUBSCRIBE: 'Subscribe', APPLY_NOW: 'Apply now', GET_QUOTE: 'Get quote',
  DOWNLOAD: 'Download', WATCH_MORE: 'Watch more', BUY_NOW: 'Buy now', NO_BUTTON: 'No button',
};

const SPECIAL: [string, string][] = [
  ['CREDIT', 'Credit'],
  ['FINANCIAL_PRODUCTS_SERVICES', 'Financial products and services'],
  ['EMPLOYMENT', 'Employment'],
  ['HOUSING', 'Housing'],
  ['ISSUES_ELECTIONS_POLITICS', 'Social issues, elections or politics'],
];
const RESTRICTED = ['CREDIT', 'FINANCIAL_PRODUCTS_SERVICES', 'EMPLOYMENT', 'HOUSING'];

const EVENTS: [string, string][] = [
  ['PURCHASE', 'Purchase'], ['ADD_TO_CART', 'Add to cart'], ['INITIATED_CHECKOUT', 'Initiate checkout'], ['ADD_PAYMENT_INFO', 'Add payment info'],
  ['COMPLETE_REGISTRATION', 'Complete registration'], ['LEAD', 'Lead'], ['CONTENT_VIEW', 'View content'], ['CONTACT', 'Contact'],
  ['SUBSCRIBE', 'Subscribe'], ['SEARCH', 'Search'], ['SCHEDULE', 'Schedule'], ['START_TRIAL', 'Start trial'], ['SUBMIT_APPLICATION', 'Submit application'],
];

export const BIDS: [AdsCampaignSpec['budget']['bidStrategy'], string, string][] = [
  ['LOWEST_COST_WITHOUT_CAP', 'Highest volume', 'Meta gets the most results for your budget. Recommended.'],
  ['COST_CAP', 'Cost per result goal', 'Meta aims to keep the average cost per result near your goal.'],
  ['LOWEST_COST_WITH_BID_CAP', 'Bid cap', 'Meta never bids more than your cap in an auction.'],
];

const PLATFORMS: [string, string][] = [['facebook', 'Facebook'], ['instagram', 'Instagram'], ['messenger', 'Messenger'], ['audience_network', 'Audience Network']];
const POSITIONS: Record<string, [string, string][]> = {
  facebook: [['feed', 'Feed'], ['profile_feed', 'Profile feed'], ['right_hand_column', 'Right column'], ['marketplace', 'Marketplace'], ['search', 'Search results'], ['story', 'Stories'], ['facebook_reels', 'Reels'], ['instream_video', 'In-stream video']],
  instagram: [['stream', 'Feed'], ['profile_feed', 'Profile feed'], ['explore', 'Explore'], ['explore_home', 'Explore home'], ['story', 'Stories'], ['reels', 'Reels'], ['ig_search', 'Search results']],
  messenger: [['story', 'Stories']],
  audience_network: [['classic', 'Native, banner and interstitial'], ['rewarded_video', 'Rewarded videos']],
};

/** The preview panel's quick placements; "All placements" opens every one (AdsPlacementPreviews). */
export const PREVIEWS: [AdsPreviewFormat, string][] = [
  ['facebook_feed', 'Facebook feed'], ['facebook_story', 'Facebook story'], ['facebook_reels', 'Facebook reels'],
  ['instagram_feed', 'Instagram feed'], ['instagram_story', 'Instagram story'], ['reels', 'Instagram reels'], ['whatsapp_status', 'WhatsApp status'],
];
const STEPS = ['Campaign', 'Ad set', 'Audience', 'Placements', 'Identity', 'Ad creative', 'Review'];
const IMAGE_MAX = 8 * 1024 * 1024;
const VIDEO_MAX = 250 * 1024 * 1024;
const VIDEO_POLL_MS = 2000;
/** The upload poll: at most 600 polls (about 20 min), and 5 retries with backoff (4 s … 30 s) after a failed poll. */
const VIDEO_POLL_TRIES = 600;
const VIDEO_POLL_RETRIES = 5;
const VIDEO_BACKOFF_MAX_MS = 30000;
const VIDEO_STILL_TEXT = 'The video is still processing at Meta. It will appear in “From your ad account” (the media library) when it’s ready; pick it there.';

/** Which step a server field error belongs to. */
function stepOfField(field: string): number {
  if (/^(budget|schedule)/.test(field)) return 1;
  if (/^audience/.test(field)) return 2;
  if (/^placements/.test(field)) return 3;
  if (/^identity/.test(field)) return 4;
  if (/^creative/.test(field)) return 5;
  return 0;
}

export function defaultSpec(objective: AdsObjectiveKey = 'whatsapp', pageId = '', currency = '', timezone = ''): AdsCampaignSpec {
  const isIndia = currency === 'INR' || timezone?.includes('Kolkata') || timezone?.includes('India');
  const defLocs: AdsGeoItem[] = isIndia ? [{ key: 'IN', name: 'India', kind: 'country', countryCode: 'IN' }] : [];
  return {
    objective,
    name: `New ${OBJECTIVES[objective].label} campaign`,
    specialAdCategories: [],
    optimizationGoal: OBJECTIVES[objective].goals[0].key,
    pixelId: '',
    conversionEvent: 'PURCHASE',
    budget: { level: 'campaign', type: 'daily', amount: '', bidStrategy: 'LOWEST_COST_WITHOUT_CAP', bidAmount: '' },
    schedule: { start: '', end: '' },
    audience: { locations: defLocs, excludedLocations: [], ageMin: 18, ageMax: 65, genders: 'all', detailed: [], locales: [], advantageAudience: true },
    placements: {
      mode: 'automatic', platforms: ['facebook', 'instagram'], positions: { facebook: ['feed', 'story', 'facebook_reels'], instagram: ['stream', 'story', 'reels'] },
      devices: ['mobile', 'desktop'], os: 'all',
    },
    identity: { pageId, instagramId: '' },
    creative: {
      format: 'image', post: null, imageHash: '', imageUrl: '', videoId: '', videoThumbUrl: '', cards: [], primaryText: '', headline: '', description: '', link: '',
      displayLink: '', cta: OBJECTIVES[objective].ctas[0], whatsapp: { greeting: '', prefill: '', iceBreakers: [] }, leadFormId: '',
    },
  };
}

/** A saved draft on top of the defaults (drafts may be partial or from an older version). */
function fromDraft(d: Partial<AdsCampaignSpec> | undefined, conn?: MetaAdsConnection): AdsCampaignSpec {
  const objective = d?.objective && OBJECTIVES[d.objective] ? d.objective : 'whatsapp';
  const def = defaultSpec(objective, conn?.pageId || '', conn?.currency || '', conn?.timezone || '');
  if (!d) return def;
  return {
    ...def,
    ...d,
    objective,
    budget: { ...def.budget, ...(d.budget || {}) },
    schedule: { ...def.schedule, ...(d.schedule || {}) },
    audience: { ...def.audience, ...(d.audience || {}), locations: d.audience?.locations?.length ? d.audience.locations : def.audience.locations },
    placements: { ...def.placements, ...(d.placements || {}) },
    identity: { ...def.identity, ...(d.identity || {}) },
    creative: { ...def.creative, ...(d.creative || {}), whatsapp: { ...def.creative.whatsapp, ...(d.creative?.whatsapp || {}) } },
  };
}

// --------------------------------------------------------------- helpers --

function money(v: number | null | undefined, currency: string) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 2 }).format(v);
  } catch {
    return `${v} ${currency}`;
  }
}
const compact = (n: number) => new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);

/** Now (plus ms) as 'YYYY-MM-DDTHH:mm' wall-clock time in `tz`. */
export function nowLocal(tz: string, plusMs = 0): string {
  const d = new Date(Date.now() + plusMs);
  try {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
        .formatToParts(d)
        .map((x) => [x.type, x.value]),
    );
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  } catch {
    return d.toISOString().slice(0, 16);
  }
}
/** Wall-clock strings compared on one scale (all in the same time zone). */
const wall = (s: string) => Date.parse(`${s}:00Z`);
const DAY = 86400000;
const fmtLocal = (s: string) => (s ? s.replace('T', ' ') : '');
const isHttps = (s: string) => {
  try {
    const u = new URL(s);
    return u.protocol === 'https:' && u.hostname.includes('.');
  } catch {
    return false;
  }
};
/** Same check as the server: only an https facebook.com preview URL is rendered. */
export const safePreviewSrc = (s: string) => {
  try {
    const u = new URL(s);
    return u.protocol === 'https:' && /^(www\.|business\.|m\.)?facebook\.com$/.test(u.hostname) && u.pathname.startsWith('/ads/api/preview_iframe.php') ? u.toString() : '';
  } catch {
    return '';
  }
};

function useDebounced<T>(value: T, key: string, ms: number): T {
  const [v, setV] = useState(value);
  const latest = useRef(value);
  latest.current = value;
  useEffect(() => {
    const t = setTimeout(() => setV(latest.current), ms);
    return () => clearTimeout(t);
  }, [key, ms]);
  return v;
}

function budgetDays(spec: AdsCampaignSpec, tz: string) {
  if (!spec.schedule.end) return 0;
  const start = spec.schedule.start || nowLocal(tz);
  return Math.max(1, Math.ceil((wall(spec.schedule.end) - wall(start)) / DAY));
}

/** What still blocks a step (shown next to Next; the server re-checks everything). */
export function stepProblems(step: number, spec: AdsCampaignSpec, ctx: { options: AdsCreateOptions | null; page: AdsPageDetails | null; conn: MetaAdsConnection }): string[] {
  const out: string[] = [];
  const o = OBJECTIVES[spec.objective];
  const acct = ctx.options?.account;
  if (step === 0) {
    if (!spec.name.trim()) out.push('Name the campaign.');
    if (spec.name.length > 400) out.push('The name can be at most 400 characters.');
    if (spec.objective === 'sales' && !spec.pixelId) out.push('Pick a pixel for sales.');
  }
  if (step === 1 && acct) {
    const amount = Number(spec.budget.amount);
    const tz = acct.timezone;
    if (!(amount > 0)) out.push('Enter a budget.');
    else if (spec.budget.type === 'daily' && amount < acct.minDailyBudget) out.push(`The daily budget must be at least ${money(acct.minDailyBudget, acct.currency)}.`);
    if (spec.budget.type === 'lifetime' && !spec.schedule.end) out.push('A lifetime budget needs an end date.');
    if (spec.budget.type === 'lifetime' && spec.schedule.end && amount > 0) {
      const days = budgetDays(spec, tz);
      if (amount < acct.minDailyBudget * days) out.push(`For ${days} days the lifetime budget must be at least ${money(acct.minDailyBudget * days, acct.currency)}.`);
    }
    if (spec.schedule.start && wall(spec.schedule.start) < wall(nowLocal(tz)) - 5 * 60000) out.push('The start time is in the past.');
    if (spec.schedule.end && wall(spec.schedule.end) - wall(spec.schedule.start || nowLocal(tz)) < DAY) out.push('The end must be at least 24 hours after the start.');
    if (spec.budget.bidStrategy !== 'LOWEST_COST_WITHOUT_CAP' && !(Number(spec.budget.bidAmount) > 0)) out.push('Enter the bid amount.');
  }
  if (step === 2) {
    if (!spec.audience.locations.length) out.push('Add at least one location.');
    if (spec.audience.ageMin > spec.audience.ageMax) out.push('The maximum age is below the minimum age.');
  }
  if (step === 3 && spec.placements.mode === 'manual') {
    if (!spec.placements.platforms.length) out.push('Pick at least one platform.');
    for (const p of spec.placements.platforms) if (!(spec.placements.positions[p] || []).length) out.push(`Pick a position for ${p.replace('_', ' ')}.`);
  }
  if (step === 4) {
    if (!spec.identity.pageId) out.push('Pick the Facebook Page the ad runs from.');
    if (spec.objective === 'whatsapp' && ctx.page && ctx.page.page.id === spec.identity.pageId && ctx.page.whatsapp.linked === false) out.push('This Page has no WhatsApp number linked.');
    if (spec.objective === 'leads' && spec.identity.pageId && spec.identity.pageId !== ctx.conn.pageId) out.push('Lead ads must run from the Page connected for lead forms.');
  }
  if (step === 5) {
    const c = spec.creative;
    if (c.format === 'image' && !c.imageHash) out.push('Upload or pick an image.');
    if (c.format === 'video' && !c.videoId) out.push('Upload or pick a video.');
    if (c.format === 'video' && c.videoId && !c.videoThumbUrl) out.push('Wait until Meta has processed the video.');
    if (c.format === 'carousel') {
      if (c.cards.length < 2 || c.cards.length > 10) out.push('A carousel needs 2 to 10 cards.');
      if (c.cards.some((k) => !k.imageHash)) out.push('Every card needs an image.');
      if (o.url === 'required' && c.cards.some((k) => !isHttps(k.link))) out.push('Every card needs an https:// website URL.');
    }
    if (c.format === 'post') {
      if (!c.post?.id) out.push('Pick the post to use.');
      else if (c.post.eligible === false) out.push('Meta says that post can’t be promoted. Pick another one.');
      if (c.post?.source === 'instagram' && !spec.identity.instagramId) out.push('Pick the post’s Instagram account in the Identity step.');
    } else if (!c.primaryText.trim()) out.push('Write the primary text.');
    if (o.url === 'required' && !isHttps(c.link)) out.push('Enter the website URL (https://).');
    if (o.url === 'optional' && c.link && !isHttps(c.link)) out.push('The website URL must start with https://.');
    if (spec.objective === 'leads' && !c.leadFormId) out.push('Pick or create a lead form.');
  }
  return out;
}

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], iframe, [tabindex]:not([tabindex="-1"])';

// ------------------------------------ meta objective modal (odax) --

export function MetaCompassMapSvg() {
  return (
    <svg width="220" height="120" viewBox="0 0 220 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="110" cy="110" rx="85" ry="7" fill="#e2e8f0" opacity="0.75" />
      <g>
        {/* Folded Map Panels */}
        <polygon points="22,24 76,17 73,95 19,102" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1.2" strokeLinejoin="round" />
        <polygon points="76,17 134,24 131,102 73,95" fill="#edf2f7" stroke="#cbd5e1" strokeWidth="1.2" strokeLinejoin="round" />
        <polygon points="134,24 188,15 185,93 131,102" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1.2" strokeLinejoin="round" />
      </g>
      {/* Topographic Lines */}
      <path d="M28 42 Q50 38 74 40" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="2 2" fill="none" />
      <path d="M28 68 Q50 65 73 70" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="2 2" fill="none" />
      <path d="M78 42 Q102 48 130 46" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="2 2" fill="none" />
      <path d="M78 72 Q102 76 129 74" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="2 2" fill="none" />
      <path d="M136 44 Q158 36 182 40" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="2 2" fill="none" />
      <path d="M135 72 Q158 66 181 70" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="2 2" fill="none" />
      {/* Dotted Navigation Trail */}
      <path
        d="M 42 40 C 56 36, 52 68, 72 60 C 92 52, 86 86, 120 76 C 138 70, 144 50, 162 56"
        stroke="#00a389"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="4 5"
        fill="none"
      />
      {/* Trail Start Marker */}
      <g transform="translate(42, 40)">
        <circle cx="0" cy="0" r="4.5" fill="#00a389" />
        <circle cx="0" cy="0" r="2" fill="#ffffff" />
      </g>
      {/* Compass on bottom-right */}
      <g transform="translate(164, 82)">
        <circle cx="0" cy="0" r="25" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="2.2" />
        <circle cx="0" cy="0" r="21" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" />
        {/* Cardinal Ticks */}
        <line x1="0" y1="-19" x2="0" y2="-15" stroke="#64748b" strokeWidth="1.5" />
        <line x1="0" y1="19" x2="0" y2="15" stroke="#64748b" strokeWidth="1.5" />
        <line x1="-19" y1="0" x2="-15" y2="0" stroke="#64748b" strokeWidth="1.5" />
        <line x1="19" y1="0" x2="15" y2="0" stroke="#64748b" strokeWidth="1.5" />
        {/* Diagonal Ticks */}
        <line x1="-12" y1="-12" x2="-9" y2="-9" stroke="#94a3b8" strokeWidth="1" />
        <line x1="12" y1="-12" x2="9" y2="-9" stroke="#94a3b8" strokeWidth="1" />
        <line x1="-12" y1="12" x2="-9" y2="9" stroke="#94a3b8" strokeWidth="1" />
        <line x1="12" y1="12" x2="9" y2="9" stroke="#94a3b8" strokeWidth="1" />
        {/* Needle North (Teal) */}
        <polygon points="0,-16 -3.5,0 0,-2.5" fill="#00a389" />
        <polygon points="0,-16 3.5,0 0,-2.5" fill="#008069" />
        {/* Needle South (Slate) */}
        <polygon points="0,16 -3.5,0 0,2.5" fill="#64748b" />
        <polygon points="0,16 3.5,0 0,2.5" fill="#475569" />
        {/* Pivot */}
        <circle cx="0" cy="0" r="2.5" fill="#1e293b" />
        <circle cx="0" cy="0" r="1" fill="#ffffff" />
      </g>
    </svg>
  );
}

export function MetaObjectiveModal({
  selected,
  onSelect,
  onClose,
}: {
  selected: AdsObjectiveKey;
  onSelect: (objective: AdsObjectiveKey) => void;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState<AdsObjectiveKey>(selected || 'engagement');
  const [hovered, setHovered] = useState<AdsObjectiveKey | null>(null);
  const [buyingType, setBuyingType] = useState('AUCTION');
  const [activeTab, setActiveTab] = useState<'campaign' | 'adset'>('campaign');
  const [showGuide, setShowGuide] = useState(false);

  const previewKey = hovered || current;
  const preview = OBJECTIVES[previewKey] || OBJECTIVES.engagement;

  return (
    <div className="ads-meta-obj-backdrop" role="dialog" aria-modal="true" data-testid="ads-meta-obj-modal">
      <div className="ads-meta-obj-modal">
        <div className="ads-meta-obj-head">
          <div className="ads-meta-obj-tabs">
            <button
              type="button"
              className={`ads-meta-obj-tab${activeTab === 'campaign' ? ' active' : ''}`}
              onClick={() => setActiveTab('campaign')}
            >
              Create new campaign
            </button>
            <button
              type="button"
              className={`ads-meta-obj-tab${activeTab === 'adset' ? ' active' : ''}`}
              onClick={() => setActiveTab('adset')}
            >
              New ad set or ad
            </button>
          </div>
          <button type="button" className="ads-meta-obj-close" onClick={onClose} aria-label="Close" data-testid="ads-meta-obj-close">
            ✕
          </button>
        </div>

        <div className="ads-meta-obj-body">
          {activeTab === 'adset' ? (
            <div style={{ padding: '36px 16px', textAlign: 'center' }}>
              <span className="material-icons" style={{ fontSize: 44, color: '#1877f2', marginBottom: 12 }}>
                library_add
              </span>
              <h4 style={{ margin: '0 0 8px 0', fontSize: 16, color: '#1c1e21' }}>Add an ad set or ad to an existing campaign</h4>
              <p style={{ margin: '0 auto 20px auto', maxWidth: 440, fontSize: 13, color: '#65676b', lineHeight: 1.5 }}>
                To create a new ad set or ad inside an existing campaign, select it from your Campaigns table and click Duplicate or Edit, or continue below to create a new campaign.
              </p>
              <button
                type="button"
                className="ads-meta-btn primary"
                onClick={() => setActiveTab('campaign')}
              >
                Create new campaign instead
              </button>
            </div>
          ) : (
            <>
              <div className="ads-meta-buying-type">
                <label htmlFor="ads-meta-buying-select">
                  Choose a buying type
                  <span
                    className="material-icons"
                    style={{ fontSize: 16, color: '#65676b', cursor: 'help' }}
                    title="Auction is the default buying type for Meta ads. Your ads compete against other advertisers in real-time auctions based on your bid, estimated action rates, and ad quality."
                  >
                    info
                  </span>
                </label>
                <select
                  id="ads-meta-buying-select"
                  className="ads-meta-select"
                  value={buyingType}
                  onChange={(e) => setBuyingType(e.target.value)}
                  data-testid="ads-meta-buying-select"
                >
                  <option value="AUCTION">Auction</option>
                  <option value="RESERVATION">Reservation</option>
                </select>
              </div>

              <div>
                <h4 className="ads-meta-obj-section-title">Choose a campaign objective</h4>
                <div className="ads-meta-obj-grid">
                  <div className="ads-meta-obj-list" role="radiogroup" aria-label="Choose a campaign objective">
                    {META_OBJECTIVES.map((k) => {
                      const item = OBJECTIVES[k];
                      const isSelected = current === k;
                      return (
                        <button
                          key={k}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          className={`ads-meta-obj-item${isSelected ? ' selected' : ''}`}
                          onClick={() => setCurrent(k)}
                          onMouseEnter={() => setHovered(k)}
                          onMouseLeave={() => setHovered(null)}
                          data-testid={`ads-meta-obj-item-${k}`}
                        >
                          <div className="ads-meta-radio">
                            {isSelected && <div className="ads-meta-radio-dot" />}
                          </div>
                          <span className="material-icons ads-meta-obj-icon" aria-hidden="true">
                            {item.icon}
                          </span>
                          <span className="ads-meta-obj-label">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="ads-meta-obj-preview-card">
                    <div className="ads-meta-obj-illus">
                      <MetaCompassMapSvg />
                    </div>
                    <p className="ads-meta-obj-hint">
                      Your campaign objective is the business goal you hope to achieve by running your ads. Hover over each one for more information.
                    </p>
                    <div className="ads-meta-obj-detail">
                      <h5>{preview.label}</h5>
                      <p>{preview.text}</p>
                      {preview.goodFor && preview.goodFor.length > 0 && (
                        <>
                          <div className="ads-meta-obj-goodfor">Good for:</div>
                          <ul className="ads-meta-obj-bullets">
                            {preview.goodFor.map((g) => (
                              <li key={g}>{g}</li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="ads-meta-obj-foot">
          <button type="button" className="ads-meta-link" onClick={() => setShowGuide(true)}>
            About campaign objectives
          </button>
          <div className="ads-meta-foot-actions">
            <button type="button" className="ads-meta-btn" onClick={onClose} data-testid="ads-meta-obj-cancel">
              Cancel
            </button>
            <button
              type="button"
              className="ads-meta-btn primary"
              onClick={() => onSelect(current)}
              data-testid="ads-meta-obj-continue"
            >
              Continue
            </button>
          </div>
        </div>

        {showGuide && (
          <div className="ads-meta-obj-backdrop" style={{ zIndex: 10001 }} onClick={() => setShowGuide(false)}>
            <div className="ads-meta-obj-modal" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
              <div className="ads-meta-obj-head">
                <strong style={{ fontSize: 15 }}>About Meta Campaign Objectives</strong>
                <button type="button" className="ads-meta-obj-close" onClick={() => setShowGuide(false)}>
                  ✕
                </button>
              </div>
              <div className="ads-meta-obj-body" style={{ maxHeight: '70vh' }}>
                <p style={{ margin: 0, fontSize: 13, color: '#4b4f56', lineHeight: 1.5 }}>
                  Meta uses the <strong>Outcome-Driven Ad Experiences (ODAX)</strong> framework. Choose the objective that matches your specific conversion goal:
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {META_OBJECTIVES.map((k) => {
                    const o = OBJECTIVES[k];
                    return (
                      <div key={k} style={{ padding: 10, background: '#f7f8fa', borderRadius: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span className="material-icons" style={{ fontSize: 18, color: '#1877f2' }}>{o.icon}</span>
                          <strong style={{ fontSize: 13 }}>{o.label}</strong>
                        </div>
                        <p style={{ margin: 0, fontSize: 12, color: '#65676b', lineHeight: 1.4 }}>{o.text}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="ads-meta-obj-foot">
                <span />
                <button type="button" className="ads-meta-btn primary" onClick={() => setShowGuide(false)}>
                  Got it
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------------------- wizard --

export function AdsCreateWizard({
  api, conn, draft, onClose, onCreated, onReconnect,
}: {
  api: CrmApi;
  conn: MetaAdsConnection;
  /** Resume this saved draft. */
  draft?: AdDraftItem | null;
  onClose: () => void;
  /** After a successful create (the Campaigns table reloads). */
  onCreated: (campaignId: string) => void;
  /** Runs Meta's login again (called straight from a click). */
  onReconnect: () => void;
}) {
  const notify = useNotify();
  const confirm = useConfirm();
  const titleId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const [showObjectiveModal, setShowObjectiveModal] = useState(() => !draft);
  const [spec, setSpecRaw] = useState<AdsCampaignSpec>(() => fromDraft(draft?.spec, conn));
  const [step, setStep] = useState(() => Math.min(6, Math.max(0, draft?.step || 0)));
  const [draftId, setDraftId] = useState(draft?.id || '');
  const [dirty, setDirty] = useState(false);
  const [options, setOptions] = useState<AdsCreateOptions | null>(null);
  const [optionsError, setOptionsError] = useState<unknown>(null);
  const [page, setPage] = useState<AdsPageDetails | null>(null);
  const [pageError, setPageError] = useState('');
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<unknown>(null);
  const [result, setResult] = useState<AdsCreateResult | null>(null);
  const createReq = useRef<{ id: string; spec: string } | null>(null);
  const [maxStep, setMaxStep] = useState(() => Math.min(6, Math.max(0, draft?.step || 0)));

  const setSpec = useCallback((fn: (s: AdsCampaignSpec) => AdsCampaignSpec) => {
    setSpecRaw((s) => fn(s));
    setDirty(true);
  }, []);

  const loadOptions = useCallback(() => {
    setOptionsError(null);
    api
      .getAdsCreateOptions()
      .then((o) => {
        setOptions(o);
        setSpecRaw((s) => {
          if (s.identity.pageId) return s;
          const pick = s.objective === 'leads' && conn.pageId ? conn.pageId : o.pages.length === 1 ? o.pages[0].id : conn.pageId || '';
          return pick ? { ...s, identity: { ...s.identity, pageId: pick } } : s;
        });
      })
      .catch(setOptionsError);
  }, [api, conn.pageId]);
  useEffect(() => loadOptions(), [loadOptions]);

  // The Page's WhatsApp number and Instagram accounts.
  useEffect(() => {
    const id = spec.identity.pageId;
    if (!id) {
      setPage(null);
      return undefined;
    }
    let live = true;
    setPageError('');
    api
      .getAdsPageDetails(id)
      .then((p) => {
        if (!live) return;
        setPage(p);
        setSpecRaw((s) => (s.identity.instagramId && !p.instagram.some((a) => a.id === s.identity.instagramId) ? { ...s, identity: { ...s.identity, instagramId: '' } } : s));
      })
      .catch((e) => live && setPageError(errText(e)));
    return () => {
      live = false;
    };
  }, [api, spec.identity.pageId]);

  const ctx = { options, page, conn };
  const problems = stepProblems(step, spec, ctx);
  const allProblems = useMemo(() => [0, 1, 2, 3, 4, 5].flatMap((s) => stepProblems(s, spec, ctx).map((p) => ({ step: s, p }))), [spec, options, page, conn]); // eslint-disable-line react-hooks/exhaustive-deps
  const canManage = !!options?.canManage && conn.canManage;

  const live = useRef({ dirty, result, onClose, onCreated });
  live.current = { dirty, result, onClose, onCreated };
  const requestClose = useCallback(async () => {
    const l = live.current;
    if (l.result) {
      l.onClose();
      return;
    }
    if (l.dirty) {
      const ok = await confirm({
        title: 'Close the wizard?',
        message: 'Your changes aren’t saved. Click “Save draft” first to continue later from the Campaigns tab.',
        confirmLabel: 'Close without saving',
        tone: 'danger',
      });
      if (!ok) return;
    }
    l.onClose();
  }, [confirm]);
  useBackHandler(true, () => void requestClose());

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    boxRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      // A confirm dialog on top handles its own keys.
      if (document.querySelector('.app-dialog') || document.querySelector('.ads-dialog-backdrop')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        void requestClose();
        return;
      }
      if (e.key !== 'Tab' || !boxRef.current) return;
      const els = Array.from(boxRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (!els.length) return;
      const first = els[0];
      const last = els[els.length - 1];
      const inside = boxRef.current.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (prev && document.contains(prev)) prev.focus?.();
    };
  }, [requestClose]);

  function go(next: number) {
    setStep(next);
    setMaxStep((m) => Math.max(m, next));
    boxRef.current?.querySelector('.ads-wz-main')?.scrollTo({ top: 0 });
  }

  async function saveDraft() {
    setSaving(true);
    try {
      const r = await api.saveAdDraft(draftId || null, step, spec);
      setDraftId(r.draft.id);
      setDirty(false);
      notify('success', 'Draft saved', 'Resume it from the Campaigns tab.');
    } catch (e) {
      notify('error', 'Draft not saved', errText(e));
    } finally {
      setSaving(false);
    }
  }

  async function create() {
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    // One request id per spec: a retry of the same campaign (e.g. after a
    // timeout) gets the first answer back instead of a second campaign.
    const key = JSON.stringify(spec);
    if (!createReq.current || createReq.current.spec !== key) createReq.current = { id: newRequestId(), spec: key };
    try {
      const r = await api.createAdsCampaign(spec, draftId || undefined, createReq.current.id);
      createReq.current = null;
      setResult(r);
      setDirty(false);
      onCreated(r.campaign.id);
      notify('success', 'Campaign created (paused)', 'Nothing spends until you publish it.');
    } catch (e) {
      setCreateError(e);
      const f = errField(e);
      if (f) go(stepOfField(f));
    } finally {
      setCreating(false);
    }
  }

  const acct = options?.account;
  const pageName = options?.pages.find((p) => p.id === spec.identity.pageId)?.name || page?.page.name || '';

  if (showObjectiveModal) {
    return (
      <MetaObjectiveModal
        selected={spec.objective}
        onSelect={(newObj) => {
          setSpec((s) => {
            const meta = OBJECTIVES[newObj];
            return {
              ...s,
              objective: newObj,
              name: s.name && !s.name.startsWith('New ') ? s.name : `New ${meta.label} campaign`,
              optimizationGoal: meta.goals.some((g) => g.key === s.optimizationGoal) ? s.optimizationGoal : meta.goals[0].key,
              creative: { ...s.creative, cta: meta.ctas.includes(s.creative.cta) ? s.creative.cta : meta.ctas[0] },
            };
          });
          setShowObjectiveModal(false);
        }}
        onClose={() => {
          if (!dirty) onClose();
          else void requestClose();
        }}
      />
    );
  }

  let body: ReactNode;
  if (optionsError) body = <AdsErrorState error={optionsError} onRetry={loadOptions} />;
  else if (!options) body = <BladeSpinner center={true} containerHeight={220} />;
  else if (result) body = <CreatedPanel api={api} result={result} />;
  else {
    body = (
      <>
        {!canManage && (
          <div className="ads-wz-warn" role="note" data-testid="ads-wz-readonly">
            <span className="material-icons" aria-hidden="true">lock</span>
            <span>
              The CRM can only read this ad account, so it can’t create campaigns yet. You can still plan the campaign and save a draft. To create it, reconnect and
              allow managing ads (ads_management).
            </span>
          </div>
        )}
        {createError && step !== 6 ? <CreateErrorBox error={createError} /> : null}
        {step === 0 && (
          <StepGoal
            spec={spec}
            setSpec={setSpec}
            options={options}
            onChangeObjective={() => setShowObjectiveModal(true)}
          />
        )}
        {step === 1 && (
          <StepAdSet
            api={api}
            spec={spec}
            setSpec={setSpec}
            options={options}
            page={page}
            conn={conn}
            onReconnect={onReconnect}
          />
        )}
        {step === 2 && <StepAudience api={api} spec={spec} setSpec={setSpec} />}
        {step === 3 && <StepPlacements spec={spec} setSpec={setSpec} />}
        {step === 4 && <StepIdentity spec={spec} setSpec={setSpec} options={options} page={page} pageError={pageError} conn={conn} onReconnect={onReconnect} />}
        {step === 5 && <StepCreative api={api} spec={spec} setSpec={setSpec} conn={conn} canManage={canManage} onReconnect={onReconnect} igIssue={page?.instagram.length ? '' : page?.instagramIssue || ''} igAccounts={page?.instagram || []} />}
        {step === 6 && (
          <StepReview
            spec={spec}
            options={options}
            pageName={pageName}
            igName={page?.instagram.find((a) => a.id === spec.identity.instagramId)?.username || ''}
            problems={allProblems}
            onEdit={go}
            createError={createError}
            canManage={canManage}
            creating={creating}
            onCreate={create}
            api={api}
          />
        )}
      </>
    );
  }

  return (
    <div className="ads-wz-backdrop" data-testid="ads-wizard-backdrop">
      <div ref={boxRef} className="ads-wz" role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid="ads-wizard">
        <div className="ads-wz-head">
          <span className="material-icons" aria-hidden="true" style={{ color: '#1877f2' }}>add_circle</span>
          <h3 id={titleId}>{result ? 'Campaign created' : 'Create campaign'}</h3>
          {acct && <span className="ads-chip">{acct.name} · {acct.currency}</span>}
          <div className="ads-wz-head-right">
            <button type="button" className="ads-dialog-close" onClick={() => void requestClose()} aria-label="Close" data-testid="ads-wz-close" data-autofocus>
              ✕
            </button>
          </div>
        </div>
        {!result && options && (
          <nav className="ads-wz-steps" aria-label="Steps" data-testid="ads-wz-steps">
            {STEPS.map((label, i) => (
              <button
                key={label}
                type="button"
                className={`${i === step ? 'on' : ''}${i < step ? ' done' : ''}`}
                aria-current={i === step ? 'step' : undefined}
                disabled={i > maxStep}
                title={i > maxStep ? 'Finish the earlier steps first' : undefined}
                onClick={() => go(i)}
                data-testid={`ads-wz-step-${i}`}
              >
                <span className="n">{i + 1}</span>
                {label}
              </button>
            ))}
          </nav>
        )}
        <div className="ads-wz-body">
          <div className="ads-wz-main" data-testid={`ads-wz-main-${result ? 'done' : step}`}>{body}</div>
          {!result && options && (
            <aside className="ads-wz-side" aria-label="Ad preview">
              <PreviewPanel
                api={api}
                spec={spec}
                pageName={pageName}
                igName={page?.instagram.find((a) => a.id === spec.identity.instagramId)?.username || ''}
                ready={stepProblems(4, spec, ctx).length === 0 && stepProblems(5, spec, ctx).length === 0}
              />
            </aside>
          )}
        </div>
        {!result && options && (
          <div className="ads-wz-foot">
            <button type="button" className="ads-btn" onClick={() => go(step - 1)} disabled={step === 0} data-testid="ads-wz-back">
              Back
            </button>
            {/* In the footer: the CRM's toasts sit over the header's right side. */}
            <button type="button" className="ads-btn" onClick={saveDraft} disabled={saving} data-testid="ads-wz-save-draft">
              <span className="material-icons" aria-hidden="true">save</span>
              {saving ? 'Saving…' : 'Save draft'}
            </button>
            <span className="grow" />
            {step < 6 && problems.length > 0 && (
              <span className="ads-wz-why" data-testid="ads-wz-why">
                {problems[0]}
              </span>
            )}
            {step < 6 && (
              <button
                type="button"
                className="ads-btn primary"
                onClick={() => go(step + 1)}
                disabled={problems.length > 0}
                title={problems.join(' ') || undefined}
                data-testid="ads-wz-next"
              >
                Next
              </button>
            )}
          </div>
        )}
        {result && (
          <div className="ads-wz-foot">
            <span className="grow" />
            <button type="button" className="ads-btn primary" onClick={onClose} data-testid="ads-wz-done">
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

type SetSpec = (fn: (s: AdsCampaignSpec) => AdsCampaignSpec) => void;

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="ads-wz-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

// ------------------------------------------------------------ step: goal --

function StepGoal({
  spec,
  setSpec,
  options,
  onChangeObjective,
}: {
  spec: AdsCampaignSpec;
  setSpec: SetSpec;
  options: AdsCreateOptions;
  onChangeObjective: () => void;
}) {
  const o = OBJECTIVES[spec.objective];
  const a = options.account;
  const b = spec.budget;
  const setB = (patch: Partial<AdsCampaignSpec['budget']>) => setSpec((s) => ({ ...s, budget: { ...s.budget, ...patch } }));
  const step = a.minDailyBudgetMinor && a.minDailyBudget && a.minDailyBudget === a.minDailyBudgetMinor ? 1 : 0.01;

  return (
    <>
      <section className="ads-wz-section">
        <h4>Campaign details</h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: '#65676b', fontWeight: 500 }}>Buying type:</span>
          <span className="ads-chip" style={{ background: '#e4e6eb', color: '#050505', fontWeight: 600 }}>
            Auction
          </span>
          <span
            className="material-icons"
            style={{ fontSize: 16, color: '#65676b', cursor: 'help' }}
            title="Auction is the default buying type for Meta ads. Your ads compete against other advertisers in real-time auctions based on your bid, estimated action rates, and ad quality."
          >
            info
          </span>
        </div>

        <div className="ads-meta-card-summary">
          <div className="ads-meta-card-info">
            <div className="ads-meta-card-icon">
              <span className="material-icons">{o.icon}</span>
            </div>
            <div className="ads-meta-card-texts">
              <strong>{o.label}</strong>
              <p>{o.text}</p>
              {o.goodFor && o.goodFor.length > 0 && (
                <div className="ads-meta-card-tags">
                  {o.goodFor.map((g) => (
                    <span key={g} className="ads-meta-card-tag">{g}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            className="ads-btn"
            onClick={onChangeObjective}
            data-testid="ads-wz-change-objective"
            style={{ flexShrink: 0 }}
          >
            <span className="material-icons" style={{ fontSize: 16 }}>edit</span>
            Change
          </button>
        </div>
      </section>

      <section className="ads-wz-section">
        <Field label="Campaign name" hint="Give your campaign a descriptive name.">
          <input
            type="text"
            value={spec.name}
            maxLength={400}
            onChange={(e) => setSpec((s) => ({ ...s, name: e.target.value }))}
            placeholder={`e.g. ${o.label} Campaign – WhatsApp`}
            data-testid="ads-wz-name"
          />
        </Field>
      </section>

      <section className="ads-wz-section">
        <h4>Special ad categories</h4>
        <p className="hint">
          Declare if your ads are related to credit or financial products, employment, housing, or social issues, elections and politics. Requirements depend on the country where your ads are shown. Most businesses pick none.
        </p>
        <div className="ads-wz-checks">
          {SPECIAL.map(([k, l]) => (
            <label key={k}>
              <input
                type="checkbox"
                checked={spec.specialAdCategories.includes(k)}
                onChange={(e) =>
                  setSpec((s) => {
                    const cats = e.target.checked ? [...s.specialAdCategories, k] : s.specialAdCategories.filter((c) => c !== k);
                    const restricted = cats.some((c) => RESTRICTED.includes(c));
                    return {
                      ...s,
                      specialAdCategories: cats,
                      audience: restricted ? { ...s.audience, ageMin: 18, ageMax: 65, genders: 'all', detailed: s.audience.detailed.filter((d) => d.kind === 'interests' || d.kind === 'behaviors') } : s.audience,
                    };
                  })
                }
                data-testid={`ads-wz-special-${k}`}
              />
              {l}
            </label>
          ))}
        </div>
        {!spec.specialAdCategories.length && <small className="ads-wz-hint">None declared.</small>}
      </section>

      <section className="ads-wz-section">
        <div className="ads-meta-switch-row">
          <div className="ads-meta-switch-info">
            <strong>Advantage campaign budget</strong>
            <small>
              Advantage campaign budget will distribute your budget across currently delivering ad sets to get more results depending on your delivery optimization choices and bid strategy.
            </small>
          </div>
          <label className="ads-wz-switch" style={{ margin: 0 }}>
            <input
              type="checkbox"
              checked={b.level === 'campaign'}
              onChange={(e) => setB({ level: e.target.checked ? 'campaign' : 'adset' })}
              data-testid="ads-wz-cbo-toggle"
            />
            <span />
          </label>
        </div>

        {b.level === 'campaign' ? (
          <div style={{ marginTop: 12 }}>
            <div className="ads-wz-row">
              <Field label="Campaign budget type">
                <select value={b.type} onChange={(e) => setB({ type: e.target.value as 'daily' | 'lifetime' })} data-testid="ads-wz-cbo-type">
                  <option value="daily">Daily budget</option>
                  <option value="lifetime">Lifetime budget</option>
                </select>
              </Field>
              <Field
                label={`Budget amount (${a.currency})`}
                hint={
                  b.type === 'daily'
                    ? `Minimum: ${money(a.minDailyBudget, a.currency)} a day.`
                    : 'Set your overall campaign spend cap.'
                }
              >
                <input
                  type="number"
                  min={0}
                  step={step}
                  value={b.amount}
                  onChange={(e) => setB({ amount: e.target.value === '' ? '' : Number(e.target.value) })}
                  data-testid="ads-wz-cbo-amount"
                />
              </Field>
            </div>

            <div style={{ marginTop: 12 }}>
              <Field label="Campaign bid strategy" hint={BIDS.find((x) => x[0] === b.bidStrategy)?.[2]}>
                <select
                  value={b.bidStrategy}
                  onChange={(e) => setB({ bidStrategy: e.target.value as any })}
                  data-testid="ads-wz-cbo-bid-strategy"
                >
                  {BIDS.map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
              {b.bidStrategy !== 'LOWEST_COST_WITHOUT_CAP' && (
                <Field label={`${b.bidStrategy === 'COST_CAP' ? 'Cost per result goal' : 'Bid cap'} (${a.currency})`}>
                  <input
                    type="number"
                    min={0}
                    step={step}
                    value={b.bidAmount}
                    onChange={(e) => setB({ bidAmount: e.target.value === '' ? '' : Number(e.target.value) })}
                    data-testid="ads-wz-cbo-bid-amount"
                  />
                </Field>
              )}
            </div>
          </div>
        ) : (
          <small className="ads-wz-hint">
            Advantage campaign budget is off. You will set individual budgets at the ad set level in the next step.
          </small>
        )}
      </section>
    </>
  );
}

// ---------------------------------------------------------- step: budget --

// ---------------------------------------------------------- step: ad set & conversion --

export type ConversionLocationKey =
  | 'whatsapp'
  | 'website'
  | 'instant_forms'
  | 'messenger'
  | 'instagram'
  | 'calls'
  | 'instagram_live'
  | 'app'
  | 'website_instant_forms'
  | 'website_calls'
  | 'instant_forms_messenger';

export const CONVERSION_LOCATIONS: {
  group: 'multiple' | 'single';
  key: ConversionLocationKey;
  label: string;
  recommended?: boolean;
}[] = [
  // Multiple
  { group: 'multiple', key: 'website_instant_forms', label: 'Website and instant forms' },
  { group: 'multiple', key: 'website_calls', label: 'Website and calls' },
  { group: 'multiple', key: 'instant_forms_messenger', label: 'Instant forms and Messenger' },
  // Single
  { group: 'single', key: 'instagram_live', label: 'Instagram live video' },
  { group: 'single', key: 'website', label: 'Website' },
  { group: 'single', key: 'instant_forms', label: 'Instant forms', recommended: true },
  { group: 'single', key: 'messenger', label: 'Messenger' },
  { group: 'single', key: 'instagram', label: 'Instagram' },
  { group: 'single', key: 'whatsapp', label: 'WhatsApp' },
  { group: 'single', key: 'calls', label: 'Calls' },
  { group: 'single', key: 'app', label: 'App' },
];

function StepAdSet({
  api,
  spec,
  setSpec,
  options,
  page,
  conn,
  onReconnect,
}: {
  api: CrmApi;
  spec: AdsCampaignSpec;
  setSpec: SetSpec;
  options: AdsCreateOptions;
  page: AdsPageDetails | null;
  conn: MetaAdsConnection;
  onReconnect: () => void;
}) {
  const a = options.account;
  const b = spec.budget;
  const o = OBJECTIVES[spec.objective];

  // Default conversion location
  const initialConv = useMemo<ConversionLocationKey>(() => {
    if (spec.objective === 'leads') return 'instant_forms';
    if (spec.objective === 'traffic' || spec.objective === 'sales') return 'website';
    if (spec.objective === 'app_promotion') return 'app';
    return 'whatsapp';
  }, [spec.objective]);

  const [selectedConv, setSelectedConv] = useState<ConversionLocationKey>(initialConv);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [adsetName, setAdsetName] = useState(() => `${spec.name ? spec.name : o.label} ad set`);

  const currentConvItem = CONVERSION_LOCATIONS.find((c) => c.key === selectedConv) || CONVERSION_LOCATIONS[8]; // whatsapp fallback

  const days = budgetDays(spec, a.timezone);
  const minLifetime = days ? a.minDailyBudget * days : null;
  const setB = (patch: Partial<AdsCampaignSpec['budget']>) => setSpec((s) => ({ ...s, budget: { ...s.budget, ...patch } }));
  const step = a.minDailyBudgetMinor && a.minDailyBudget && a.minDailyBudget === a.minDailyBudgetMinor ? 1 : 0.01;

  // Handle conversion location change
  const handleSelectConv = (key: ConversionLocationKey) => {
    setSelectedConv(key);
    setDropdownOpen(false);

    // Dynamically adjust goal / CTA if applicable
    setSpec((s) => {
      let goal = s.optimizationGoal;
      let cta = s.creative.cta;
      if (key === 'whatsapp' || key === 'messenger' || key === 'instagram') {
        goal = 'CONVERSATIONS';
        cta = key === 'whatsapp' ? 'WHATSAPP_MESSAGE' : 'CONTACT_US';
      } else if (key === 'instant_forms' || key === 'website_instant_forms' || key === 'instant_forms_messenger') {
        goal = 'LEAD_GENERATION';
        cta = 'SIGN_UP';
      } else if (key === 'website' || key === 'website_calls') {
        goal = s.objective === 'sales' ? 'OFFSITE_CONVERSIONS' : 'LANDING_PAGE_VIEWS';
        cta = s.objective === 'sales' ? 'SHOP_NOW' : 'LEARN_MORE';
      } else if (key === 'calls') {
        goal = 'LINK_CLICKS';
        cta = 'CALL_NOW';
      } else if (key === 'app') {
        goal = 'LINK_CLICKS';
        cta = 'DOWNLOAD';
      }
      return {
        ...s,
        optimizationGoal: goal,
        creative: { ...s.creative, cta },
      };
    });
  };

  // WhatsApp numbers linked to this Page
  const waNumber = page?.whatsapp.number || '+91 79899 09361';

  return (
    <>
      {a.hasPaymentMethod === false && (
        <div className="ads-wz-warn" role="note" data-testid="ads-wz-no-payment">
          <span className="material-icons" aria-hidden="true">credit_card_off</span>
          <span>
            This ad account has no payment method. You can create the campaign, but Meta won’t deliver it until you add one in{' '}
            <a href={`https://business.facebook.com/billing_hub/payment_settings/?asset_id=${encodeURIComponent(a.id.replace(/^act_/, ''))}`} target="_blank" rel="noreferrer noopener">
              Meta billing
            </a>
            .
          </span>
        </div>
      )}

      {/* Ad set name (Matching Image 1) */}
      <section className="ads-wz-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <Field label="Ad set name" hint="Give your ad set a clear name to organize your targeting.">
              <input
                type="text"
                value={adsetName}
                maxLength={400}
                onChange={(e) => setAdsetName(e.target.value)}
                placeholder="e.g. New Leads ad set"
                data-testid="ads-wz-adset-name"
              />
            </Field>
          </div>
          <button
            type="button"
            className="ads-btn"
            style={{ marginTop: 8 }}
            onClick={() => setAdsetName(`${spec.name || o.label} · ${currentConvItem.label} · ${options.account.currency}`)}
          >
            Create template
          </button>
        </div>
      </section>

      {/* Conversion Section (Matching Images 1, 2 & 3) */}
      <section className="ads-wz-section">
        <h4>Conversion</h4>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#1c1e21', display: 'block', marginBottom: 2 }}>
            Conversion location
          </label>
          <p className="hint" style={{ margin: '0 0 8px 0' }}>
            Choose where you want to generate leads or drive customer actions.{' '}
            <a
              href="https://www.facebook.com/business/help/164749007013531"
              target="_blank"
              rel="noreferrer noopener"
              className="ads-meta-link"
            >
              About conversion locations
            </a>
          </p>

          {/* Meta Dropdown (Images 1 & 2) */}
          <div className="ads-meta-conv-dropdown">
            <button
              type="button"
              className="ads-meta-conv-trigger"
              onClick={() => setDropdownOpen((v) => !v)}
              aria-haspopup="listbox"
              aria-expanded={dropdownOpen}
              data-testid="ads-meta-conv-trigger"
            >
              <span>{currentConvItem.label}</span>
              <span className="material-icons" style={{ fontSize: 18, color: '#65676b' }}>
                {dropdownOpen ? 'expand_less' : 'expand_more'}
              </span>
            </button>

            {dropdownOpen && (
              <div className="ads-meta-conv-menu" role="listbox" aria-label="Conversion location options">
                {/* Multiple Group */}
                <div className="ads-meta-conv-group">
                  <div className="ads-meta-conv-group-title">Multiple</div>
                  <div className="ads-meta-conv-group-sub">Send people where they’re most likely to convert.</div>
                  {CONVERSION_LOCATIONS.filter((c) => c.group === 'multiple').map((loc) => {
                    const isSel = selectedConv === loc.key;
                    return (
                      <button
                        key={loc.key}
                        type="button"
                        role="option"
                        aria-selected={isSel}
                        className={`ads-meta-conv-item${isSel ? ' selected' : ''}`}
                        onClick={() => handleSelectConv(loc.key)}
                      >
                        <div className="ads-meta-conv-radio">
                          {isSel && <div className="ads-meta-conv-radio-dot" />}
                        </div>
                        <span>{loc.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Single Group */}
                <div className="ads-meta-conv-group">
                  <div className="ads-meta-conv-group-title">Single</div>
                  <div className="ads-meta-conv-group-sub">Send people to one location where you want them to convert.</div>
                  {CONVERSION_LOCATIONS.filter((c) => c.group === 'single').map((loc) => {
                    const isSel = selectedConv === loc.key;
                    return (
                      <button
                        key={loc.key}
                        type="button"
                        role="option"
                        aria-selected={isSel}
                        className={`ads-meta-conv-item${isSel ? ' selected' : ''}`}
                        onClick={() => handleSelectConv(loc.key)}
                      >
                        <div className="ads-meta-conv-radio">
                          {isSel && <div className="ads-meta-conv-radio-dot" />}
                        </div>
                        <span>{loc.label}</span>
                        {loc.recommended && (
                          <span className="ads-meta-badge-rec">
                            <span className="material-icons" style={{ fontSize: 13 }}>trending_up</span> Recommended
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Performance Goal */}
        <div style={{ marginTop: 16 }}>
          <Field
            label="Performance goal"
            hint={
              selectedConv === 'whatsapp'
                ? "We’ll try to show your ads to people most likely to have a conversation with you through WhatsApp."
                : selectedConv === 'instant_forms'
                  ? "We’ll try to show your ads to people most likely to share their contact information through an instant form."
                  : selectedConv === 'website'
                    ? "We’ll try to show your ads to people most likely to take an action on your website."
                    : selectedConv === 'calls'
                      ? "We’ll try to show your ads to people most likely to call your business."
                      : "How you measure success for your ads. Meta optimizes delivery to maximize this metric."
            }
          >
            <select
              value={spec.optimizationGoal}
              onChange={(e) => setSpec((s) => ({ ...s, optimizationGoal: e.target.value }))}
              data-testid="ads-wz-goal-select"
            >
              {o.goals.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {/* DYNAMIC FIELD: WhatsApp Selected (Image 3) */}
        {(selectedConv === 'whatsapp' || selectedConv === 'instant_forms_messenger') && (
          <div style={{ marginTop: 16 }}>
            <Field
              label="Facebook Page"
              hint="Choose the Facebook Page that you want to promote and run your WhatsApp ads from."
            >
              <select
                value={spec.identity.pageId}
                onChange={(e) => setSpec((s) => ({ ...s, identity: { ...s.identity, pageId: e.target.value } }))}
                data-testid="ads-wz-wa-page-select"
              >
                {options.pages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>

            {/* WhatsApp Card (Image 3) */}
            <div className="ads-meta-wa-card" data-testid="ads-meta-wa-card">
              <div className="ads-meta-wa-header">
                <div className="ads-meta-wa-logo">
                  <span className="material-icons" style={{ fontSize: 22 }}>chat</span>
                </div>
                <div className="ads-meta-wa-title">
                  <strong>WhatsApp</strong>
                  <small>{waNumber}</small>
                </div>
              </div>

              <div className="ads-meta-wa-select-row">
                <select
                  style={{ flex: 1, padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                  value={waNumber}
                  onChange={() => {}}
                >
                  <option value={waNumber}>{waNumber} (Linked to Page)</option>
                </select>
                <span style={{ fontSize: 12, color: '#65676b' }}>or</span>
                <button
                  type="button"
                  className="ads-meta-link"
                  onClick={onReconnect}
                  style={{ fontSize: 13 }}
                >
                  Connect another number
                </button>
              </div>

              <div className="ads-meta-wa-notice">
                <span className="material-icons">info</span>
                <span>
                  You can connect a maximum of 50 WhatsApp numbers per Facebook Page. Edit WhatsApp numbers in Business Manager and number connections in Page settings.
                </span>
              </div>

              <div className="ads-meta-wa-policy">
                <p>
                  WhatsApp information, including names and phone numbers, is subject to the data use restrictions in the Meta Advertising Policies. Your business and ads must also comply with the WhatsApp Commerce Policy. Links to WhatsApp on your website may be modified when people view your site in Facebook or Instagram.
                </p>
                <p style={{ margin: 0 }}>
                  Your ads that click to WhatsApp show "Active on WhatsApp" when you’re using the WhatsApp Business app. This lets people viewing your ads know they can expect a quick reply. You can turn this off in your WhatsApp privacy settings.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* DYNAMIC FIELD: Website Selected */}
        {(selectedConv === 'website' || selectedConv === 'website_instant_forms' || selectedConv === 'website_calls') && (
          <div style={{ marginTop: 16 }}>
            <Field label="Website URL" hint="The landing page where people will be sent after clicking your ad.">
              <input
                type="url"
                value={spec.creative.link}
                placeholder="https://example.com/landing-page"
                onChange={(e) => setSpec((s) => ({ ...s, creative: { ...s.creative, link: e.target.value } }))}
                data-testid="ads-wz-website-link"
              />
            </Field>

            {options.pixels.length > 0 ? (
              <SalesConversion api={api} spec={spec} setSpec={setSpec} pixels={options.pixels} events={EVENTS} />
            ) : (
              <p className="ads-wz-warn">
                No Meta pixel found on this ad account. Create one in Events Manager to track website conversions and visitor actions.
              </p>
            )}
          </div>
        )}

        {/* DYNAMIC FIELD: Instant Forms Selected */}
        {(selectedConv === 'instant_forms' || selectedConv === 'website_instant_forms' || selectedConv === 'instant_forms_messenger') && (
          <div style={{ marginTop: 16 }}>
            <Field label="Facebook Page" hint="Lead forms are created and owned by your connected Facebook Page.">
              <select
                value={spec.identity.pageId}
                onChange={(e) => setSpec((s) => ({ ...s, identity: { ...s.identity, pageId: e.target.value } }))}
              >
                {options.pages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>

            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Field label="Instant lead form" hint="Pick a form to collect names, phone numbers and customer details.">
                <select
                  value={spec.creative.leadFormId}
                  onChange={(e) => setSpec((s) => ({ ...s, creative: { ...s.creative, leadFormId: e.target.value } }))}
                  data-testid="ads-wz-form-select"
                >
                  <option value="">Choose an existing form or create one below</option>
                  {options.leadFormsPage?.hasToken && (
                    <option value="new_form">Create a new lead form</option>
                  )}
                </select>
              </Field>
              <a
                href={`https://business.facebook.com/latest/instant_forms/forms?asset_id=${encodeURIComponent(spec.identity.pageId || conn.pageId || '')}`}
                target="_blank"
                rel="noreferrer noopener"
                className="ads-btn"
                style={{ marginTop: 22, flexShrink: 0 }}
              >
                <span className="material-icons" style={{ fontSize: 16 }}>open_in_new</span> Manage forms
              </a>
            </div>
          </div>
        )}

        {/* DYNAMIC FIELD: Calls Selected */}
        {(selectedConv === 'calls' || selectedConv === 'website_calls') && (
          <div style={{ marginTop: 16 }}>
            <Field label="Phone number for calls" hint="Enter the phone number people will call when they tap your ad.">
              <input
                type="tel"
                value={spec.creative.displayLink}
                placeholder="+91 9876543210"
                onChange={(e) => setSpec((s) => ({ ...s, creative: { ...s.creative, displayLink: e.target.value } }))}
                data-testid="ads-wz-calls-phone"
              />
            </Field>
          </div>
        )}

        {/* DYNAMIC FIELD: App Selected */}
        {selectedConv === 'app' && (
          <div style={{ marginTop: 16 }}>
            <Field label="App store URL" hint="Direct link to your application on the Apple App Store or Google Play Store.">
              <input
                type="url"
                value={spec.creative.link}
                placeholder="https://play.google.com/store/apps/details?id=..."
                onChange={(e) => setSpec((s) => ({ ...s, creative: { ...s.creative, link: e.target.value } }))}
                data-testid="ads-wz-app-url"
              />
            </Field>
          </div>
        )}

        {/* DYNAMIC FIELD: Messenger or Instagram Selected */}
        {(selectedConv === 'messenger' || selectedConv === 'instagram') && (
          <div style={{ marginTop: 16 }}>
            <Field label="Facebook Page" hint="The Page that powers your Messenger and Instagram presence.">
              <select
                value={spec.identity.pageId}
                onChange={(e) => setSpec((s) => ({ ...s, identity: { ...s.identity, pageId: e.target.value } }))}
              >
                {options.pages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>

            {page?.instagram.length ? (
              <Field label="Instagram account" hint="The connected Instagram profile for direct messaging.">
                <select
                  value={spec.identity.instagramId}
                  onChange={(e) => setSpec((s) => ({ ...s, identity: { ...s.identity, instagramId: e.target.value } }))}
                >
                  <option value="">Use Facebook Page profile</option>
                  {page.instagram.map((ig) => (
                    <option key={ig.id} value={ig.id}>
                      @{ig.username}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
          </div>
        )}
      </section>

      {/* Budget and schedule Section */}
      <section className="ads-wz-section">
        <h4>Budget and schedule</h4>
        {b.level === 'campaign' ? (
          <div className="ads-meta-card-summary" style={{ marginBottom: 16 }}>
            <div className="ads-meta-card-info">
              <div className="ads-meta-card-icon" style={{ background: '#e7f3ff', color: '#1877f2' }}>
                <span className="material-icons">auto_awesome</span>
              </div>
              <div className="ads-meta-card-texts">
                <strong>Advantage campaign budget is active</strong>
                <p>
                  Campaign budget of <strong>{money(b.amount || 0, a.currency)}</strong> ({b.type === 'daily' ? 'Daily' : 'Lifetime'}) is managed at the campaign level. Spend will be automatically distributed across ad sets.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="ads-wz-choice" role="radiogroup" aria-label="Budget level">
              {([
                ['campaign', 'Advantage campaign budget', 'Meta spreads one budget across the campaign.'],
                ['adset', 'Ad set budget', 'The budget sits on the ad set.'],
              ] as const).map(([k, l, t]) => (
                <label key={k} className={b.level === k ? 'on' : ''} title={t}>
                  <input type="radio" name="ads-budget-level" checked={b.level === k} onChange={() => setB({ level: k })} data-testid={`ads-wz-level-${k}`} />
                  {l}
                </label>
              ))}
            </div>
            <div className="ads-wz-row">
              <Field label="Budget type">
                <select value={b.type} onChange={(e) => setB({ type: e.target.value as 'daily' | 'lifetime' })} data-testid="ads-wz-budget-type">
                  <option value="daily">Daily budget</option>
                  <option value="lifetime">Lifetime budget</option>
                </select>
              </Field>
              <Field
                label={`Amount (${a.currency})`}
                hint={
                  b.type === 'daily'
                    ? `Meta’s minimum: ${money(a.minDailyBudget, a.currency)} a day${a.minDailyBudgetSource === 'fallback' ? ' (approximate; Meta checks it on create)' : ''}.`
                    : minLifetime
                      ? `At least ${money(minLifetime, a.currency)} for ${days} day${days === 1 ? '' : 's'} (${money(a.minDailyBudget, a.currency)} × days).`
                      : 'Pick an end date below.'
                }
              >
                <input
                  type="number"
                  min={0}
                  step={step}
                  value={b.amount}
                  onChange={(e) => setB({ amount: e.target.value === '' ? '' : Number(e.target.value) })}
                  data-testid="ads-wz-amount"
                />
              </Field>
            </div>

            <div style={{ marginTop: 12 }}>
              <Field label="Bid strategy" hint={BIDS.find((x) => x[0] === b.bidStrategy)?.[2]}>
                <select
                  value={b.bidStrategy}
                  onChange={(e) => setB({ bidStrategy: e.target.value as any })}
                  data-testid="ads-wz-bid-strategy"
                >
                  {BIDS.map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
              {b.bidStrategy !== 'LOWEST_COST_WITHOUT_CAP' && (
                <Field label={`${b.bidStrategy === 'COST_CAP' ? 'Cost per result goal' : 'Bid cap'} (${a.currency})`}>
                  <input
                    type="number"
                    min={0}
                    step={step}
                    value={b.bidAmount}
                    onChange={(e) => setB({ bidAmount: e.target.value === '' ? '' : Number(e.target.value) })}
                    data-testid="ads-wz-bid-amount"
                  />
                </Field>
              )}
            </div>
          </>
        )}

        <div style={{ marginTop: 16 }}>
          <h5 style={{ margin: '0 0 4px 0', fontSize: 13, fontWeight: 600 }}>Schedule</h5>
          <p className="hint">Times are in the ad account’s time zone ({a.timezone}). Leave the start empty to start as soon as Meta approves the ad after you publish.</p>
          <div className="ads-wz-row">
            <Field label="Start">
              <input
                type="datetime-local"
                value={spec.schedule.start}
                min={nowLocal(a.timezone)}
                onChange={(e) => setSpec((s) => ({ ...s, schedule: { ...s.schedule, start: e.target.value } }))}
                data-testid="ads-wz-start"
              />
            </Field>
            <Field label={b.type === 'lifetime' ? 'End (required)' : 'End (optional)'}>
              <input
                type="datetime-local"
                value={spec.schedule.end}
                min={nowLocal(a.timezone, DAY)}
                onChange={(e) => setSpec((s) => ({ ...s, schedule: { ...s.schedule, end: e.target.value } }))}
                data-testid="ads-wz-end"
              />
            </Field>
          </div>
        </div>
      </section>
    </>
  );
}

// -------------------------------------------------------- step: audience --

export function SearchBox<T>({
  placeholder, search, render, keyOf, onPick, testid, minChars = 1,
}: {
  placeholder: string;
  search: (q: string) => Promise<T[]>;
  render: (t: T) => ReactNode;
  keyOf: (t: T) => string;
  onPick: (t: T) => void;
  testid: string;
  minChars?: number;
}) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q, q, 300);
  const [results, setResults] = useState<T[]>([]);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const searchRef = useRef(search);
  searchRef.current = search;
  useEffect(() => {
    if (dq.trim().length < minChars) {
      setResults([]);
      return undefined;
    }
    let live = true;
    setError('');
    searchRef
      .current(dq.trim())
      .then((r) => {
        if (!live) return;
        setResults(r);
        setOpen(true);
      })
      .catch((e) => live && setError(errCode(e) === 'RATE_LIMITED' ? 'Meta is busy, try again shortly.' : errText(e)));
    return () => {
      live = false;
    };
  }, [dq, minChars]);
  return (
    <div className="ads-wz-search" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOpen(false)}>
      <input
        type="search"
        value={q}
        placeholder={placeholder}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
        data-testid={testid}
        aria-label={placeholder}
      />
      {error && <small className="ads-wz-hint" role="alert">{error}</small>}
      {open && results.length > 0 && (
        <ul className="ads-wz-results" data-testid={`${testid}-results`}>
          {results.map((r) => (
            <li key={keyOf(r)}>
              <button
                type="button"
                onClick={() => {
                  onPick(r);
                  setQ('');
                  setResults([]);
                  setOpen(false);
                }}
              >
                {render(r)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function StepAudience({ api, spec, setSpec, hideSavedStart = false }: { api: CrmApi; spec: AdsCampaignSpec; setSpec: SetSpec; hideSavedStart?: boolean }) {
  const a = spec.audience;
  const restricted = spec.specialAdCategories.some((c) => RESTRICTED.includes(c));
  const [exclude, setExclude] = useState(false);
  const [browse, setBrowse] = useState<'' | 'interests' | 'behaviors' | 'demographics'>('');
  const [browseItems, setBrowseItems] = useState<AdsDetailedItem[] | null>(null);
  const [browseFilter, setBrowseFilter] = useState('');
  const [browseError, setBrowseError] = useState('');
  const setA = (patch: Partial<AdsCampaignSpec['audience']>) => setSpec((s) => ({ ...s, audience: { ...s.audience, ...patch } }));

  useEffect(() => {
    if (!browse) return undefined;
    let live = true;
    setBrowseItems(null);
    setBrowseError('');
    api
      .browseAdsTargeting(browse)
      .then((r) => live && setBrowseItems(r.items))
      .catch((e) => live && setBrowseError(errText(e)));
    return () => {
      live = false;
    };
  }, [api, browse]);

  function addGeo(g: AdsGeoItem) {
    const list = exclude ? a.excludedLocations : a.locations;
    if (list.some((x) => x.key === g.key && x.kind === g.kind)) return;
    const item: AdsGeoItem = { key: g.key, kind: g.kind, name: g.label || g.name, countryCode: g.countryCode, radius: g.kind === 'city' && g.supportsRadius ? (restricted ? 25 : null) : null, supportsRadius: g.supportsRadius };
    setA(exclude ? { excludedLocations: [...list, item] } : { locations: [...list, item] });
  }
  const addDetailed = (d: AdsDetailedItem) => {
    if (a.detailed.some((x) => x.id === d.id)) return;
    setA({ detailed: [...a.detailed, { id: d.id, kind: d.kind, name: d.name }] });
  };
  const ages = Array.from({ length: 48 }, (_, i) => i + 18);

  return (
    <>
      <EstimateBox api={api} spec={spec} />
      {!hideSavedStart && <SavedAudienceStart api={api} spec={spec} setSpec={setSpec} />}
      <section className="ads-wz-section">
        <h4>Locations</h4>
        <p className="hint">Countries, regions or cities (with a radius). Switch to “Exclude” to leave places out.</p>
        <div className="ads-wz-choice">
          <label className={!exclude ? 'on' : ''}>
            <input type="radio" name="ads-geo-mode" checked={!exclude} onChange={() => setExclude(false)} /> Include
          </label>
          <label className={exclude ? 'on' : ''}>
            <input type="radio" name="ads-geo-mode" checked={exclude} onChange={() => setExclude(true)} data-testid="ads-wz-geo-exclude" /> Exclude
          </label>
        </div>
        <SearchBox<AdsGeoItem>
          placeholder="Search countries, regions, cities"
          search={async (q) => (await api.searchAdsTargeting('geo', q)).results}
          keyOf={(g) => `${g.kind}:${g.key}`}
          render={(g) => (
            <>
              <span>{g.label || g.name}</span>
              <small>{g.kind}</small>
            </>
          )}
          onPick={addGeo}
          testid="ads-wz-geo-search"
        />
        <div className="ads-wz-chips" data-testid="ads-wz-locations">
          {a.locations.map((g) => (
            <span key={`${g.kind}:${g.key}`} className="ads-wz-chip">
              {g.name}
              {g.kind === 'city' && g.supportsRadius !== false && (
                <select
                  aria-label={`Radius around ${g.name}`}
                  value={g.radius ?? ''}
                  onChange={(e) => setA({ locations: a.locations.map((x) => (x === g ? { ...x, radius: e.target.value ? Number(e.target.value) : null } : x)) })}
                >
                  {!restricted && <option value="">city only</option>}
                  {[17, 25, 40, 50, 65, 80].filter((km) => !restricted || km >= 25).map((km) => (
                    <option key={km} value={km}>
                      +{km} km
                    </option>
                  ))}
                </select>
              )}
              <button type="button" aria-label={`Remove ${g.name}`} onClick={() => setA({ locations: a.locations.filter((x) => x !== g) })}>
                ×
              </button>
            </span>
          ))}
          {a.excludedLocations.map((g) => (
            <span key={`x${g.kind}:${g.key}`} className="ads-wz-chip ex">
              Excluded: {g.name}
              <button type="button" aria-label={`Remove ${g.name}`} onClick={() => setA({ excludedLocations: a.excludedLocations.filter((x) => x !== g) })}>
                ×
              </button>
            </span>
          ))}
          {!a.locations.length && <small className="ads-wz-hint">No locations yet.</small>}
        </div>
      </section>
      <section className="ads-wz-section">
        <h4>Age and gender</h4>
        {restricted && <p className="hint">Special ad categories must target all ages and genders.</p>}
        <div className="ads-wz-row">
          <Field label="Minimum age">
            <select value={a.ageMin} disabled={restricted} onChange={(e) => setA({ ageMin: Number(e.target.value) })} data-testid="ads-wz-age-min">
              {ages.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Maximum age">
            <select value={a.ageMax} disabled={restricted} onChange={(e) => setA({ ageMax: Number(e.target.value) })} data-testid="ads-wz-age-max">
              {ages.map((n) => (
                <option key={n} value={n}>
                  {n === 65 ? '65+' : n}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Gender">
            <select value={a.genders} disabled={restricted} onChange={(e) => setA({ genders: e.target.value as 'all' | 'male' | 'female' })} data-testid="ads-wz-gender">
              <option value="all">All</option>
              <option value="male">Men</option>
              <option value="female">Women</option>
            </select>
          </Field>
        </div>
      </section>
      <section className="ads-wz-section">
        <h4>Detailed targeting</h4>
        <p className="hint">Interests, behaviours and demographics. People who match any of them can see the ad.</p>
        <SearchBox<AdsDetailedItem>
          placeholder="Search interests (e.g. cooking)"
          search={async (q) => (await api.searchAdsTargeting('interest', q)).results}
          keyOf={(d) => d.id}
          render={(d) => (
            <>
              <span>{d.name}</span>
              <small>{d.sizeUpper ? `${compact(d.sizeLower || 0)}–${compact(d.sizeUpper)}` : d.path?.slice(0, -1).join(' › ')}</small>
            </>
          )}
          onPick={addDetailed}
          testid="ads-wz-interest-search"
        />
        <div className="ads-wz-choice" style={{ marginTop: 8 }}>
          {(['interests', 'behaviors', 'demographics'] as const).map((c) => (
            <button key={c} type="button" className={`ads-btn sm${browse === c ? ' primary' : ''}`} onClick={() => setBrowse(browse === c ? '' : c)} data-testid={`ads-wz-browse-${c}`}>
              Browse {c}
            </button>
          ))}
        </div>
        {browse && (
          <div data-testid="ads-wz-browse">
            {browseError && <p className="ads-wz-hint" role="alert">{browseError}</p>}
            {!browseItems && !browseError && <BladeSpinner center={true} containerHeight={60} />}
            {browseItems && (
              <>
                <input type="search" placeholder="Filter" value={browseFilter} onChange={(e) => setBrowseFilter(e.target.value)} aria-label="Filter the list" />
                <ul className="ads-wz-results" style={{ position: 'static', marginTop: 6 }}>
                  {browseItems
                    .filter((i) => !browseFilter || `${i.name} ${(i.path || []).join(' ')}`.toLowerCase().includes(browseFilter.toLowerCase()))
                    .filter((i) => !restricted || i.kind === 'interests' || i.kind === 'behaviors')
                    .slice(0, 80)
                    .map((i) => (
                      <li key={i.id}>
                        <button type="button" onClick={() => addDetailed(i)} disabled={a.detailed.some((x) => x.id === i.id)}>
                          <span>{i.name}</span>
                          <small>{(i.path || []).slice(0, -1).join(' › ') || i.kind}</small>
                        </button>
                      </li>
                    ))}
                </ul>
              </>
            )}
          </div>
        )}
        <div className="ads-wz-chips" data-testid="ads-wz-detailed">
          {a.detailed.map((d) => (
            <span key={d.id} className="ads-wz-chip">
              {d.name}
              <button type="button" aria-label={`Remove ${d.name}`} onClick={() => setA({ detailed: a.detailed.filter((x) => x.id !== d.id) })}>
                ×
              </button>
            </span>
          ))}
        </div>
      </section>
      <CustomAudiencePicker api={api} spec={spec} setSpec={setSpec} />
      <section className="ads-wz-section">
        <h4>Languages</h4>
        <SearchBox<AdsLocaleItem>
          placeholder="Search languages (optional)"
          search={async (q) => (await api.searchAdsTargeting('locale', q)).results}
          keyOf={(l) => String(l.key)}
          render={(l) => <span>{l.name}</span>}
          onPick={(l) => !a.locales.some((x) => x.key === l.key) && setA({ locales: [...a.locales, l] })}
          testid="ads-wz-locale-search"
        />
        <div className="ads-wz-chips">
          {a.locales.map((l) => (
            <span key={l.key} className="ads-wz-chip">
              {l.name}
              <button type="button" aria-label={`Remove ${l.name}`} onClick={() => setA({ locales: a.locales.filter((x) => x.key !== l.key) })}>
                ×
              </button>
            </span>
          ))}
        </div>
      </section>
      <section className="ads-wz-section">
        <label className="ads-wz-switch">
          <input type="checkbox" checked={a.advantageAudience} onChange={(e) => setA({ advantageAudience: e.target.checked })} data-testid="ads-wz-advantage" />
          <span>
            <strong>Advantage+ audience</strong>
            <br />
            Meta may show the ad beyond your age, gender and interest choices when that’s likely to get better results. Locations, languages and the minimum age stay
            fixed. With it on, Meta treats your ages as a suggestion (the minimum can be at most 25, the maximum is 65+).
          </span>
        </label>
      </section>
    </>
  );
}

function EstimateBox({ api, spec }: { api: CrmApi; spec: AdsCampaignSpec }) {
  const body = useMemo(
    () => ({
      objective: spec.objective, optimizationGoal: spec.optimizationGoal, specialAdCategories: spec.specialAdCategories, audience: spec.audience,
      placements: spec.placements, identity: { pageId: spec.identity.pageId, instagramId: '' }, pixelId: spec.pixelId, conversionEvent: spec.conversionEvent, budget: spec.budget,
    }),
    [spec],
  );
  const key = JSON.stringify(body);
  const debounced = useDebounced(body, key, 800);
  const dkey = JSON.stringify(debounced);
  const [est, setEst] = useState<AdsEstimate | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!debounced.audience.locations.length || debounced.audience.ageMin > debounced.audience.ageMax) {
      setEst(null);
      return undefined;
    }
    let live = true;
    setLoading(true);
    setError('');
    api
      .estimateAdsAudience(debounced as Partial<AdsCampaignSpec>)
      .then((r) => live && setEst(r))
      .catch((e) => live && setError(errCode(e) === 'RATE_LIMITED' ? 'Meta is busy, the estimate updates shortly.' : errText(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [api, dkey]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="ads-wz-estimate" aria-live="polite" data-testid="ads-wz-estimate">
      <span className="material-icons" aria-hidden="true">groups</span>
      <div>
        {!spec.audience.locations.length ? (
          <span>Add a location to see the estimated audience size.</span>
        ) : error ? (
          <span>Estimate unavailable: {error}</span>
        ) : est && est.upper ? (
          <>
            Estimated audience size: <strong data-testid="ads-wz-estimate-size">{compact(est.lower || 0)} – {compact(est.upper)}</strong>
            {est.dailyReach ? <> · about {compact(est.dailyReach)} people a day for this budget</> : null}
            {!est.ready && <> (still being calculated)</>}
          </>
        ) : loading ? (
          <span>Estimating…</span>
        ) : (
          <span>Meta has no estimate for this audience yet.</span>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------ step: placements --

export function StepPlacements({ spec, setSpec }: { spec: AdsCampaignSpec; setSpec: SetSpec }) {
  const p = spec.placements;
  const setP = (patch: Partial<AdsCampaignSpec['placements']>) => setSpec((s) => ({ ...s, placements: { ...s.placements, ...patch } }));
  const togglePlatform = (k: string, on: boolean) => {
    const platforms = on ? [...p.platforms, k] : p.platforms.filter((x) => x !== k);
    const positions = { ...p.positions };
    if (on && !(positions[k] || []).length) positions[k] = POSITIONS[k].map(([x]) => x);
    setP({ platforms, positions });
  };
  return (
    <section className="ads-wz-section">
      <h4>Placements</h4>
      <div className="ads-wz-choice" role="radiogroup" aria-label="Placements">
        <label className={p.mode === 'automatic' ? 'on' : ''}>
          <input type="radio" name="ads-placements" checked={p.mode === 'automatic'} onChange={() => setP({ mode: 'automatic' })} data-testid="ads-wz-placements-auto" />
          Advantage+ placements (recommended)
        </label>
        <label className={p.mode === 'manual' ? 'on' : ''}>
          <input type="radio" name="ads-placements" checked={p.mode === 'manual'} onChange={() => setP({ mode: 'manual' })} data-testid="ads-wz-placements-manual" />
          Manual placements
        </label>
      </div>
      {p.mode === 'automatic' ? (
        <p className="ads-wz-hint">Meta shows the ad where it’s likely to perform best across Facebook, Instagram, Messenger and the Audience Network.</p>
      ) : (
        <>
          <div className="ads-wz-checks">
            {PLATFORMS.map(([k, l]) => (
              <label key={k}>
                <input
                  type="checkbox"
                  checked={p.platforms.includes(k)}
                  disabled={k === 'audience_network' && spec.objective === 'leads'}
                  title={k === 'audience_network' && spec.objective === 'leads' ? 'Lead form ads can’t run on the Audience Network.' : undefined}
                  onChange={(e) => togglePlatform(k, e.target.checked)}
                  data-testid={`ads-wz-platform-${k}`}
                />
                {l}
              </label>
            ))}
          </div>
          {p.platforms.map((pl) => (
            <fieldset key={pl} className="ads-wz-section" style={{ marginTop: 8 }}>
              <legend style={{ fontWeight: 600, fontSize: 13 }}>{PLATFORMS.find((x) => x[0] === pl)?.[1]} positions</legend>
              <div className="ads-wz-checks">
                {POSITIONS[pl].map(([k, l]) => (
                  <label key={k}>
                    <input
                      type="checkbox"
                      checked={(p.positions[pl] || []).includes(k)}
                      onChange={(e) =>
                        setP({ positions: { ...p.positions, [pl]: e.target.checked ? [...(p.positions[pl] || []), k] : (p.positions[pl] || []).filter((x) => x !== k) } })
                      }
                    />
                    {l}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <div className="ads-wz-row">
            <Field label="Devices">
              <select
                value={p.devices.length === 2 ? 'all' : p.devices[0]}
                onChange={(e) => setP({ devices: e.target.value === 'all' ? ['mobile', 'desktop'] : [e.target.value], os: e.target.value === 'mobile' ? p.os : 'all' })}
                data-testid="ads-wz-devices"
              >
                <option value="all">Mobile and desktop</option>
                <option value="mobile">Mobile only</option>
                <option value="desktop">Desktop only</option>
              </select>
            </Field>
            <Field label="Operating system" hint={p.devices.length !== 1 || p.devices[0] !== 'mobile' ? 'Pick mobile only to choose one.' : undefined}>
              <select value={p.os} disabled={p.devices.length !== 1 || p.devices[0] !== 'mobile'} onChange={(e) => setP({ os: e.target.value as 'all' | 'ios' | 'android' })}>
                <option value="all">All</option>
                <option value="ios">iOS only</option>
                <option value="android">Android only</option>
              </select>
            </Field>
          </div>
        </>
      )}
    </section>
  );
}

// -------------------------------------------------------- step: identity --

function StepIdentity({
  spec, setSpec, options, page, pageError, conn, onReconnect,
}: {
  spec: AdsCampaignSpec;
  setSpec: SetSpec;
  options: AdsCreateOptions;
  page: AdsPageDetails | null;
  pageError: string;
  conn: MetaAdsConnection;
  onReconnect: () => void;
}) {
  const current = page && page.page.id === spec.identity.pageId ? page : null;
  return (
    <section className="ads-wz-section">
      <h4>Identity</h4>
      <p className="hint">The Facebook Page (and optionally the Instagram account) your ad is shown from.</p>
      {!options.pages.length && (
        <div className="ads-wz-warn">
          This ad account can’t promote any Facebook Page yet. Give the ad account access to your Page in Meta Business Suite (Settings → Accounts → Pages), then reload.
        </div>
      )}
      <Field label="Facebook Page">
        <select value={spec.identity.pageId} onChange={(e) => setSpec((s) => ({ ...s, identity: { pageId: e.target.value, instagramId: '' } }))} data-testid="ads-wz-page">
          <option value="">Choose a Page…</option>
          {options.pages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.leadForms ? ' (lead forms)' : ''}
            </option>
          ))}
        </select>
      </Field>
      {pageError && <p className="ads-wz-error" role="alert">{pageError}</p>}
      {spec.identity.pageId && !current && !pageError && <BladeSpinner center={true} containerHeight={50} />}
      {current && (
        <>
          <Field label="Instagram account" hint={current.instagram.length ? undefined : instagramIssueText(current.instagramIssue)}>
            <select value={spec.identity.instagramId} onChange={(e) => setSpec((s) => ({ ...s, identity: { ...s.identity, instagramId: e.target.value } }))} data-testid="ads-wz-instagram">
              <option value="">Use the Facebook Page</option>
              {current.instagram.map((a) => (
                <option key={a.id} value={a.id}>
                  @{a.username || a.id}
                </option>
              ))}
            </select>
          </Field>
          {spec.objective === 'whatsapp' && (
            <div data-testid="ads-wz-wa-check">
              {current.whatsapp.linked === true ? (
                <div className="ads-wz-ok">
                  <span className="material-icons" aria-hidden="true">check_circle</span>
                  <span>
                    WhatsApp is linked to this Page{current.whatsapp.number ? `: ${current.whatsapp.number}` : ''}. Chats from the ad open with that number.
                  </span>
                </div>
              ) : current.whatsapp.linked === false ? (
                <div className="ads-wz-error" role="alert">
                  <span className="material-icons" aria-hidden="true">error_outline</span>
                  <span>
                    This Page has no WhatsApp number linked, so a Click-to-WhatsApp ad can’t run from it. Link your WhatsApp Business number: open the Page on
                    Facebook → Settings → Linked accounts → WhatsApp (or Meta Business Suite → Settings → WhatsApp accounts), confirm the code, then pick the Page
                    again.
                  </span>
                </div>
              ) : (
                <div className="ads-wz-warn" data-testid="ads-wz-wa-unknown">
                  Meta doesn’t share this Page’s WhatsApp link with the CRM, so it can’t be checked here. If your WhatsApp number is linked to the Page
                  (Facebook → Page settings → Linked accounts → WhatsApp), you can continue. Meta checks it when the campaign is created.
                </div>
              )}
            </div>
          )}
          {spec.objective === 'leads' && spec.identity.pageId !== conn.pageId && (
            <div className="ads-wz-warn" data-testid="ads-wz-leads-page">
              <span>
                Lead forms live on the Page connected for lead forms{conn.pageName ? ` (${conn.pageName})` : ''}. {conn.pageId ? 'Pick that Page, or reconnect' : 'Reconnect'} and choose
                this Page for lead forms.
              </span>
              <button type="button" className="ads-btn sm" onClick={onReconnect}>
                Reconnect
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// -------------------------------------------------------- step: creative --

function MediaUpload({
  api, kind, canManage, onImage, onVideo, testid,
}: {
  api: CrmApi;
  kind: 'image' | 'video';
  canManage: boolean;
  onImage?: (hash: string, url: string) => void;
  onVideo?: (id: string, thumb: string) => void;
  testid: string;
}) {
  const notify = useNotify();
  const [busy, setBusy] = useState(false);
  // A video goes to the CRM server first, then the server sends it to Meta
  // in the background: 'sending' while this polls for Meta's video id.
  const [phase, setPhase] = useState<'' | 'uploading' | 'sending'>('');
  // Percent of the file the browser has sent to the CRM server, then (videos)
  // the percent the server has sent on to Meta.
  const [pct, setPct] = useState(0);
  const [sent, setSent] = useState(0);
  const [lib, setLib] = useState<{ key: string; thumb: string; hash?: string; id?: string }[] | null>(null);
  const [libOpen, setLibOpen] = useState(false);
  const [libError, setLibError] = useState('');
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true; // StrictMode mounts twice: set it again after the simulated unmount
    return () => {
      alive.current = false;
    };
  }, []);
  const [stillProcessing, setStillProcessing] = useState(false);
  /**
   * Poll the server's upload job for Meta's video id. Transient poll errors
   * (network, 408, 429, 5xx) are retried with backoff; when the retries or
   * the loop run out, the upload may still finish, so the user is told the
   * video is still processing at Meta and will appear in the media library.
   */
  async function waitForMeta(uploadId: string): Promise<string> {
    let errors = 0;
    for (let i = 0; i < VIDEO_POLL_TRIES && alive.current; i += 1) {
      const wait = errors ? Math.min(VIDEO_POLL_MS * 2 ** errors, VIDEO_BACKOFF_MAX_MS) : VIDEO_POLL_MS;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, wait));
      if (!alive.current) break;
      let upload;
      try {
        // eslint-disable-next-line no-await-in-loop
        ({ upload } = await api.getAdVideoUpload(uploadId));
        errors = 0;
      } catch (e) {
        const s = Number((e as Error & { status?: number })?.status || 0);
        const transient = !s || s === 408 || s === 429 || s >= 500;
        if (!transient) throw e;
        if (errors >= VIDEO_POLL_RETRIES) break;
        errors += 1;
        continue;
      }
      if (alive.current && typeof upload.sentPercent === 'number') setSent(Math.max(0, Math.min(100, Math.round(upload.sentPercent))));
      if (upload.status === 'done' && upload.videoId) return upload.videoId;
      if (upload.status === 'failed') throw Object.assign(new Error(upload.error?.message || 'Meta didn’t accept the video. Upload another one.'), { data: { code: upload.error?.code || 'UPLOAD_FAILED' } });
    }
    if (alive.current) {
      setStillProcessing(true);
      setLib(null); // read the library again next time it opens
      notify('error', 'Video still processing at Meta', VIDEO_STILL_TEXT);
    }
    return '';
  }
  async function onFile(f: File | undefined) {
    if (!f) return;
    const max = kind === 'image' ? IMAGE_MAX : VIDEO_MAX;
    if (f.size > max) {
      notify('error', 'File too large', `Use a file under ${Math.round(max / 1048576)} MB.`);
      return;
    }
    setBusy(true);
    setPhase('uploading');
    setPct(0);
    setSent(0);
    setStillProcessing(false);
    const onProgress = (p: number) => {
      if (alive.current) setPct(p);
    };
    try {
      if (kind === 'image') {
        const r = await api.uploadAdImage(f, onProgress);
        onImage?.(r.image.hash, r.image.url);
      } else {
        const r = await api.uploadAdVideo(f, onProgress);
        if (!alive.current) return;
        setPhase('sending');
        setSent(Math.max(0, Math.min(100, Math.round(r.upload.sentPercent || 0))));
        const videoId = r.upload.status === 'done' && r.upload.videoId ? r.upload.videoId : await waitForMeta(r.upload.id);
        if (videoId && alive.current) onVideo?.(videoId, '');
      }
    } catch (e) {
      if (alive.current) notify('error', errTitle(e, 'Upload failed'), errText(e));
    } finally {
      if (alive.current) {
        setBusy(false);
        setPhase('');
      }
    }
  }
  function openLib() {
    setLibOpen((o) => !o);
    if (lib) return;
    setLibError('');
    api
      .getAdsMediaLibrary(kind)
      .then((r) => setLib(r.items.map((i) => ({ key: i.hash || i.id || '', thumb: i.thumbUrl, hash: i.hash, id: i.id }))))
      .catch((e) => setLibError(errText(e)));
  }
  return (
    <div>
      <div className="ads-wz-media">
        <label
          className={`ads-btn${canManage ? '' : ' disabled'}`}
          title={canManage ? undefined : 'Uploading needs ads_management (the account is read-only).'}
          style={canManage ? undefined : { opacity: 0.55, cursor: 'not-allowed' }}
        >
          <span className="material-icons" aria-hidden="true">upload</span>
          {busy ? (phase === 'sending' ? `Sending to Meta… ${sent}%` : `Uploading… ${pct}%`) : kind === 'image' ? 'Upload image' : 'Upload video'}
          <input
            type="file"
            hidden
            disabled={busy || !canManage}
            accept={kind === 'image' ? 'image/jpeg,image/png,image/gif' : 'video/mp4,video/quicktime'}
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = '';
            }}
            data-testid={`${testid}-file`}
          />
        </label>
        <button type="button" className="ads-btn" onClick={openLib} data-testid={`${testid}-library`}>
          <span className="material-icons" aria-hidden="true">photo_library</span>
          From your ad account
        </button>
        <small className="ads-wz-hint" style={{ margin: 0 }}>{kind === 'image' ? 'JPG, PNG or GIF up to 8 MB. 1080 × 1080 works everywhere.' : 'MP4 or MOV up to 250 MB.'}</small>
      </div>
      {busy && phase && (
        <div className="ads-wz-upload" data-testid={`${testid}-upload`}>
          <div className="ads-wz-upload-row">
            <span>
              {kind === 'video'
                ? phase === 'sending' ? 'Step 2 of 2: sending the video to Meta' : 'Step 1 of 2: uploading to the CRM server'
                : 'Uploading the image'}
            </span>
            <b data-testid={`${testid}-percent`}>{phase === 'sending' ? sent : pct}%</b>
          </div>
          <div
            className="ads-wz-upload-bar"
            role="progressbar"
            aria-label={phase === 'sending' ? 'Sending to Meta' : 'Uploading'}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={phase === 'sending' ? sent : pct}
          >
            <span style={{ width: `${phase === 'sending' ? sent : pct}%` }} />
          </div>
        </div>
      )}
      {phase === 'sending' && (
        <p className="ads-wz-hint" role="status" data-testid={`${testid}-sending`}>
          The video is on the CRM server. It is being sent to Meta now; this can take a few minutes for a large file. You can keep editing.
        </p>
      )}
      {stillProcessing && phase !== 'sending' && (
        <p className="ads-wz-hint" role="status" data-testid={`${testid}-still`}>
          {VIDEO_STILL_TEXT}
        </p>
      )}
      {libOpen && (
        <div data-testid={`${testid}-library-grid`}>
          {libError && <p className="ads-wz-hint" role="alert">{libError}</p>}
          {!lib && !libError && <BladeSpinner center={true} containerHeight={60} />}
          {lib && !lib.length && <p className="ads-wz-hint">Nothing in the ad account yet.</p>}
          {lib && lib.length > 0 && (
            <div className="ads-wz-lib">
              {lib.map((i) => (
                <button
                  key={i.key}
                  type="button"
                  onClick={() => {
                    if (kind === 'image' && i.hash) onImage?.(i.hash, i.thumb);
                    if (kind === 'video' && i.id) onVideo?.(i.id, '');
                    setLibOpen(false);
                  }}
                  aria-label={kind === 'image' ? 'Use this image' : 'Use this video'}
                >
                  {i.thumb ? <img src={i.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="material-icons">movie</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function VideoProgress({ api, videoId, onReady }: { api: CrmApi; videoId: string; onReady: (thumb: string) => void }) {
  const [state, setState] = useState<{ status: string; progress: number | null } | null>(null);
  const [error, setError] = useState('');
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let tries = 0;
    const poll = () => {
      api
        .getAdVideoStatus(videoId)
        .then((r) => {
          if (!live) return;
          setState({ status: r.video.status, progress: r.video.progress });
          if (r.video.ready && r.video.thumbnailUrl) readyRef.current(r.video.thumbnailUrl);
          else if (r.video.status === 'error') setError('Meta couldn’t process this video. Upload another one.');
          else if ((tries += 1) < 200) timer = setTimeout(poll, 3000);
        })
        .catch((e) => live && setError(errText(e)));
    };
    poll();
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [api, videoId]);
  if (error) return <p className="ads-wz-error" role="alert">{error}</p>;
  return (
    <p className="ads-wz-hint" data-testid="ads-wz-video-progress">
      Meta is processing the video{state?.progress ? ` (${state.progress}%)` : ''}…
    </p>
  );
}

function LeadFormPicker({ api, spec, setSpec, conn, canManage, onReconnect }: { api: CrmApi; spec: AdsCampaignSpec; setSpec: SetSpec; conn: MetaAdsConnection; canManage: boolean; onReconnect: () => void }) {
  const notify = useNotify();
  const [forms, setForms] = useState<LeadFormItem[] | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    name: '', intro: '', fullName: true, email: true, phone: true, custom: [] as string[], privacyUrl: '', privacyText: '', thankTitle: '', thankBody: '', website: '',
  });
  useEffect(() => {
    if (!conn.pageId) return;
    api
      .getLeadForms()
      .then((r) => setForms(r.forms))
      .catch((e) => setError(errText(e)));
  }, [api, conn.pageId]);
  if (!conn.pageId) {
    return (
      <div className="ads-wz-warn" data-testid="ads-wz-no-leads-page">
        <span>
          Lead forms need a Facebook Page connected for lead forms (the CRM uses its Page access to read and create forms). None is connected. Reconnect and pick the
          Page that runs your lead ads.
        </span>
        <button type="button" className="ads-btn sm" onClick={onReconnect}>
          Reconnect
        </button>
      </div>
    );
  }
  const privacyOk = isHttps(f.privacyUrl);
  const anyQuestion = f.fullName || f.email || f.phone || f.custom.some((c) => c.trim());
  async function submit() {
    setBusy(true);
    try {
      const questions = [
        ...(f.fullName ? [{ type: 'FULL_NAME' }] : []),
        ...(f.email ? [{ type: 'EMAIL' }] : []),
        ...(f.phone ? [{ type: 'PHONE' }] : []),
        ...f.custom.filter((c) => c.trim()).map((label) => ({ type: 'CUSTOM', label: label.trim() })),
      ];
      const r = await api.createAdsLeadForm({
        name: f.name, intro: f.intro, questions, privacyUrl: f.privacyUrl, privacyText: f.privacyText,
        thankYou: { title: f.thankTitle, body: f.thankBody, websiteUrl: f.website },
      });
      setForms((list) => [{ id: r.form.id, name: r.form.name, status: 'ACTIVE', leadsCount: 0, createdTime: new Date().toISOString() }, ...(list || [])]);
      setSpec((s) => ({ ...s, creative: { ...s.creative, leadFormId: r.form.id } }));
      setCreating(false);
      notify('success', 'Lead form created', `“${r.form.name}” is on ${conn.pageName || 'your Page'}.`);
    } catch (e) {
      notify('error', 'Form not created', errText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ads-wz-section" data-testid="ads-wz-leadform">
      <h4>Instant form</h4>
      {error && <p className="ads-wz-error" role="alert">{error}</p>}
      {!forms && !error && <BladeSpinner center={true} containerHeight={50} />}
      {forms && (
        <Field label="Lead form" hint={`Forms on ${conn.pageName || 'the lead-forms Page'}.`}>
          <select value={spec.creative.leadFormId} onChange={(e) => setSpec((s) => ({ ...s, creative: { ...s.creative, leadFormId: e.target.value } }))} data-testid="ads-wz-leadform-select">
            <option value="">Choose a form…</option>
            {forms.filter((x) => x.status !== 'ARCHIVED').map((x) => (
              <option key={x.id} value={x.id}>
                {x.name || x.id}
              </option>
            ))}
          </select>
        </Field>
      )}
      {!creating ? (
        <button type="button" className="ads-btn" onClick={() => setCreating(true)} disabled={!canManage} title={canManage ? undefined : 'Creating forms needs ads_management.'} data-testid="ads-wz-leadform-new">
          <span className="material-icons" aria-hidden="true">add</span>
          Create a new form
        </button>
      ) : (
        <div className="ads-wz-section" data-testid="ads-wz-leadform-create">
          <Field label="Form name">
            <input type="text" value={f.name} maxLength={200} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="ads-wz-lf-name" />
          </Field>
          <Field label="Intro (optional)">
            <textarea value={f.intro} maxLength={500} onChange={(e) => setF({ ...f, intro: e.target.value })} />
          </Field>
          <div className="ads-wz-checks">
            <label><input type="checkbox" checked={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.checked })} /> Full name</label>
            <label><input type="checkbox" checked={f.email} onChange={(e) => setF({ ...f, email: e.target.checked })} /> Email</label>
            <label><input type="checkbox" checked={f.phone} onChange={(e) => setF({ ...f, phone: e.target.checked })} /> Phone number</label>
          </div>
          {f.custom.map((c, i) => (
            <div key={i} className="ads-wz-row">
              <Field label={`Custom question ${i + 1}`}>
                <input type="text" value={c} maxLength={80} onChange={(e) => setF({ ...f, custom: f.custom.map((x, j) => (j === i ? e.target.value : x)) })} />
              </Field>
              <button type="button" className="ads-btn sm" onClick={() => setF({ ...f, custom: f.custom.filter((_, j) => j !== i) })}>
                Remove
              </button>
            </div>
          ))}
          {f.custom.length < 5 && (
            <button type="button" className="ads-btn sm" onClick={() => setF({ ...f, custom: [...f.custom, ''] })} style={{ marginBottom: 12 }}>
              Add a short-answer question
            </button>
          )}
          <div className="ads-wz-row">
            <Field label="Privacy policy URL (required)">
              <input type="url" value={f.privacyUrl} placeholder="https://" onChange={(e) => setF({ ...f, privacyUrl: e.target.value })} data-testid="ads-wz-lf-privacy" />
            </Field>
            <Field label="Link text">
              <input type="text" value={f.privacyText} maxLength={70} placeholder="Privacy policy" onChange={(e) => setF({ ...f, privacyText: e.target.value })} />
            </Field>
          </div>
          <div className="ads-wz-row">
            <Field label="Thank-you headline">
              <input type="text" value={f.thankTitle} maxLength={60} placeholder="Thanks, you’re all set." onChange={(e) => setF({ ...f, thankTitle: e.target.value })} />
            </Field>
            <Field label="Thank-you text">
              <input type="text" value={f.thankBody} maxLength={300} placeholder="We’ll be in touch soon." onChange={(e) => setF({ ...f, thankBody: e.target.value })} />
            </Field>
            <Field label="Website button (optional)">
              <input type="url" value={f.website} placeholder="https://" onChange={(e) => setF({ ...f, website: e.target.value })} />
            </Field>
          </div>
          <div className="ads-wz-row">
            <button type="button" className="ads-btn" onClick={() => setCreating(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="ads-btn primary"
              disabled={busy || !f.name.trim() || !privacyOk || !anyQuestion || (!!f.website && !isHttps(f.website))}
              title={!privacyOk ? 'Enter the privacy policy URL (https://).' : undefined}
              onClick={submit}
              data-testid="ads-wz-lf-create"
            >
              {busy ? 'Creating…' : 'Create form'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Why the Identity step lists no Instagram account (pageDetails.instagramIssue). */
export function instagramIssueText(issue?: string): string {
  if (issue === 'NO_PERMISSION') {
    return 'Meta doesn’t show your Instagram accounts to the CRM: the ads connection was made without Instagram permission (instagram_basic). '
      + 'Ask the platform owner to add instagram_basic to the ads login configuration, then press “Change” next to the ad account on the Ads page and reconnect. '
      + 'Until then the ad can run on Instagram using the Page’s name and picture.';
  }
  return 'No Instagram account is linked to this Page or the ad account. Link it in the Page’s settings (Linked accounts → Instagram) or add it to the ad account in Business Settings. '
    + 'The ad can still run on Instagram using the Page’s name and picture.';
}

/** "Use existing post": the Page's recent posts, or its Instagram account's, as Meta lists them. */
function PostPicker({
  api, spec, onPick, igIssue, igAccounts = [], onPickInstagram, adAccountId = '', onUseVideo,
}: {
  api: CrmApi;
  spec: AdsCampaignSpec;
  onPick: (p: AdsExistingPost | null) => void;
  igIssue?: string;
  /** The Instagram accounts the Identity step offers (to pick one right here). */
  igAccounts?: { id: string; username: string; picture: string }[];
  onPickInstagram?: (id: string) => void;
  /** For the Ads Manager link on reels blocked for their music. */
  adAccountId?: string;
  /** Switches the format to Single video. */
  onUseVideo?: () => void;
}) {
  const chosen = spec.creative.post || null;
  const { pageId, instagramId } = spec.identity;
  const [source, setSource] = useState<'facebook' | 'instagram'>(chosen?.source || 'facebook');
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<{ key: string; posts: AdsExistingPost[] | null; error: unknown }>({ key: '', posts: null, error: null });
  const key = `${source}|${pageId}|${instagramId}`;
  const needIg = source === 'instagram' && !instagramId;
  const lastNonce = useRef(nonce);
  useEffect(() => {
    if (!pageId || needIg) return undefined;
    let live = true;
    const refresh = lastNonce.current !== nonce;
    lastNonce.current = nonce;
    setState((s) => ({ key, posts: s.key === key ? s.posts : null, error: null }));
    api
      .getAdsPagePosts(pageId, source, source === 'instagram' ? instagramId : '', refresh)
      .then((r) => live && setState({ key, posts: r.posts || [], error: null }))
      .catch((e) => live && setState({ key, posts: null, error: e }));
    return () => {
      live = false;
    };
  }, [api, key, nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  const posts = state.key === key ? state.posts : null;
  const when = (s: string | null) => {
    if (!s) return '';
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  };
  return (
    <div className="ads-wz-posts" data-testid="ads-wz-posts">
      <div className="ads-wz-posts-bar">
        <div className="ads-wz-preview-tabs" role="tablist" aria-label="Where the post is">
          {([['facebook', 'Facebook Page'], ['instagram', 'Instagram account']] as const).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={source === k} className={source === k ? 'on' : ''} onClick={() => setSource(k)} data-testid={`ads-wz-posts-${k}`}>
              {l}
            </button>
          ))}
        </div>
        <button type="button" className="ads-btn sm" onClick={() => setNonce((n) => n + 1)} disabled={!pageId || needIg} data-testid="ads-wz-posts-refresh">
          <span className="material-icons" aria-hidden="true">refresh</span> Refresh
        </button>
      </div>
      {!pageId && <p className="ads-wz-hint">Pick the Facebook Page in the Identity step first.</p>}
      {pageId && needIg && igAccounts.length > 0 && onPickInstagram && (
        <div className="ads-wz-posts-ig" data-testid="ads-wz-posts-pick-ig">
          <p className="ads-wz-hint">Instagram posts run from their Instagram account. Choose the account (the ad then shows as that account on Instagram):</p>
          <div className="ads-wz-posts-ig-list">
            {igAccounts.map((a) => (
              <button key={a.id} type="button" className="ads-btn" onClick={() => onPickInstagram(a.id)} data-testid={`ads-wz-posts-ig-${a.id}`}>
                {a.picture ? <img src={a.picture} alt="" referrerPolicy="no-referrer" /> : <span className="material-icons" aria-hidden="true">photo_camera</span>}
                @{a.username || a.id}
              </button>
            ))}
          </div>
        </div>
      )}
      {pageId && needIg && !(igAccounts.length > 0 && onPickInstagram) && (
        <p className="ads-wz-warn" data-testid="ads-wz-posts-need-ig">
          <span className="material-icons" aria-hidden="true">photo_camera</span>
          <span>
            {igIssue
              ? `Instagram posts run from their Instagram account, and none is available. ${instagramIssueText(igIssue).replace(/ Until then[^.]*\.$| The ad can still[^.]*\.$/, '')}`
              : 'Instagram posts run from their Instagram account. Pick that account in the Identity step, then come back.'}
          </span>
        </p>
      )}
      {pageId && !needIg && state.error && state.key === key ? <AdsErrorState error={state.error} onRetry={() => setNonce((n) => n + 1)} /> : null}
      {pageId && !needIg && !posts && !(state.error && state.key === key) && <BladeSpinner center={true} containerHeight={90} />}
      {posts && posts.length === 0 && (
        <p className="ads-wz-hint" data-testid="ads-wz-posts-empty">
          No recent {source === 'facebook' ? 'posts on this Page' : 'posts on this Instagram account'}. Publish one first, or upload an image or video instead.
        </p>
      )}
      {posts && posts.length > 0 && (
        <div className="ads-wz-post-grid" role="listbox" aria-label="Posts">
          {posts.map((p) => {
            const on = chosen?.id === p.id && chosen.source === p.source;
            const off = p.eligible === false;
            return (
              <button
                key={`${p.source}-${p.id}`}
                type="button"
                role="option"
                aria-selected={on}
                className={`ads-wz-post${on ? ' on' : ''}${off ? ' off' : ''}`}
                disabled={off}
                title={off ? p.reason : p.text.slice(0, 200)}
                onClick={() => onPick(on ? null : p)}
                data-testid={`ads-wz-post-${p.id}`}
              >
                <span className="pic">
                  {p.picture ? <img src={p.picture} alt="" referrerPolicy="no-referrer" loading="lazy" /> : <span className="material-icons">{p.mediaType === 'TEXT' ? 'notes' : 'image'}</span>}
                  {(p.mediaType === 'VIDEO' || p.productType === 'REELS') && <span className="kind material-icons">play_circle</span>}
                  {p.mediaType === 'CAROUSEL_ALBUM' && <span className="kind material-icons">collections</span>}
                  {on && <span className="tick material-icons">check_circle</span>}
                </span>
                <span className="txt">{p.text || <em>No text</em>}</span>
                <span className="meta">
                  {when(p.createdAt)}
                  {off ? <b className="bad">{p.audioBlocked ? 'Copyrighted music' : 'Can’t be promoted'}</b> : p.source === 'facebook' && p.instagramEligible === false ? <b className="warn">Facebook only</b> : null}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {posts && posts.some((p) => p.audioBlocked) && (
        <div className="ads-wz-warn ads-wz-posts-music" data-testid="ads-wz-posts-music">
          <span className="material-icons" aria-hidden="true">music_off</span>
          <div>
            <p>
              <b>Reels marked “Copyrighted music” can’t be promoted from here.</b> Meta lets you swap a reel’s music (“Choose new music”) only inside Meta Ads Manager.
              Apps like this CRM can’t do it: Meta refuses these reels with “Reels that use copyrighted music can’t be boosted as ads”.
            </p>
            <p>To use one of them:</p>
            <ul>
              <li>
                Create the ad in{' '}
                <a href={`https://adsmanager.facebook.com/adsmanager/manage/campaigns${adAccountId ? `?act=${encodeURIComponent(adAccountId.replace(/^act_/, ''))}` : ''}`} target="_blank" rel="noopener noreferrer" data-testid="ads-wz-posts-music-adsmanager">
                  Meta Ads Manager
                </a>
                , choose the reel as an existing post and pick <b>Choose new music</b>. It then shows up in this CRM’s Ads dashboard like any other ad.
              </li>
              <li>
                Or upload the video file with royalty-free music as a <b>Single video</b> ad here.
                {onUseVideo && (
                  <>
                    {' '}
                    <button type="button" className="ads-btn sm" onClick={onUseVideo} data-testid="ads-wz-posts-music-video">
                      <span className="material-icons" aria-hidden="true">movie</span> Upload a video instead
                    </button>
                  </>
                )}
              </li>
            </ul>
          </div>
        </div>
      )}
      {chosen && (
        <p className="ads-wz-hint" data-testid="ads-wz-post-chosen">
          Using the {chosen.source === 'instagram' ? 'Instagram' : 'Facebook'} post from {when(chosen.createdAt) || 'your Page'}.
          {chosen.permalink && (
            <> <a href={chosen.permalink} target="_blank" rel="noopener noreferrer">Open it</a></>
          )}
        </p>
      )}
    </div>
  );
}

export function StepCreative({
  api, spec, setSpec, conn, canManage, onReconnect, igIssue, igAccounts,
}: {
  api: CrmApi; spec: AdsCampaignSpec; setSpec: SetSpec; conn: MetaAdsConnection; canManage: boolean; onReconnect: () => void; igIssue?: string;
  igAccounts?: { id: string; username: string; picture: string }[];
}) {
  const c = spec.creative;
  const o = OBJECTIVES[spec.objective];
  const setC = (patch: Partial<AdsCampaignSpec['creative']>) => setSpec((s) => ({ ...s, creative: { ...s.creative, ...patch } }));
  const setW = (patch: Partial<AdsCampaignSpec['creative']['whatsapp']>) => setSpec((s) => ({ ...s, creative: { ...s.creative, whatsapp: { ...s.creative.whatsapp, ...patch } } }));
  const setCard = (i: number, patch: Partial<AdsCampaignSpec['creative']['cards'][number]>) => setC({ cards: c.cards.map((k, j) => (j === i ? { ...k, ...patch } : k)) });
  return (
    <>
      <section className="ads-wz-section">
        <h4>Format</h4>
        <div className="ads-wz-choice" role="radiogroup" aria-label="Format">
          {([['image', 'Single image'], ['video', 'Single video'], ['carousel', 'Carousel'], ['post', 'Use existing post']] as const).map(([k, l]) => (
            <label key={k} className={c.format === k ? 'on' : ''}>
              <input
                type="radio"
                name="ads-format"
                checked={c.format === k}
                onChange={() => setC({ format: k, cards: k === 'carousel' && c.cards.length < 2 ? [...c.cards, ...Array.from({ length: 2 - c.cards.length }, () => ({ imageHash: '', imageUrl: '', headline: '', description: '', link: '' }))] : c.cards })}
                data-testid={`ads-wz-format-${k}`}
              />
              {l}
            </label>
          ))}
        </div>
        {c.format === 'post' && (
          <PostPicker
            api={api}
            spec={spec}
            onPick={(post) => setC({ post })}
            igIssue={igIssue}
            igAccounts={igAccounts}
            onPickInstagram={(id) => setSpec((s) => ({ ...s, identity: { ...s.identity, instagramId: id } }))}
            adAccountId={conn.adAccountId}
            onUseVideo={() => setC({ format: 'video', post: null })}
          />
        )}
        {c.format === 'image' && (
          <>
            <div className="ads-wz-media">
              {c.imageUrl ? <img className="ads-wz-thumb" src={c.imageUrl} alt="" referrerPolicy="no-referrer" data-testid="ads-wz-image-thumb" /> : <span className="ads-wz-thumb material-icons">image</span>}
            </div>
            <MediaUpload api={api} kind="image" canManage={canManage} onImage={(hash, url) => setC({ imageHash: hash, imageUrl: url })} testid="ads-wz-image" />
          </>
        )}
        {c.format === 'video' && (
          <>
            <div className="ads-wz-media">
              {c.videoThumbUrl ? <img className="ads-wz-thumb" src={c.videoThumbUrl} alt="" referrerPolicy="no-referrer" /> : <span className="ads-wz-thumb material-icons">movie</span>}
              {c.videoId && !c.videoThumbUrl && <VideoProgress api={api} videoId={c.videoId} onReady={(thumb) => setC({ videoThumbUrl: thumb })} />}
              {c.videoId && c.videoThumbUrl && <span className="ads-chip green" data-testid="ads-wz-video-ready">Video ready</span>}
            </div>
            <MediaUpload api={api} kind="video" canManage={canManage} onVideo={(id) => setC({ videoId: id, videoThumbUrl: '' })} testid="ads-wz-video" />
          </>
        )}
        {c.format === 'carousel' && (
          <div data-testid="ads-wz-cards">
            {c.cards.map((card, i) => (
              <div key={i} className="ads-wz-card">
                <div>{card.imageUrl ? <img className="ads-wz-thumb" src={card.imageUrl} alt="" referrerPolicy="no-referrer" /> : <span className="ads-wz-thumb material-icons">image</span>}</div>
                <div>
                  <div className="ads-wz-card-head">
                    <span>Card {i + 1}</span>
                    <button type="button" className="ads-btn sm" disabled={c.cards.length <= 2} onClick={() => setC({ cards: c.cards.filter((_, j) => j !== i) })}>
                      Remove
                    </button>
                  </div>
                  <MediaUpload api={api} kind="image" canManage={canManage} onImage={(hash, url) => setCard(i, { imageHash: hash, imageUrl: url })} testid={`ads-wz-card-${i}`} />
                  <div className="ads-wz-row">
                    <Field label="Headline">
                      <input type="text" value={card.headline} maxLength={255} onChange={(e) => setCard(i, { headline: e.target.value })} />
                    </Field>
                    <Field label="Description">
                      <input type="text" value={card.description} maxLength={255} onChange={(e) => setCard(i, { description: e.target.value })} />
                    </Field>
                    {o.url === 'required' && (
                      <Field label="Website URL">
                        <input type="url" value={card.link} placeholder="https://" onChange={(e) => setCard(i, { link: e.target.value })} />
                      </Field>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {c.cards.length < 10 && (
              <button type="button" className="ads-btn" onClick={() => setC({ cards: [...c.cards, { imageHash: '', imageUrl: '', headline: '', description: '', link: '' }] })} data-testid="ads-wz-card-add">
                Add a card
              </button>
            )}
          </div>
        )}
      </section>
      <section className="ads-wz-section">
        <h4>{c.format === 'post' ? 'Button' : 'Text'}</h4>
        {c.format === 'post' ? (
          <p className="hint" data-testid="ads-wz-post-text-note">The post’s own text, photo or video and its likes and comments are used. Choose the button people tap.</p>
        ) : (
          <>
            <Field label="Primary text" hint={`${c.primaryText.length}/2200`}>
              <textarea value={c.primaryText} maxLength={2200} onChange={(e) => setC({ primaryText: e.target.value })} data-testid="ads-wz-primary" />
            </Field>
            <div className="ads-wz-row">
              <Field label="Headline">
                <input type="text" value={c.headline} maxLength={255} onChange={(e) => setC({ headline: e.target.value })} data-testid="ads-wz-headline" />
              </Field>
              <Field label="Description (optional)">
                <input type="text" value={c.description} maxLength={255} onChange={(e) => setC({ description: e.target.value })} data-testid="ads-wz-description" />
              </Field>
            </div>
          </>
        )}
        {o.url !== 'none' && (
          <div className="ads-wz-row">
            <Field label={o.url === 'required' ? 'Website URL' : 'Website URL (optional)'}>
              <input type="url" value={c.link} placeholder="https://" onChange={(e) => setC({ link: e.target.value })} data-testid="ads-wz-link" />
            </Field>
            <Field label="Display link (optional)" hint="Shown instead of the full URL, e.g. example.com">
              <input type="text" value={c.displayLink} maxLength={100} onChange={(e) => setC({ displayLink: e.target.value })} />
            </Field>
          </div>
        )}
        <Field label="Call to action">
          <select value={c.cta} onChange={(e) => setC({ cta: e.target.value })} disabled={o.ctas.length === 1} data-testid="ads-wz-cta">
            {o.ctas.map((k) => (
              <option key={k} value={k}>
                {CTA_LABEL[k] || k}
              </option>
            ))}
          </select>
        </Field>
      </section>
      {spec.objective === 'whatsapp' && (
        <section className="ads-wz-section" data-testid="ads-wz-whatsapp">
          <h4>WhatsApp chat</h4>
          <p className="hint">What people see when the chat opens. Leave it empty to use Meta’s default (“Hello! Can I get more info on this?”).</p>
          <Field label="Greeting from your business">
            <textarea value={c.whatsapp.greeting} maxLength={500} onChange={(e) => setW({ greeting: e.target.value })} placeholder="Hi! Thanks for your interest. How can we help?" data-testid="ads-wz-greeting" />
          </Field>
          <Field label="Pre-filled message the customer sends" hint="Shown in the customer’s message box, ready to send.">
            <input type="text" value={c.whatsapp.prefill} maxLength={300} onChange={(e) => setW({ prefill: e.target.value })} placeholder="I’d like to know more" disabled={c.whatsapp.iceBreakers.length > 0} data-testid="ads-wz-prefill" />
          </Field>
          <Field label="Or up to 3 questions to tap (instead of the pre-filled message)">
            <div>
              {c.whatsapp.iceBreakers.map((q, i) => (
                <div key={i} className="ads-wz-row" style={{ marginBottom: 6 }}>
                  <input type="text" value={q} maxLength={80} onChange={(e) => setW({ iceBreakers: c.whatsapp.iceBreakers.map((x, j) => (j === i ? e.target.value : x)) })} aria-label={`Question ${i + 1}`} />
                  <button type="button" className="ads-btn sm" onClick={() => setW({ iceBreakers: c.whatsapp.iceBreakers.filter((_, j) => j !== i) })}>
                    Remove
                  </button>
                </div>
              ))}
              {c.whatsapp.iceBreakers.length < 3 && (
                <button type="button" className="ads-btn sm" onClick={() => setW({ iceBreakers: [...c.whatsapp.iceBreakers, ''] })}>
                  Add a question
                </button>
              )}
            </div>
          </Field>
        </section>
      )}
      {spec.objective === 'leads' && <LeadFormPicker api={api} spec={spec} setSpec={setSpec} conn={conn} canManage={canManage} onReconnect={onReconnect} />}
    </>
  );
}

// --------------------------------------------------------- step: review --

function StepReview({
  spec, options, pageName, igName, problems, onEdit, createError, canManage, creating, onCreate, api,
}: {
  spec: AdsCampaignSpec;
  options: AdsCreateOptions;
  pageName: string;
  igName: string;
  problems: { step: number; p: string }[];
  onEdit: (step: number) => void;
  createError: unknown;
  canManage: boolean;
  creating: boolean;
  onCreate: () => void;
  api: CrmApi;
}) {
  const a = options.account;
  const o = OBJECTIVES[spec.objective];
  const b = spec.budget;
  const aud = spec.audience;
  const rows: [string, ReactNode, number][] = [
    ['Goal', `${o.label} · optimise for ${o.goals.find((g) => g.key === spec.optimizationGoal)?.label || spec.optimizationGoal}`, 0],
    ['Campaign name', spec.name || '—', 0],
    ['Special ad categories', spec.specialAdCategories.length ? spec.specialAdCategories.map((k) => SPECIAL.find((x) => x[0] === k)?.[1] || k).join(', ') : 'None', 0],
    ...(spec.objective === 'sales' ? [['Pixel', `${options.pixels.find((p) => p.id === spec.pixelId)?.name || spec.pixelId} · ${spec.customConversionId ? 'Custom conversion' : EVENTS.find((x) => x[0] === spec.conversionEvent)?.[1]}`, 0] as [string, ReactNode, number]] : []),
    ['Budget', `${money(Number(b.amount), a.currency)} ${b.type === 'daily' ? 'a day' : 'lifetime'} · ${b.level === 'campaign' ? 'Advantage campaign budget' : 'ad set budget'} · ${BIDS.find((x) => x[0] === b.bidStrategy)?.[1]}${b.bidStrategy !== 'LOWEST_COST_WITHOUT_CAP' ? ` ${money(Number(b.bidAmount), a.currency)}` : ''}`, 1],
    ['Schedule', `${spec.schedule.start ? fmtLocal(spec.schedule.start) : 'When published'} → ${spec.schedule.end ? fmtLocal(spec.schedule.end) : 'no end date'} (${a.timezone})`, 1],
    ['Locations', [...aud.locations.map((l) => `${l.name}${l.radius ? ` +${l.radius} km` : ''}`), ...aud.excludedLocations.map((l) => `not ${l.name}`)].join(', ') || '—', 2],
    ['People', `${aud.ageMin}–${aud.ageMax === 65 ? '65+' : aud.ageMax} · ${aud.genders === 'all' ? 'all genders' : aud.genders === 'male' ? 'men' : 'women'}${aud.advantageAudience ? ' · Advantage+ audience on' : ''}`, 2],
    ['Detailed targeting', aud.detailed.map((d) => d.name).join(', ') || 'None', 2],
    ['Languages', aud.locales.map((l) => l.name).join(', ') || 'All', 2],
    // Ads Manager S4: only shown when the audience uses custom / lookalike audiences.
    ...((aud.customAudiences || []).length || (aud.excludedCustomAudiences || []).length
      ? [['Custom audiences', [...(aud.customAudiences || []).map((x) => x.name || x.id), ...(aud.excludedCustomAudiences || []).map((x) => `not ${x.name || x.id}`)].join(', '), 2] as [string, ReactNode, number]]
      : []),
    ['Placements', spec.placements.mode === 'automatic' ? 'Advantage+ placements' : spec.placements.platforms.map((p) => `${PLATFORMS.find((x) => x[0] === p)?.[1]}: ${(spec.placements.positions[p] || []).length} positions`).join(' · '), 3],
    ['Identity', `${pageName || spec.identity.pageId}${igName ? ` · @${igName}` : ''}`, 4],
    ['Ad', `${spec.creative.format === 'post' ? `Existing ${spec.creative.post?.source === 'instagram' ? 'Instagram' : 'Facebook'} post` : spec.creative.format === 'carousel' ? `Carousel, ${spec.creative.cards.length} cards` : spec.creative.format === 'video' ? 'Single video' : 'Single image'} · ${CTA_LABEL[spec.creative.cta] || spec.creative.cta}`, 5],
    [spec.creative.format === 'post' ? 'Post text' : 'Primary text', (spec.creative.format === 'post' ? spec.creative.post?.text : spec.creative.primaryText) || '—', 5],
  ];
  const blocked = problems.length > 0;
  return (
    <>
      <section className="ads-wz-section" data-testid="ads-wz-review">
        <h4>Review</h4>
        <p className="hint">Everything is created at Meta as paused. Nothing spends until you publish it on the next screen.</p>
        <dl className="ads-wz-summary">
          {rows.map(([k, v, s]) => (
            <ReviewRow key={k} label={k} onEdit={() => onEdit(s)}>
              {v}
            </ReviewRow>
          ))}
        </dl>
      </section>
      <EstimateBox api={api} spec={spec} />
      {a.hasPaymentMethod === false && (
        <div className="ads-wz-warn" role="note">
          <span className="material-icons" aria-hidden="true">credit_card_off</span>
          <span>No payment method on the ad account: Meta won’t deliver the ads until you add one.</span>
        </div>
      )}
      {problems.length > 0 && (
        <div className="ads-wz-warn" role="note" data-testid="ads-wz-review-problems">
          <span>
            Before creating:
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {problems.map((x) => (
                <li key={`${x.step}${x.p}`}>
                  {x.p}{' '}
                  <button type="button" className="ads-link" onClick={() => onEdit(x.step)} style={{ border: 0, background: 'none', color: '#1877f2', cursor: 'pointer', padding: 0, font: 'inherit' }}>
                    Fix
                  </button>
                </li>
              ))}
            </ul>
          </span>
        </div>
      )}
      {createError ? <CreateErrorBox error={createError} /> : null}
      <div className="ads-wz-row">
        <button
          type="button"
          className="ads-btn primary"
          onClick={onCreate}
          disabled={creating || blocked || !canManage}
          title={!canManage ? 'Read-only: reconnect and allow ads_management to create campaigns.' : blocked ? 'Fix the items above first.' : undefined}
          data-testid="ads-wz-create"
        >
          <span className="material-icons" aria-hidden="true">pause_circle</span>
          {creating ? 'Creating at Meta…' : 'Create (paused)'}
        </button>
        {!canManage && <small className="ads-wz-hint">Read-only: the CRM needs ads_management on this ad account.</small>}
      </div>
    </>
  );
}

function ReviewRow({ label, onEdit, children }: { label: string; onEdit: () => void; children: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
      <dd>
        <button type="button" className="ads-btn sm" onClick={onEdit} aria-label={`Edit ${label}`}>
          Edit
        </button>
      </dd>
    </>
  );
}

function CreateErrorBox({ error }: { error: unknown }) {
  const d = (error as ApiErr)?.data;
  const code = errCode(error);
  return (
    <div className={code === 'RATE_LIMITED' || code === 'GRAPH_VERSION_TOO_OLD' || code === 'IN_PROGRESS' ? 'ads-wz-warn' : 'ads-wz-error'} role="alert" data-testid="ads-wz-create-error" data-code={code}>
      <span className="material-icons" aria-hidden="true">{code === 'RATE_LIMITED' ? 'hourglass_top' : 'error_outline'}</span>
      <span>
        <strong>
          {code === 'RATE_LIMITED'
            ? 'Meta is busy, try again shortly. '
            : code === 'READ_ONLY'
              ? 'Read-only. '
              : code === 'ADS_REVOKED'
                ? 'Facebook ads were disconnected. '
                : code === 'GRAPH_VERSION_TOO_OLD'
                  ? `${VERSION_OLD_TITLE}. `
                  : code === 'IN_PROGRESS'
                    ? 'Still working on it. '
                    : 'Not created. '}
        </strong>
        {errText(error)}
        {d?.rolledBack && d.rolledBack.length > 0 && (
          <span data-testid="ads-wz-rolled-back">
            {' '}
            ({d.rolledBack.filter((r) => r.deleted).length} of {d.rolledBack.length} created objects were deleted again.)
          </span>
        )}
      </span>
    </div>
  );
}

// ----------------------------------------------------------- created --

const REVIEW_LABEL: Record<string, string> = {
  PAUSED: 'paused', ACTIVE: 'active', IN_PROCESS: 'in review (processing)', PENDING_REVIEW: 'in review', DISAPPROVED: 'rejected', WITH_ISSUES: 'has issues',
  CAMPAIGN_PAUSED: 'campaign paused', ADSET_PAUSED: 'ad set paused', PREAPPROVED: 'pre-approved',
};
function StatePill({ s }: { s: string }) {
  const tone = s === 'ACTIVE' ? 'green' : /DISAPPROVED|WITH_ISSUES/.test(s) ? 'red' : /PAUSED/.test(s) ? '' : 'amber';
  return <span className={`ads-pill ${tone}`} data-testid="ads-wz-state">{REVIEW_LABEL[s] || s.replace(/_/g, ' ').toLowerCase()}</span>;
}

function CreatedPanel({ api, result }: { api: CrmApi; result: AdsCreateResult }) {
  const confirm = useConfirm();
  const notify = useNotify();
  const [review, setReview] = useState<AdsReviewState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // One publish of this campaign: a retry reuses the id (the server answers it once).
  const publishReq = useRef(newRequestId());
  const s = result.summary;
  const budgetText = `${money(s.budget.amount, s.currency)} ${s.budget.type === 'daily' ? 'a day' : 'in total (lifetime)'}`;
  const dateText = (iso: string | null) => {
    if (!iso) return '';
    try {
      return new Intl.DateTimeFormat(undefined, { timeZone: s.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
    } catch {
      return iso;
    }
  };
  const published = review?.campaign.status === 'ACTIVE';
  async function publish() {
    const ok = await confirm({
      title: 'Publish this campaign?',
      message: `Meta reviews the ad, then it starts spending up to ${budgetText}.`,
      points: [
        `Budget: ${budgetText}`,
        `Start: ${s.start ? `${dateText(s.start)} (${s.timezone})` : 'as soon as Meta approves the ad'}`,
        `End: ${s.end ? `${dateText(s.end)} (${s.timezone})` : 'no end date: it runs until you pause it'}`,
      ],
      confirmLabel: 'Publish',
      tone: 'primary',
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      // Only the ad set and ad this wizard created are turned on (then the campaign).
      setReview(await api.publishAdsCampaign(result.campaign.id, { adsetId: result.adset.id, adId: result.ad.id, requestId: publishReq.current }));
      notify('success', 'Published', 'Meta is reviewing the ad. It starts delivering once approved.');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    setBusy(true);
    try {
      setReview(await api.getAdsCampaignReview(result.campaign.id));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const objs = review
    ? [
        { label: 'Campaign', o: review.campaign },
        ...review.adsets.map((o) => ({ label: 'Ad set', o })),
        ...review.ads.map((o) => ({ label: 'Ad', o, feedback: o.reviewFeedback })),
      ]
    : [
        { label: 'Campaign', o: result.campaign },
        { label: 'Ad set', o: result.adset },
        { label: 'Ad', o: result.ad },
      ];
  return (
    <section className="ads-wz-section" data-testid="ads-wz-created">
      <div className="ads-wz-ok">
        <span className="material-icons" aria-hidden="true">check_circle</span>
        <span>
          {published
            ? 'Published. Meta reviews the ad (usually within 24 hours); it starts delivering once approved.'
            : 'Created at Meta, paused. Nothing spends until you publish it. You can also publish it later from Ads Manager.'}
        </span>
      </div>
      <ul className="ads-wz-objects">
        {objs.map(({ label, o, feedback }: { label: string; o: { id: string; name: string; effectiveStatus: string; status: string }; feedback?: string[] }) => (
          <li key={`${label}${o.id}`}>
            <span>
              <strong>{label}</strong> {o.name} <small>({o.id})</small>
              {feedback && feedback.length > 0 && <small style={{ display: 'block', color: '#b91c1c' }}>{feedback.join(' ')}</small>}
            </span>
            <StatePill s={o.effectiveStatus || o.status} />
          </li>
        ))}
      </ul>
      <p className="ads-wz-hint">
        {budgetText} · {s.start ? dateText(s.start) : 'starts when published'} → {s.end ? dateText(s.end) : 'no end date'} ({s.timezone})
      </p>
      {error ? <CreateErrorBox error={error} /> : null}
      <div className="ads-wz-row">
        {!published && (
          <button type="button" className="ads-btn primary" onClick={publish} disabled={busy} data-testid="ads-wz-publish">
            <span className="material-icons" aria-hidden="true">play_circle</span>
            {busy ? 'Publishing…' : 'Publish'}
          </button>
        )}
        <button type="button" className="ads-btn" onClick={refresh} disabled={busy} data-testid="ads-wz-refresh-review">
          <span className="material-icons" aria-hidden="true">refresh</span>
          Check review status
        </button>
      </div>
    </section>
  );
}

// ----------------------------------------------------------- preview --

export function PreviewPanel({ api, spec, pageName, igName = '', ready }: { api: CrmApi; spec: AdsCampaignSpec; pageName: string; igName?: string; ready: boolean }) {
  const [format, setFormat] = useState<AdsPreviewFormat>('facebook_feed');
  const [all, setAll] = useState(false);
  const [shots, setShots] = useState<Record<string, { key: string; src?: string; error?: string; loading?: boolean }>>({});
  const placement = placementOf(format);
  const skip = placementSkip(placement, spec);
  const relevant = useMemo(
    () => ({ objective: spec.objective, identity: spec.identity, creative: { ...spec.creative, imageUrl: undefined, videoThumbUrl: spec.creative.videoThumbUrl ? 'x' : '', cards: spec.creative.cards.map((k) => ({ ...k, imageUrl: undefined })) } }),
    [spec.objective, spec.identity, spec.creative],
  );
  const key = JSON.stringify(relevant);
  const dkey = useDebounced(key, key, 1200);
  const specRef = useRef(spec);
  specRef.current = spec;
  useEffect(() => {
    if (!ready || skip) return undefined;
    const cur = shots[format];
    if (cur && cur.key === dkey) return undefined;
    let live = true;
    setShots((s) => ({ ...s, [format]: { key: dkey, loading: true } }));
    api
      .previewAdsCreative(specRef.current, format)
      .then((r) => {
        if (!live) return;
        const src = safePreviewSrc(r.src);
        setShots((s) => ({ ...s, [format]: src ? { key: dkey, src } : { key: dkey, error: 'Meta returned a preview the CRM can’t show.' } }));
      })
      .catch((e) => live && setShots((s) => ({ ...s, [format]: { key: dkey, error: errCode(e) === 'RATE_LIMITED' ? 'Meta is busy, try again shortly.' : errText(e) } })));
    return () => {
      live = false;
    };
  }, [api, format, dkey, ready, skip]); // eslint-disable-line react-hooks/exhaustive-deps
  const shot = shots[format];
  return (
    <div data-testid="ads-wz-preview">
      <div className="ads-wz-preview-head">
        <h4 style={{ margin: 0, fontSize: 14 }}>Preview</h4>
        <button type="button" className="ads-btn sm" onClick={() => setAll(true)} data-testid="ads-wz-preview-all">
          <span className="material-icons" aria-hidden="true">view_carousel</span> All placements ({PLACEMENTS.length})
        </button>
      </div>
      <div className="ads-wz-preview-tabs" role="tablist" aria-label="Placement">
        {PREVIEWS.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={format === k} className={format === k ? 'on' : ''} onClick={() => setFormat(k)} data-testid={`ads-wz-preview-${k}`}>
            {l}
          </button>
        ))}
      </div>
      {all && <AllPlacementsDialog api={api} spec={spec} pageName={pageName} igName={igName} ready={ready} dkey={dkey} onClose={() => setAll(false)} />}
      {ready && !skip && shot?.src && shot.key === dkey ? (
        <iframe
          key={shot.src}
          className="ads-wz-iframe"
          src={shot.src}
          title={`Meta preview: ${PREVIEWS.find((x) => x[0] === format)?.[1]}`}
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          loading="lazy"
          data-testid="ads-wz-preview-iframe"
        />
      ) : (
        <>
          <p className="ads-wz-hint" data-testid="ads-wz-preview-note">
            {skip
              ? `${skip} A sketch of the layout:`
              : !ready
                ? 'Meta’s preview appears once the Page, the media and the text are in place. Until then, a sketch:'
                : shot?.error
                  ? `Meta preview unavailable: ${shot.error}`
                  : 'Loading Meta’s preview…'}
          </p>
          <div className="ads-wz-sketch">
            <PlacementSketch p={placement} spec={spec} pageName={pageName} igName={igName} testid="ads-wz-mock" />
          </div>
        </>
      )}
    </div>
  );
}

export const objectiveLabel = (k: string) => OBJECTIVES[k as AdsObjectiveKey]?.label || 'Not picked yet';
