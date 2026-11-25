import type { MetaChannel } from '../types';
import './ChannelStatusPage.css';

interface Props {
  channel: MetaChannel;
  onConnectClick?: () => void;
  configured?: boolean;
}

export function MetaInfinityLogo({ width = 46, height = 31 }: { width?: number; height?: number }) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
      aria-label="Meta"
    >
      <defs>
        <linearGradient id="meta-grad-hero-onboarding" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0064E0" />
          <stop offset="50%" stopColor="#0072EC" />
          <stop offset="100%" stopColor="#0081FB" />
        </linearGradient>
      </defs>
      <path
        d="M16.92 6C15.01 6 13.34 6.95 12 8.44C10.66 6.95 8.99 6 7.08 6C3.72 6 1 8.79 1 12.22C1 15.66 3.72 18.45 7.08 18.45C9 18.45 10.66 17.5 12 16.01C13.34 17.5 15.01 18.45 16.92 18.45C20.28 18.45 23 15.66 23 12.22C23 8.79 20.28 6 16.92 6ZM7.08 16.35C4.83 16.35 3 14.5 3 12.22C3 9.95 4.83 8.1 7.08 8.1C8.61 8.1 9.97 8.95 10.87 10.3C10.02 11.54 8.72 12.72 7.23 13.56C6.77 13.82 6.31 14.04 5.86 14.21C6.22 15.48 7.08 16.35 7.08 16.35ZM16.92 16.35C15.39 16.35 14.03 15.5 13.13 14.15C13.98 12.91 15.28 11.73 16.77 10.89C17.23 10.63 17.69 10.41 18.14 10.24C17.78 8.97 16.92 8.1 16.92 8.1C19.17 8.1 21 9.95 21 12.22C21 14.5 19.17 16.35 16.92 16.35Z"
        fill="url(#meta-grad-hero-onboarding)"
      />
    </svg>
  );
}

export function BenefitCheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="cs-benefit-icon">
      <path
        d="M9 12L11 14L15 10M12 3L4 7V13C4 17.4183 7.58172 21 12 21C16.4183 21 20 17.4183 20 13V7L12 3Z"
        stroke="#16a34a"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ConnectChannelOnboarding({ channel, onConnectClick, configured = true }: Props) {
  const isIg = channel === 'instagram';
  const label = isIg ? 'Instagram' : 'Messenger';

  return (
    <div
      className="crm-channel-onboard-wrap"
      data-testid={`crm-onboarding-${channel}`}
      style={{
        flex: 1,
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '36px 20px',
        background: '#ffffff',
        overflowY: 'auto',
        boxSizing: 'border-box',
      }}
    >
      <div className="cs-unconnected-hero-box" style={{ margin: 'auto' }}>
        <div className="cs-unconnected-logos-row">
          <img
            src={isIg ? '/channel-instagram.svg' : '/channel-messenger.svg'}
            alt={label}
            className={`cs-unconnected-logo-img${isIg ? '' : ' cs-messenger-logo'}`}
            style={isIg ? { borderRadius: 10 } : undefined}
          />
          <span className="cs-unconnected-arrow">⇄</span>
          <MetaInfinityLogo width={46} height={31} />
        </div>

        <h2 className="cs-unconnected-headline">
          {isIg
            ? 'To experience messaging, connect your Instagram account'
            : 'To experience messaging, connect your Facebook Page'}
        </h2>
        <p className="cs-unconnected-subline">
          {isIg
            ? 'Once connected, you can start chatting with customers on Instagram Direct'
            : 'Once connected, you can start chatting with customers on Facebook Messenger'}
        </p>

        <div className="cs-unconnected-benefits-box">
          <h3 className="cs-unconnected-benefits-title">
            {isIg ? 'Benefits of connecting your own account' : 'Benefits of connecting your own page'}
          </h3>
          <ul className="cs-unconnected-benefits-list">
            <li className="cs-unconnected-benefit-item">
              <BenefitCheckIcon />
              <span>
                {isIg
                  ? 'Chat directly with Instagram Direct customers'
                  : 'Chat directly with Facebook Page customers'}
              </span>
            </li>
            <li className="cs-unconnected-benefit-item">
              <BenefitCheckIcon />
              <span>
                {isIg
                  ? 'Unified inbox with WhatsApp and Facebook'
                  : 'Unified inbox with WhatsApp and Instagram'}
              </span>
            </li>
            <li className="cs-unconnected-benefit-item">
              <BenefitCheckIcon />
              <span>Reply with text and photos from the CRM</span>
            </li>
          </ul>

          <div className="cs-unconnected-cta-row">
            <button
              type="button"
              className="cs-connect-channel-btn"
              onClick={onConnectClick}
              disabled={configured === false}
              data-testid={`crm-connect-${channel}-hero-btn`}
            >
              {configured === false ? 'Not set up yet' : `Connect ${label} Account`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
