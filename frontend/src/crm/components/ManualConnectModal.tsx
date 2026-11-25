import { useState } from 'react';
import type { CrmApi } from '../api';
import type { BusinessProfile, WhatsAppAccountSummary } from '../types';
import './ManualConnectModal.css';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  api: CrmApi;
  business?: BusinessProfile;
  onConnected: (b: BusinessProfile, accounts?: WhatsAppAccountSummary[]) => void;
}

interface VerifyResult {
  ok?: boolean;
  success?: boolean;
  details?: Record<string, unknown>;
  errors?: string[];
  message?: string;
}

const DETAIL_LABELS: Array<[string, string]> = [
  ['verifiedName', 'Display name'],
  ['displayPhoneNumber', 'Phone number'],
  ['connectionStatus', 'Number status'],
  ['qualityRating', 'Quality rating'],
  ['nameStatus', 'Display name review'],
  ['messagingLimit', 'Messaging limit'],
  ['platformType', 'Hosted on'],
  ['wabaName', 'WhatsApp account'],
  ['timezone', 'Timezone'],
  ['currency', 'Currency'],
  ['tokenType', 'Token type'],
  ['tokenExpiresAt', 'Token expiry'],
];

export function ManualConnectModal({ isOpen, onClose, api, business, onConnected }: Props) {
  const [phoneNumberId, setPhoneNumberId] = useState(business?.phoneNumberId || '');
  const [wabaId, setWabaId] = useState(business?.wabaId || '');
  const [appId, setAppId] = useState(business?.appId || '');
  const [appSecret, setAppSecret] = useState('');
  const [accessToken, setAccessToken] = useState('');

  const [showSecret, setShowSecret] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [verifyError, setVerifyError] = useState('');

  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState('');

  // Result after successful connection
  const [connectedData, setConnectedData] = useState<{
    callbackUrl: string;
    verifyToken: string;
    business: BusinessProfile;
    accounts?: WhatsAppAccountSummary[];
    displayPhone?: string;
    verifiedName?: string;
  } | null>(null);

  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  if (!isOpen) return null;

  const handleCopy = (text: string, type: 'url' | 'token') => {
    navigator.clipboard.writeText(text).then(() => {
      if (type === 'url') {
        setCopiedUrl(true);
        setTimeout(() => setCopiedUrl(false), 2000);
      } else {
        setCopiedToken(true);
        setTimeout(() => setCopiedToken(false), 2000);
      }
    });
  };

  const handleCheck = async () => {
    setVerifyError('');
    setConnectError('');
    if (!phoneNumberId.trim()) {
      setVerifyError('Phone Number ID is required.');
      return;
    }
    if (!accessToken.trim()) {
      setVerifyError('Meta Access Token is required.');
      return;
    }

    setVerifying(true);
    try {
      const res = await api.manualVerifyWhatsApp({
        phoneNumberId: phoneNumberId.trim(),
        wabaId: wabaId.trim(),
        appId: appId.trim(),
        appSecret: appSecret.trim(),
        accessToken: accessToken.trim(),
      });
      setVerifyResult(res);
      if (!res.ok && res.errors?.length) {
        setVerifyError(res.errors.join('; '));
      }
    } catch (err: unknown) {
      setVerifyError(err instanceof Error ? err.message : 'Verification failed with Meta');
      setVerifyResult(null);
    } finally {
      setVerifying(false);
    }
  };

  const handleConnect = async () => {
    setConnectError('');
    if (!phoneNumberId.trim()) {
      setConnectError('Phone Number ID is required.');
      return;
    }
    if (!wabaId.trim()) {
      setConnectError('WhatsApp Business Account (WABA) ID is required.');
      return;
    }
    if (!appId.trim()) {
      setConnectError('App ID is required.');
      return;
    }
    if (!appSecret.trim()) {
      setConnectError('App Secret is required.');
      return;
    }
    if (!accessToken.trim()) {
      setConnectError('Meta Access Token is required.');
      return;
    }

    setConnecting(true);
    try {
      const res = await api.manualConnectWhatsApp({
        phoneNumberId: phoneNumberId.trim(),
        wabaId: wabaId.trim(),
        appId: appId.trim(),
        appSecret: appSecret.trim(),
        accessToken: accessToken.trim(),
      });

      if (res.token) {
        api.setToken(res.token);
      }

      setConnectedData({
        callbackUrl: res.callbackUrl,
        verifyToken: res.verifyToken,
        business: res.business,
        accounts: res.accounts,
        displayPhone: String(res.details?.displayPhoneNumber || ''),
        verifiedName: String(res.details?.verifiedName || res.business.name || ''),
      });
    } catch (err: unknown) {
      setConnectError(err instanceof Error ? err.message : 'Connection failed. Please check your credentials.');
    } finally {
      setConnecting(false);
    }
  };

  const handleFinish = () => {
    if (connectedData) {
      onConnected(connectedData.business, connectedData.accounts);
    }
    onClose();
  };

  return (
    <div className="mc-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="mc-card" onClick={(e) => e.stopPropagation()}>
        <div className="mc-header">
          <div className="mc-header-icon-wrap">
            <img src="/whatsapp.svg" alt="WhatsApp" className="mc-header-wa-icon" />
          </div>
          <div className="mc-header-text">
            <h3 className="mc-title">
              {connectedData ? 'WhatsApp Connected' : 'Connect WhatsApp Business Account'}
            </h3>
            <p className="mc-sub">
              {connectedData
                ? 'Configure your Meta Webhook to begin receiving messages in real time.'
                : 'Enter your Meta WhatsApp Cloud API credentials to link your WhatsApp number.'}
            </p>
          </div>
          <button type="button" className="mc-close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="mc-body">
          {connectedData ? (
            /* STEP 2: Connected Success & Webhook Configuration */
            <div className="mc-success-view">
              <div className="mc-success-banner">
                <div className="mc-success-tick">✓</div>
                <div>
                  <div className="mc-success-title">Successfully Linked to Meta Cloud API!</div>
                  <div className="mc-success-meta">
                    <strong>{connectedData.verifiedName || 'WhatsApp Account'}</strong>
                    {connectedData.displayPhone ? ` · ${connectedData.displayPhone}` : ''}
                  </div>
                </div>
              </div>

              <div className="mc-webhook-box">
                <div className="mc-webhook-box-title">
                  <span className="material-icons" style={{ fontSize: 18, color: '#0284c7' }}>webhook</span>
                  Webhook Configuration for Meta Developer Portal
                </div>
                <p className="mc-webhook-desc">
                  Paste these credentials into your <strong>Meta App Dashboard</strong> under{' '}
                  <strong>WhatsApp &gt; Configuration</strong> so the CRM can receive customer messages and status updates:
                </p>

                <div className="mc-field-block">
                  <label className="mc-field-label">
                    <span>Callback URL</span>
                  </label>
                  <div className="mc-copy-input-row">
                    <input
                      type="text"
                      readOnly
                      value={connectedData.callbackUrl}
                      className="mc-input mc-copy-input"
                    />
                    <button
                      type="button"
                      className={`mc-copy-btn ${copiedUrl ? 'copied' : ''}`}
                      onClick={() => handleCopy(connectedData.callbackUrl, 'url')}
                    >
                      {copiedUrl ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>

                <div className="mc-field-block">
                  <label className="mc-field-label">
                    <span>Verify Token</span>
                  </label>
                  <div className="mc-copy-input-row">
                    <input
                      type="text"
                      readOnly
                      value={connectedData.verifyToken}
                      className="mc-input mc-copy-input"
                    />
                    <button
                      type="button"
                      className={`mc-copy-btn ${copiedToken ? 'copied' : ''}`}
                      onClick={() => handleCopy(connectedData.verifyToken, 'token')}
                    >
                      {copiedToken ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>

                <div className="mc-instructions-list">
                  <div className="mc-step-row">
                    <span className="mc-step-num">1</span>
                    <span>Go to <a href="https://developers.facebook.com/apps/" target="_blank" rel="noreferrer" className="mc-link">developers.facebook.com/apps</a> and open your App.</span>
                  </div>
                  <div className="mc-step-row">
                    <span className="mc-step-num">2</span>
                    <span>In the left navigation, click <strong>WhatsApp &gt; Configuration</strong>.</span>
                  </div>
                  <div className="mc-step-row">
                    <span className="mc-step-num">3</span>
                    <span>Under <strong>Webhook</strong>, click <strong>Edit</strong>, paste the <strong>Callback URL</strong> and <strong>Verify Token</strong> above, and click <strong>Verify and save</strong>.</span>
                  </div>
                  <div className="mc-step-row">
                    <span className="mc-step-num">4</span>
                    <span>Click <strong>Manage</strong> next to Webhook fields and subscribe to <strong>messages</strong>.</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* STEP 1: Credential Form & Verification Details */
            <div className="mc-form-view">
              <div className="mc-form-grid">
                <label className="mc-field">
                  <span className="mc-field-label">
                    Phone Number ID <span className="mc-req">*</span>
                  </span>
                  <input
                    type="text"
                    className="mc-input"
                    placeholder="e.g. 104829104812345"
                    value={phoneNumberId}
                    onChange={(e) => {
                      setPhoneNumberId(e.target.value.trim());
                      setVerifyResult(null);
                    }}
                  />
                  <small className="mc-hint">Found in Meta App &gt; WhatsApp &gt; API Setup &gt; Phone number ID</small>
                </label>

                <label className="mc-field">
                  <span className="mc-field-label">
                    WABA ID (WhatsApp Business Account ID) <span className="mc-req">*</span>
                  </span>
                  <input
                    type="text"
                    className="mc-input"
                    placeholder="e.g. 204829104812345"
                    value={wabaId}
                    onChange={(e) => {
                      setWabaId(e.target.value.trim());
                      setVerifyResult(null);
                    }}
                  />
                  <small className="mc-hint">Found in Meta App &gt; WhatsApp &gt; API Setup &gt; WhatsApp Business Account ID</small>
                </label>

                <label className="mc-field">
                  <span className="mc-field-label">
                    App ID <span className="mc-req">*</span>
                  </span>
                  <input
                    type="text"
                    className="mc-input"
                    placeholder="e.g. 1568144781182581"
                    value={appId}
                    onChange={(e) => {
                      setAppId(e.target.value.trim());
                      setVerifyResult(null);
                    }}
                  />
                  <small className="mc-hint">Found at top of Meta App Dashboard &gt; App ID</small>
                </label>

                <label className="mc-field">
                  <span className="mc-field-label">
                    App Secret <span className="mc-req">*</span>
                  </span>
                  <div className="mc-secret-wrap">
                    <input
                      type={showSecret ? 'text' : 'password'}
                      className="mc-input"
                      placeholder="Enter App Secret"
                      value={appSecret}
                      onChange={(e) => {
                        setAppSecret(e.target.value.trim());
                        setVerifyResult(null);
                      }}
                    />
                    <button
                      type="button"
                      className="mc-toggle-vis"
                      onClick={() => setShowSecret((p) => !p)}
                      title={showSecret ? 'Hide' : 'Show'}
                    >
                      {showSecret ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <small className="mc-hint">Meta App &gt; App settings &gt; Basic &gt; App secret</small>
                </label>

                <label className="mc-field mc-field-full">
                  <span className="mc-field-label">
                    Meta Access Token (Permanent System User Token) <span className="mc-req">*</span>
                  </span>
                  <div className="mc-secret-wrap">
                    <input
                      type={showToken ? 'text' : 'password'}
                      className="mc-input mc-token-input"
                      placeholder="EAAG..."
                      value={accessToken}
                      onChange={(e) => {
                        setAccessToken(e.target.value.trim());
                        setVerifyResult(null);
                      }}
                    />
                    <button
                      type="button"
                      className="mc-toggle-vis"
                      onClick={() => setShowToken((p) => !p)}
                      title={showToken ? 'Hide' : 'Show'}
                    >
                      {showToken ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <small className="mc-hint">
                    Permanent access token generated in Meta Business Manager &gt; Users &gt; System users with <code>whatsapp_business_messaging</code> and <code>whatsapp_business_management</code>.
                  </small>
                </label>
              </div>

              {verifyError && <div className="mc-alert error">{verifyError}</div>}
              {connectError && <div className="mc-alert error">{connectError}</div>}

              {/* CRITERIA STATUS PANEL (Mirrors Admin Panel Check Panel) */}
              {verifyResult?.ok && (
                <div className="mc-verify-panel">
                  <div className="mc-verify-panel-header">
                    <span className="mc-verify-badge">✓ Verified with Meta</span>
                    <span className="mc-verify-note">Credentials are valid and ready to connect.</span>
                  </div>
                  <div className="mc-verify-grid">
                    {DETAIL_LABELS.map(([k, label]) => {
                      const val = verifyResult.details?.[k];
                      if (val === undefined || val === null || val === '') return null;
                      const str = String(val);
                      const isConnected = k === 'connectionStatus' && str.toUpperCase() === 'CONNECTED';
                      const isHighQuality = k === 'qualityRating' && str.toUpperCase() === 'GREEN';
                      return (
                        <div key={k} className="mc-verify-cell">
                          <span className="mc-verify-label">{label}</span>
                          <strong className="mc-verify-val">
                            {isConnected ? (
                              <span className="mc-status-pill green">CONNECTED</span>
                            ) : isHighQuality ? (
                              <span className="mc-status-pill green">HIGH</span>
                            ) : (
                              str
                            )}
                          </strong>
                        </div>
                      );
                    })}
                  </div>
                  {verifyResult.errors && verifyResult.errors.length > 0 && (
                    <div className="mc-verify-warnings">
                      {verifyResult.errors.join('; ')}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mc-footer">
          {connectedData ? (
            <button
              type="button"
              className="mc-btn mc-btn-primary mc-btn-full"
              onClick={handleFinish}
              data-testid="mc-finish-btn"
            >
              Open Working Panel →
            </button>
          ) : (
            <div className="mc-footer-btns">
              <button
                type="button"
                className="mc-btn mc-btn-secondary"
                onClick={handleCheck}
                disabled={verifying || connecting}
                data-testid="mc-check-btn"
              >
                {verifying ? 'Checking with Meta…' : 'Check Credentials'}
              </button>

              <button
                type="button"
                className="mc-btn mc-btn-primary"
                onClick={handleConnect}
                disabled={verifying || connecting}
                data-testid="mc-connect-btn"
              >
                {connecting ? 'Connecting…' : 'Confirm & Connect'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

