// Connect a business's WhatsApp through Embedded Signup, plus multi-account
// (BM / WABA) management under a single owner login.
import express from 'express';
import Business from '../models/Business.js';
import { requireBusiness } from '../middleware/auth.js';
import { generateUsername, generateVerifyToken, signToken } from '../services/auth.js';
import { completeSignup, subscribeApp, SignupError } from '../services/embeddedSignup.js';
import { webhookCallbackUrl } from '../services/webhookSetup.js';
import { onWhatsAppConnected, uniqueJoinCode } from '../services/sandbox.js';
import { clearNumberStatus, needsActivation } from '../services/metaAccount.js';
import { otherSubscribedApps, unsubscribeOurApp } from '../services/otherApps.js';
import { channelFlags } from '../services/metaChannels.js';
import { planSummary } from '../services/credits.js';
import { planState } from '../services/plans.js';
import {
  listOwnerAccounts, isSameOwner, ownerFilterFor, syncPlanFromPrimary,
} from '../services/ownerAccounts.js';
import { verifyCredentials } from '../services/metaVerify.js';
import axios from 'axios';
import logger from '../services/logger.js';

const router = express.Router();
router.use(requireBusiness);

function tokenForBusiness(biz, req) {
  return signToken({
    role: 'business',
    sub: String(biz._id),
    username: biz.username,
    tv: biz.tokenVersion || 0,
    ...(req.auth?.master ? { master: true } : {}),
  });
}

/**
 * List all WhatsApp Business (BM) accounts connected under this owner's login.
 */
router.get('/accounts', async (req, res) => {
  try {
    const accounts = await listOwnerAccounts(req.business);
    return res.json({
      success: true,
      activeId: String(req.business._id),
      accounts,
    });
  } catch (err) {
    logger.error('listing owner WhatsApp accounts failed', { error: err.message });
    return res.status(500).json({ success: false, message: 'Could not load WhatsApp accounts.' });
  }
});

/**
 * Switch the active CRM session to another WhatsApp Business account owned by
 * the same email / login without reloading the browser.
 */
router.post('/switch-account', async (req, res) => {
  const accountId = String(req.body?.accountId || '').trim();
  if (!accountId) {
    return res.status(400).json({ success: false, message: 'Missing accountId' });
  }
  try {
    const targetBiz = await Business.findById(accountId);
    if (!targetBiz || targetBiz.active === false || !isSameOwner(req.business, targetBiz)) {
      return res.status(404).json({ success: false, message: 'WhatsApp account not found.' });
    }
    await syncPlanFromPrimary(targetBiz);
    const [flags, accounts] = await Promise.all([
      channelFlags(targetBiz._id),
      listOwnerAccounts(targetBiz),
    ]);
    const token = tokenForBusiness(targetBiz, req);
    return res.json({
      success: true,
      token,
      business: { ...targetBiz.toSafeJSON(), ...flags },
      accounts,
      plan: planSummary(targetBiz),
      planState: planState(targetBiz),
      webhookUrl: webhookCallbackUrl(targetBiz._id),
    });
  } catch (err) {
    logger.error('switching WhatsApp account failed', { error: err.message });
    return res.status(500).json({ success: false, message: 'Switching WhatsApp account failed.' });
  }
});

/**
 * Verify manual WhatsApp credentials against Meta Graph API before saving.
 * Mirrors the admin panel "Check" verification.
 */
router.post('/manual-verify', async (req, res) => {
  const b = req.body || {};
  const creds = {
    accessToken: String(b.accessToken || '').trim(),
    phoneNumberId: String(b.phoneNumberId || '').trim(),
    wabaId: String(b.wabaId || '').trim(),
    catalogId: String(b.catalogId || '').trim(),
    appId: String(b.appId || '').trim(),
    appSecret: String(b.appSecret || '').trim(),
    graphVersion: String(b.graphVersion || process.env.WA_GRAPH_VERSION || 'v22.0').trim(),
  };

  if (!creds.phoneNumberId) {
    return res.status(400).json({ success: false, ok: false, errors: ['Phone number ID is required'], details: {} });
  }
  if (!creds.accessToken) {
    return res.status(400).json({ success: false, ok: false, errors: ['Meta Access token is required'], details: {} });
  }

  try {
    const result = await verifyCredentials(creds);

    // If appId & appSecret are provided, check debug_token against app if reachable
    if (creds.appId && creds.appSecret) {
      try {
        const graphUrl = `https://graph.facebook.com/${creds.graphVersion || 'v22.0'}`;
        const { data: debug } = await axios.get(
          `${graphUrl}/debug_token?input_token=${encodeURIComponent(creds.accessToken)}&access_token=${encodeURIComponent(creds.appId)}|${encodeURIComponent(creds.appSecret)}`,
          { timeout: 10000 }
        );
        if (debug?.data) {
          result.details.appValid = true;
          result.details.tokenType = debug.data.type || 'SYSTEM_USER';
          result.details.tokenExpiresAt = debug.data.expires_at === 0 ? 'Never (Permanent)' : new Date(debug.data.expires_at * 1000).toLocaleDateString();
        }
      } catch (appErr) {
        const msg = appErr.response?.data?.error?.message || appErr.message;
        result.errors.push(`App ID / Secret validation: ${msg}`);
      }
    }

    return res.json({
      success: result.ok,
      ok: result.ok,
      details: result.details,
      errors: result.errors,
    });
  } catch (err) {
    logger.error('manual-verify error', { error: err.message });
    return res.status(500).json({ success: false, ok: false, errors: [err.message], details: {} });
  }
});

/**
 * Manually connect a business's WhatsApp Business Account with:
 * phoneNumberId, wabaId, appId, appSecret, accessToken.
 */
router.post('/manual-connect', async (req, res) => {
  const b = req.body || {};
  const biz = req.business;
  const phoneNumberId = String(b.phoneNumberId || '').trim();
  const wabaId = String(b.wabaId || '').trim();
  const appId = String(b.appId || '').trim();
  const appSecret = String(b.appSecret || '').trim();
  const accessToken = String(b.accessToken || '').trim();
  const catalogId = String(b.catalogId || '').trim();
  const graphVersion = String(b.graphVersion || process.env.WA_GRAPH_VERSION || 'v22.0').trim();

  if (!phoneNumberId) return res.status(400).json({ success: false, message: 'Phone number ID is required' });
  if (!wabaId) return res.status(400).json({ success: false, message: 'WABA ID is required' });
  if (!accessToken) return res.status(400).json({ success: false, message: 'Meta Access Token is required' });

  try {
    // 1. Verify credentials against Meta Graph API
    const result = await verifyCredentials({
      accessToken,
      phoneNumberId,
      wabaId,
      catalogId,
      graphVersion,
    });

    if (!result.ok) {
      return res.status(400).json({
        success: false,
        message: result.errors?.[0] || 'Verification failed with Meta',
        errors: result.errors,
        details: result.details,
      });
    }

    // 2. Prevent duplicate phone number ID on another business
    const existing = await Business.findOne({ phoneNumberId });
    if (existing && String(existing._id) !== String(biz._id) && !isSameOwner(biz, existing)) {
      return res.status(409).json({
        success: false,
        message: 'This WhatsApp Phone Number ID is already connected to another business on the platform.',
      });
    }

    // 3. Update business record
    biz.phoneNumberId = phoneNumberId;
    biz.wabaId = wabaId;
    biz.appId = appId;
    biz.appSecret = appSecret;
    biz.accessToken = accessToken;
    if (catalogId) biz.catalogId = catalogId;
    biz.graphVersion = graphVersion;

    const numberStatus = String(result.details?.connectionStatus || '').toUpperCase();
    biz.meta = {
      ...(biz.meta || {}),
      verifiedName: result.details?.verifiedName || biz.name,
      displayPhoneNumber: result.details?.displayPhoneNumber || '',
      qualityRating: result.details?.qualityRating || '',
      wabaName: result.details?.wabaName || '',
      numberStatus: numberStatus || 'CONNECTED',
      lastVerifiedAt: new Date(),
    };

    if (result.details?.verifiedName) {
      const placeholder = `${biz.ownerFirstName || ''} ${biz.ownerLastName || ''}`.trim();
      if (!biz.name || biz.name === placeholder) {
        biz.name = result.details.verifiedName;
      }
    }

    biz.waConnection = {
      method: 'manual',
      connectedAt: new Date(),
    };
    biz.active = true;

    await biz.save();
    await onWhatsAppConnected(biz);

    const callbackUrl = webhookCallbackUrl(biz._id);
    const token = tokenForBusiness(biz, req);
    const accounts = await listOwnerAccounts(biz).catch(() => []);

    logger.info('manual WhatsApp connected for business', {
      businessId: String(biz._id),
      name: biz.name,
      phoneNumber: result.details?.displayPhoneNumber,
    });

    return res.json({
      success: true,
      token,
      business: biz.toSafeJSON(),
      accounts,
      callbackUrl,
      verifyToken: biz.verifyToken,
      details: result.details,
      errors: result.errors || [],
    });
  } catch (err) {
    logger.error('manual-connect failed', { error: err.message });
    return res.status(500).json({ success: false, message: err.message || 'Connecting WhatsApp failed.' });
  }
});

/**
 * Finish Embedded Signup: the browser posts the `code` from FB.login and the
 * WABA / phone number ids from Meta's session-info message (when it got one).
 * If this owner already has a connected WhatsApp number, a new linked Business
 * account is created automatically under the same login so one email can manage
 * multiple WhatsApp Business accounts.
 */
router.post('/embedded-signup', async (req, res) => {
  const b = req.body || {};
  const biz = req.business;
  // Reconnecting the same number keeps its two-step PIN.
  const existingPin = String(b.phoneNumberId || '') === String(biz.phoneNumberId || '') ? String(biz.waConnection?.pin || '') : '';
  try {
    const r = await completeSignup({
      code: String(b.code || ''),
      wabaId: b.wabaId,
      phoneNumberId: b.phoneNumberId,
      existingPin,
      // Initial callback URL; if a new child Business row is created below, we
      // update the WABA callback override to point at the child row's id.
      callbackUrl: webhookCallbackUrl(biz._id),
      verifyToken: biz.verifyToken,
    });

    // Check if this phone number is already connected anywhere on the platform.
    const existingByNumber = await Business.findOne({ phoneNumberId: r.phoneNumberId });
    if (existingByNumber && !isSameOwner(biz, existingByNumber)) {
      return res.status(409).json({
        success: false,
        message: 'This WhatsApp number is already connected to another business on the platform.',
      });
    }

    let targetBiz = biz;
    if (existingByNumber) {
      // Reconnecting a number already owned by this user.
      targetBiz = existingByNumber;
    } else if (!biz.phoneNumberId || String(biz.phoneNumberId) === String(r.phoneNumberId)) {
      // Current account slot has no number yet (or same number).
      targetBiz = biz;
    } else {
      // Current account already has a different number connected — check if
      // the owner has an empty unconnected slot, or create a new linked slot.
      const allOwned = await Business.find({
        ...ownerFilterFor(biz),
        active: { $ne: false },
      }).sort({ createdAt: 1 });
      const emptySlot = allOwned.find((x) => !x.phoneNumberId && !x.accessToken);
      if (emptySlot) {
        targetBiz = emptySlot;
      } else {
        const rootId = biz.parentBusinessId || biz._id;
        const displayName = r.details.verifiedName || r.details.wabaName || biz.name || 'WhatsApp Business';
        targetBiz = await Business.create({
          name: displayName,
          category: biz.category || 'other',
          labels: biz.labels || {},
          ownerFirstName: biz.ownerFirstName || '',
          ownerLastName: biz.ownerLastName || '',
          ownerPhone: biz.ownerPhone || '',
          email: biz.email || undefined,
          authUserId: biz.authUserId || undefined,
          authProvider: biz.authProvider || '',
          parentBusinessId: rootId,
          username: generateUsername(displayName),
          verifyToken: generateVerifyToken(),
          sandboxCode: await uniqueJoinCode(),
          plan: biz.plan || 'paid',
          planName: biz.planName || '',
          trial: biz.trial,
          trialEndsAt: biz.trialEndsAt,
          subscription: biz.subscription,
          flowsEnabled: !!biz.flowsEnabled,
          active: true,
        });
      }
    }

    // If the target account row differs from `biz`, point the WABA webhook override
    // at `targetBiz._id` so webhook events land on the right account.
    if (String(targetBiz._id) !== String(biz._id)) {
      await subscribeApp(r.wabaId, r.accessToken, {
        callbackUrl: webhookCallbackUrl(targetBiz._id),
        verifyToken: targetBiz.verifyToken,
      }).catch((e) => {
        logger.warn('WABA callback re-subscribe for secondary account failed', {
          wabaId: r.wabaId, targetId: String(targetBiz._id), error: e.message,
        });
      });
    }

    // The registered owner's name was only a placeholder for the business name.
    const placeholder = `${targetBiz.ownerFirstName || ''} ${targetBiz.ownerLastName || ''}`.trim();
    if (r.details.verifiedName && (!targetBiz.name || targetBiz.name === placeholder || String(targetBiz._id) !== String(biz._id))) {
      targetBiz.name = r.details.verifiedName;
    }

    const prevPin = String(targetBiz.phoneNumberId || '') === String(r.phoneNumberId || '')
      ? String(targetBiz.waConnection?.pin || existingPin || '')
      : existingPin;

    targetBiz.accessToken = r.accessToken;
    targetBiz.wabaId = r.wabaId;
    targetBiz.phoneNumberId = r.phoneNumberId;
    // Messages arrive through our Tech Provider app and are signed with its
    // secret, which is what the webhook checks.
    targetBiz.appId = process.env.META_APP_ID || '';
    targetBiz.appSecret = process.env.META_APP_SECRET || '';
    targetBiz.graphVersion = process.env.WA_GRAPH_VERSION || targetBiz.graphVersion || 'v22.0';
    // The number's status as Meta reports it after the register attempt.
    const numberStatus = String(r.details.connectionStatus || (r.registerError ? 'PENDING' : '')).toUpperCase();
    const pending = !!r.registerError
      || needsActivation({ status: numberStatus, platformType: r.details.platformType });
    targetBiz.waConnection = {
      method: 'embedded_signup',
      connectedAt: new Date(),
      metaBusinessId: String(b.metaBusinessId || targetBiz.waConnection?.metaBusinessId || ''),
      // Only a PIN Meta accepted is worth keeping: the generated one when this
      // signup registered the number, else the one this number already had.
      pin: r.registered ? r.pin : prevPin,
    };
    targetBiz.meta = {
      ...(targetBiz.meta || {}),
      verifiedName: r.details.verifiedName || '',
      displayPhoneNumber: r.details.displayPhoneNumber || '',
      qualityRating: r.details.qualityRating || '',
      wabaName: r.details.wabaName || '',
      numberStatus,
      numberStatusAt: new Date(),
      lastVerifiedAt: new Date(),
      // A fresh connection starts without the "another app" notice.
      threadControl: null,
    };
    await targetBiz.save();
    // A reconnect may bring a new token or number: drop the cached status.
    clearNumberStatus(targetBiz._id);
    // Its own number now: customers who reached it through the shared test
    // number are unlinked (the chats stay).
    await onWhatsAppConnected(targetBiz, { pending }).catch((e) => logger.warn('sandbox cleanup after connect failed', { error: e.message }));
    // Another Meta app still on this WhatsApp account (an earlier project or
    // tool): it can keep answering the number's chats, so the CRM warns now.
    const attached = await otherSubscribedApps(targetBiz, { refresh: true }).catch(() => null);
    const otherApps = attached?.ok ? attached.apps : [];
    logger.info('WhatsApp connected via Embedded Signup', {
      business: targetBiz.name, phoneNumberId: r.phoneNumberId, wabaId: r.wabaId, numberStatus, warnings: r.warnings.length,
      otherApps: otherApps.map((a) => a.id),
    });
    const [flags, accounts] = await Promise.all([
      channelFlags(targetBiz._id),
      listOwnerAccounts(targetBiz),
    ]);
    const token = tokenForBusiness(targetBiz, req);
    return res.json({
      success: true,
      token,
      business: { ...targetBiz.toSafeJSON(), ...flags },
      accounts,
      warnings: r.warnings,
      otherApps,
      webhookUrl: webhookCallbackUrl(targetBiz._id),
      // Not CONNECTED yet: the CRM shows "Pending — activate this number".
      activation: {
        needed: pending,
        status: numberStatus,
        hasSavedPin: !!targetBiz.waConnection.pin,
        error: r.registerError,
      },
    });
  } catch (err) {
    if (err instanceof SignupError) return res.status(err.status).json({ success: false, message: err.message });
    if (err?.code === 11000) {
      return res.status(409).json({ success: false, message: 'This WhatsApp number is already connected to another business.' });
    }
    logger.error('embedded signup failed', { business: biz.name, error: err.message });
    return res.status(500).json({ success: false, message: 'Connecting WhatsApp failed. Please try again.' });
  }
});

/**
 * Disconnect a WhatsApp number from the CRM (either the active account or a
 * specific `accountId` owned by the same user): our app is removed from the
 * WhatsApp account and the stored credentials are cleared. Chats, contacts and
 * templates stay. If another connected WhatsApp account exists under the same
 * owner, the session automatically switches to it.
 */
router.post('/disconnect', async (req, res) => {
  const requestedId = String(req.body?.accountId || '').trim();
  const biz = req.business;
  try {
    const targetBiz = requestedId && requestedId !== String(biz._id)
      ? await Business.findById(requestedId)
      : biz;
    if (!targetBiz || !isSameOwner(biz, targetBiz)) {
      return res.status(404).json({ success: false, message: 'WhatsApp account not found.' });
    }

    if (targetBiz.accessToken || targetBiz.phoneNumberId) {
      const un = await unsubscribeOurApp(targetBiz);
      const meta = { ...(targetBiz.meta || {}) };
      for (const k of ['verifiedName', 'displayPhoneNumber', 'qualityRating', 'wabaName', 'numberStatus']) meta[k] = '';
      meta.threadControl = null;
      await Business.updateOne(
        { _id: targetBiz._id },
        {
          $set: {
            accessToken: '',
            wabaId: '',
            waConnection: { method: '', metaBusinessId: '', pin: '' },
            meta,
          },
          // Unique column: an unconnected business holds no number (NULL), never ''.
          $unset: { phoneNumberId: 1 },
        },
      );
      clearNumberStatus(targetBiz._id);
      logger.info('WhatsApp disconnected by the business', {
        business: targetBiz.name, wabaId: targetBiz.wabaId, unsubscribed: un.ok,
      });
    }

    // Determine which Business row should be active after disconnecting.
    const allOwned = await Business.find({
      ...ownerFilterFor(biz),
      active: { $ne: false },
    }).sort({ createdAt: 1 });

    let activeBiz = allOwned.find((x) => String(x._id) === String(biz._id)) || await Business.findById(biz._id);
    if (String(targetBiz._id) === String(biz._id)) {
      const nextConnected = allOwned.find(
        (x) => String(x._id) !== String(targetBiz._id) && Boolean(x.accessToken && x.phoneNumberId),
      );
      const primaryBiz = allOwned.find((x) => !x.parentBusinessId);
      activeBiz = nextConnected || primaryBiz || activeBiz;
    }

    await syncPlanFromPrimary(activeBiz);
    const [flags, accounts] = await Promise.all([
      channelFlags(activeBiz._id),
      listOwnerAccounts(activeBiz),
    ]);
    const token = tokenForBusiness(activeBiz, req);
    return res.json({
      success: true,
      token,
      business: { ...activeBiz.toSafeJSON(), ...flags },
      accounts,
      webhookUrl: webhookCallbackUrl(activeBiz._id),
    });
  } catch (err) {
    logger.error('WhatsApp disconnect failed', { business: biz.name, error: err.message });
    return res.status(500).json({ success: false, message: 'Disconnecting WhatsApp failed. Please try again.' });
  }
});

export default router;
