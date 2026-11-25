// ---------------------------------------------------------------------------
// Multi-account support: one owner (email / authUserId) can connect and manage
// multiple WhatsApp Business (BM / WABA) accounts. Each connected WhatsApp
// number lives on its own Business row (sharing email, authUserId, and plan
// with the owner's primary Business row) so webhooks, chats, templates, flows
// and journeys stay 100% isolated per WhatsApp number.
// ---------------------------------------------------------------------------
import Business from '../models/Business.js';

/**
 * Build the Mongo/SQL filter that matches all Business rows belonging to the
 * same owner as `biz`.
 */
export function ownerFilterFor(biz) {
  if (!biz) return { _id: null };
  const rootId = biz.parentBusinessId ? String(biz.parentBusinessId) : String(biz._id);
  const ors = [
    { _id: rootId },
    { parentBusinessId: rootId },
  ];
  if (biz.email) ors.push({ email: String(biz.email).toLowerCase() });
  if (biz.authUserId) ors.push({ authUserId: String(biz.authUserId) });
  return { $or: ors };
}

/**
 * Does `candidate` belong to the same owner as `currentBiz`?
 */
export function isSameOwner(currentBiz, candidate) {
  if (!currentBiz || !candidate) return false;
  if (String(currentBiz._id) === String(candidate._id)) return true;
  const rootA = String(currentBiz.parentBusinessId || currentBiz._id);
  const rootB = String(candidate.parentBusinessId || candidate._id);
  if (rootA === rootB) return true;
  if (currentBiz.email && candidate.email && String(currentBiz.email).toLowerCase() === String(candidate.email).toLowerCase()) {
    return true;
  }
  if (currentBiz.authUserId && candidate.authUserId && String(currentBiz.authUserId) === String(candidate.authUserId)) {
    return true;
  }
  return false;
}

/**
 * Format a Business document into a lightweight summary for the BM account
 * switcher and Channel Status account list.
 */
export function toAccountSummary(b) {
  const o = typeof b.toObject === 'function' ? b.toObject() : b;
  const connected = !!(o.accessToken && o.phoneNumberId);
  return {
    _id: String(o._id),
    name: o.meta?.verifiedName || o.meta?.wabaName || o.name || 'WhatsApp Business',
    businessName: o.name || '',
    wabaId: o.wabaId || '',
    wabaName: o.meta?.wabaName || '',
    phoneNumberId: o.phoneNumberId || '',
    displayPhoneNumber: o.meta?.displayPhoneNumber || '',
    verifiedName: o.meta?.verifiedName || '',
    qualityRating: o.meta?.qualityRating || '',
    numberStatus: o.meta?.numberStatus || (connected ? 'CONNECTED' : ''),
    whatsappConnected: connected,
    metaBusinessId: o.waConnection?.metaBusinessId || '',
    connectedAt: o.waConnection?.connectedAt || o.createdAt || null,
    isPrimary: !o.parentBusinessId,
  };
}

/**
 * Return all active Business rows for this owner, sorted primary-first then
 * by creation time. Secondary rows that have been disconnected and carry no
 * phoneNumberId are omitted from the switcher list so disconnected extra
 * slots don't clutter the UI.
 */
export async function listOwnerAccounts(biz) {
  if (!biz) return [];
  const rows = await Business.find({
    ...ownerFilterFor(biz),
    active: { $ne: false },
  }).sort({ createdAt: 1 });

  // Keep the primary account, the currently active account, and any connected secondary accounts.
  const filtered = rows.filter(
    (r) => !r.parentBusinessId || String(r._id) === String(biz._id) || !!(r.accessToken && r.phoneNumberId),
  );
  filtered.sort((a, b) => {
    const aPrim = !a.parentBusinessId ? 0 : 1;
    const bPrim = !b.parentBusinessId ? 0 : 1;
    if (aPrim !== bPrim) return aPrim - bPrim;
    return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
  });
  return filtered.map(toAccountSummary);
}

/**
 * Sync shared owner-level plan / subscription fields from the primary business
 * onto a child business so switching BM accounts keeps the exact same SaaS plan.
 */
export async function syncPlanFromPrimary(biz) {
  if (!biz || !biz.parentBusinessId) return biz;
  const primary = await Business.findById(biz.parentBusinessId);
  if (!primary) return biz;
  let dirty = false;
  if (primary.plan && biz.plan !== primary.plan) {
    biz.plan = primary.plan;
    dirty = true;
  }
  if (primary.planName !== undefined && biz.planName !== primary.planName) {
    biz.planName = primary.planName;
    dirty = true;
  }
  if (JSON.stringify(biz.subscription || null) !== JSON.stringify(primary.subscription || null)) {
    biz.subscription = primary.subscription;
    dirty = true;
  }
  if (primary.trialEndsAt && (!biz.trialEndsAt || new Date(biz.trialEndsAt).getTime() !== new Date(primary.trialEndsAt).getTime())) {
    biz.trialEndsAt = primary.trialEndsAt;
    dirty = true;
  }
  if (dirty) {
    await biz.save().catch(() => {});
  }
  return biz;
}

/**
 * Pick the best Business row to sign into for an email / authUserId login:
 * prefers a connected WhatsApp account (primary first), otherwise the primary row.
 */
export async function findLoginBusiness(query) {
  const rows = await Business.find(query).sort({ createdAt: 1 });
  if (!rows.length) return null;
  const activeRows = rows.filter((r) => r.active !== false);
  const pool = activeRows.length ? activeRows : rows;
  const connectedPrimary = pool.find((r) => !r.parentBusinessId && r.accessToken && r.phoneNumberId);
  if (connectedPrimary) return connectedPrimary;
  const anyConnected = pool.find((r) => r.accessToken && r.phoneNumberId);
  if (anyConnected) return anyConnected;
  const primary = pool.find((r) => !r.parentBusinessId);
  return primary || pool[0];
}

