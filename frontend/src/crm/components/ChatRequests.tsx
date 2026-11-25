import { useState } from 'react';
import type { CrmApi } from '../api';
import type { BusinessProfile, Order, OrderStatus, Registration, RegistrationStatus } from '../types';
import { verticalConfig } from '../verticals';
import { REG_STATUS } from '../formSubmission';
import { DownloadIcon } from './AppIcons';
import './ChatRequests.css';

const GENERIC_ORDER_STATUSES: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const GENERIC_REG_STATUSES: Record<string, string> = {
  new: 'New',
  contacted: 'Contacted',
  confirmed: 'Confirmed',
  done: 'Completed',
  cancelled: 'Cancelled',
};

function getVertical(business?: BusinessProfile) {
  return verticalConfig(business?.category, business?.labels as any);
}

function isBookingType(kind: string | undefined, vertical: ReturnType<typeof verticalConfig>) {
  return kind === 'booking' || vertical.archetype === 'person' || vertical.archetype === 'unit';
}

export interface ChatRequestsProps {
  orders: Order[];
  registrations: Registration[];
  business?: BusinessProfile;
  api: CrmApi;
  customerName?: string;
  customerPhone?: string;
  onOrderStatusUpdated?: (orderId: string, newStatus: OrderStatus) => void;
  onRegStatusUpdated?: (regId: string, newStatus: RegistrationStatus) => void;
}

export function ChatRequestHeaderPill({
  orders,
  registrations,
  business,
  onClick,
}: {
  orders: Order[];
  registrations: Registration[];
  business?: BusinessProfile;
  onClick: () => void;
}) {
  const total = orders.length + registrations.length;
  if (total === 0) return null;

  const vertical = getVertical(business);
  const latestOrder = orders[0];
  const latestReg = registrations[0];

  // Pick the latest request to show on the pill
  let icon = '🛍️';
  let label = `${total} Request${total > 1 ? 's' : ''}`;
  let statusClass = 'st-pending';

  if (latestOrder) {
    if (isBookingType(latestOrder.kind, vertical)) {
      icon = '📅';
      const statusLabel =
        vertical.orderStatuses.find((s) => s.value === latestOrder.status)?.label ||
        GENERIC_ORDER_STATUSES[latestOrder.status] ||
        latestOrder.status;
      label = `${vertical.ordersLabel}: ${statusLabel}`;
    } else {
      icon = '🛍️';
      const statusLabel =
        vertical.orderStatuses.find((s) => s.value === latestOrder.status)?.label ||
        GENERIC_ORDER_STATUSES[latestOrder.status] ||
        latestOrder.status;
      label = `${vertical.ordersLabel}: ${statusLabel}`;
    }
    statusClass = `st-${latestOrder.status}`;
  } else if (latestReg) {
    icon = '📋';
    const statusLabel =
      REG_STATUS.find((s) => s.value === latestReg.status)?.label ||
      GENERIC_REG_STATUSES[latestReg.status] ||
      latestReg.status;
    label = `Request: ${statusLabel}`;
    statusClass = `reg-${latestReg.status}`;
  }

  return (
    <button
      type="button"
      className={`chat-req-header-pill ${statusClass}`}
      onClick={onClick}
      title="Click to view customer request details and update status"
    >
      <span className="cr-pill-icon">{icon}</span>
      <span className="cr-pill-label">{label}</span>
      {total > 1 && <span className="cr-pill-badge">+{total - 1}</span>}
      <span className="material-icons cr-pill-chev">expand_more</span>
    </button>
  );
}

export function ChatRequestBanner({
  orders,
  registrations,
  business,
  api,
  onOpenDetails,
  onOrderStatusUpdated,
  onRegStatusUpdated,
}: {
  orders: Order[];
  registrations: Registration[];
  business?: BusinessProfile;
  api: CrmApi;
  onOpenDetails: () => void;
  onOrderStatusUpdated?: (orderId: string, newStatus: OrderStatus) => void;
  onRegStatusUpdated?: (regId: string, newStatus: RegistrationStatus) => void;
}) {
  const [updating, setUpdating] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const total = orders.length + registrations.length;
  if (total === 0) return null;

  const vertical = getVertical(business);
  const latestOrder = orders[0];
  const latestReg = registrations[0];

  const handleOrderStatusChange = async (newStatus: OrderStatus) => {
    if (!latestOrder) return;
    setUpdating(true);
    setSuccessMsg('');
    try {
      await api.setOrderStatus(latestOrder._id, newStatus);
      onOrderStatusUpdated?.(latestOrder._id, newStatus);
      const label =
        vertical.orderStatuses.find((s) => s.value === newStatus)?.label ||
        GENERIC_ORDER_STATUSES[newStatus] ||
        newStatus;
      setSuccessMsg(`Status updated to "${label}"`);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Could not update status');
    } finally {
      setUpdating(false);
    }
  };

  const handleRegStatusChange = async (newStatus: RegistrationStatus) => {
    if (!latestReg) return;
    setUpdating(true);
    setSuccessMsg('');
    try {
      await api.setRegistrationStatus(latestReg._id, newStatus);
      onRegStatusUpdated?.(latestReg._id, newStatus);
      const label =
        REG_STATUS.find((s) => s.value === newStatus)?.label ||
        GENERIC_REG_STATUSES[newStatus] ||
        newStatus;
      setSuccessMsg(`Status updated to "${label}"`);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Could not update status');
    } finally {
      setUpdating(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!latestOrder) return;
    try {
      const url = await api.getOrderPdfUrl(latestOrder._id);
      window.open(url, '_blank');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Confirmation slip not available for this order');
    }
  };

  return (
    <div className={`chat-request-banner ${collapsed ? 'collapsed' : ''}`}>
      <div className="cr-banner-header">
        <div className="cr-banner-title-wrap">
          <span className="cr-banner-icon">
            {latestOrder && isBookingType(latestOrder.kind, vertical)
              ? '📅'
              : latestOrder
                ? '🛍️'
                : '📋'}
          </span>
          <div className="cr-banner-titles">
            <span className="cr-banner-kind">
              {latestOrder
                ? isBookingType(latestOrder.kind, vertical)
                  ? `${vertical.ordersLabel}: ${latestOrder.reference || 'Booking'}`
                  : `${vertical.ordersLabel}: #${latestOrder.reference || 'Order'}`
                : `Customer Request`}
            </span>
            {latestOrder?.createdAt && (
              <span className="cr-banner-time">
                {new Date(latestOrder.createdAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
            {latestReg && !latestOrder && latestReg.createdAt && (
              <span className="cr-banner-time">
                {new Date(latestReg.createdAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
          </div>
          {total > 1 && (
            <span className="cr-banner-count-badge" onClick={onOpenDetails}>
              +{total - 1} more
            </span>
          )}
        </div>

        <div className="cr-banner-actions">
          {successMsg && <span className="cr-success-pill">✓ {successMsg}</span>}

          {/* Quick status dropdown */}
          {latestOrder && (
            <div className="cr-status-control">
              <span className="cr-status-label">Status:</span>
              <select
                className={`cr-status-select st-${latestOrder.status}`}
                value={latestOrder.status}
                disabled={updating}
                onChange={(e) => handleOrderStatusChange(e.target.value as OrderStatus)}
              >
                {vertical.orderStatuses.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!latestOrder && latestReg && (
            <div className="cr-status-control">
              <span className="cr-status-label">Status:</span>
              <select
                className={`cr-status-select reg-${latestReg.status}`}
                value={latestReg.status}
                disabled={updating}
                onChange={(e) => handleRegStatusChange(e.target.value as RegistrationStatus)}
              >
                {REG_STATUS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            className="cr-btn-details"
            onClick={onOpenDetails}
            title="View complete order and request details"
          >
            Details
          </button>

          {latestOrder && (
            <button
              type="button"
              className="cr-btn-pdf"
              onClick={handleDownloadPdf}
              title="Download or preview confirmation slip (PDF)"
            >
              <DownloadIcon size={14} />
              <span>Slip</span>
            </button>
          )}

          <button
            type="button"
            className="cr-btn-toggle"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand request banner' : 'Collapse request banner'}
          >
            <span className="material-icons">{collapsed ? 'expand_more' : 'expand_less'}</span>
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="cr-banner-body">
          {/* Order Details */}
          {latestOrder && (
            <div className="cr-summary-row">
              {latestOrder.items && latestOrder.items.length > 0 && (
                <div className="cr-summary-chip items">
                  <strong>Items:</strong>{' '}
                  {latestOrder.items.map((it) => `${it.qty}x ${it.name}`).join(', ')}
                </div>
              )}
              {latestOrder.total > 0 && (
                <div className="cr-summary-chip total">
                  <strong>Total:</strong> {latestOrder.total.toLocaleString()}
                  {latestOrder.paymentMethod ? ` (${latestOrder.paymentMethod})` : ''}
                </div>
              )}
              {latestOrder.member && (
                <div className="cr-summary-chip member">
                  <strong>With:</strong> {latestOrder.member}
                </div>
              )}
              {latestOrder.scheduledAt && (
                <div className="cr-summary-chip scheduled">
                  <strong>Appointment:</strong>{' '}
                  {new Date(latestOrder.scheduledAt).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              )}
              {latestOrder.deliveryAddress && (
                <div className="cr-summary-chip address">
                  <strong>Deliver to:</strong> {latestOrder.deliveryAddress}
                </div>
              )}
            </div>
          )}

          {/* Registration / Form Submission Details */}
          {!latestOrder && latestReg && (
            <div className="cr-summary-row">
              {latestReg.category && (
                <div className="cr-summary-chip">
                  <strong>Service:</strong> {latestReg.category}
                </div>
              )}
              {latestReg.memberName && (
                <div className="cr-summary-chip">
                  <strong>Staff:</strong> {latestReg.memberName}
                </div>
              )}
              {latestReg.date && (
                <div className="cr-summary-chip">
                  <strong>Date:</strong> {latestReg.date} {latestReg.slot ? `at ${latestReg.slot}` : ''}
                </div>
              )}
              {latestReg.rows && latestReg.rows.length > 0 && (
                <div className="cr-summary-chip">
                  <strong>Details:</strong>{' '}
                  {latestReg.rows
                    .slice(0, 3)
                    .map((r) => `${r.label}: ${r.value}`)
                    .join(' · ')}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ChatRequestDrawer({
  isOpen,
  onClose,
  orders,
  registrations,
  business,
  api,
  customerName,
  customerPhone,
  onOrderStatusUpdated,
  onRegStatusUpdated,
}: {
  isOpen: boolean;
  onClose: () => void;
  orders: Order[];
  registrations: Registration[];
  business?: BusinessProfile;
  api: CrmApi;
  customerName?: string;
  customerPhone?: string;
  onOrderStatusUpdated?: (orderId: string, newStatus: OrderStatus) => void;
  onRegStatusUpdated?: (regId: string, newStatus: RegistrationStatus) => void;
}) {
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'orders' | 'forms'>(
    orders.length > 0 ? 'orders' : 'forms'
  );

  if (!isOpen) return null;

  const vertical = getVertical(business);

  const handleUpdateOrderStatus = async (orderId: string, newStatus: OrderStatus) => {
    setUpdatingId(orderId);
    try {
      await api.setOrderStatus(orderId, newStatus);
      onOrderStatusUpdated?.(orderId, newStatus);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Could not update status');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleUpdateRegStatus = async (regId: string, newStatus: RegistrationStatus) => {
    setUpdatingId(regId);
    try {
      await api.setRegistrationStatus(regId, newStatus);
      onRegStatusUpdated?.(regId, newStatus);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Could not update status');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDownloadPdf = async (orderId: string) => {
    try {
      const url = await api.getOrderPdfUrl(orderId);
      window.open(url, '_blank');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Confirmation slip not available for this order');
    }
  };

  return (
    <div className="cr-drawer-backdrop" onClick={onClose}>
      <div className="cr-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="cr-drawer-head">
          <div className="cr-dh-text">
            <h3>{vertical.ordersLabel} & Customer Requests</h3>
            <p>
              {customerName ? <strong>{customerName}</strong> : 'Customer'}
              {customerPhone ? ` · +${customerPhone}` : ''}
            </p>
          </div>
          <button type="button" className="cr-dh-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* Tab switcher if both orders and form submissions exist */}
        {orders.length > 0 && registrations.length > 0 && (
          <div className="cr-drawer-tabs">
            <button
              type="button"
              className={`cr-tab-btn ${activeTab === 'orders' ? 'active' : ''}`}
              onClick={() => setActiveTab('orders')}
            >
              {vertical.ordersLabel} ({orders.length})
            </button>
            <button
              type="button"
              className={`cr-tab-btn ${activeTab === 'forms' ? 'active' : ''}`}
              onClick={() => setActiveTab('forms')}
            >
              Form Requests ({registrations.length})
            </button>
          </div>
        )}

        <div className="cr-drawer-body">
          {/* ORDERS & BOOKINGS LIST */}
          {(activeTab === 'orders' || registrations.length === 0) && (
            <div className="cr-cards-list">
              {orders.length === 0 ? (
                <div className="cr-empty">No {vertical.ordersLabel.toLowerCase()} found for this contact.</div>
              ) : (
                orders.map((ord) => {
                  const isBooking = isBookingType(ord.kind, vertical);
                  return (
                    <div className={`cr-card st-${ord.status}`} key={ord._id}>
                      <div className="cr-card-top">
                        <div className="cr-card-ref">
                          <span className="cr-card-kind-badge">
                            {isBooking ? '📅 BOOKING' : '🛍️ ORDER'}
                          </span>
                          <strong>{ord.reference || ord._id.slice(-6).toUpperCase()}</strong>
                        </div>

                        {/* Status selector right on the card */}
                        <div className="cr-card-status-sel-wrap">
                          <select
                            className={`cr-status-select st-${ord.status}`}
                            value={ord.status}
                            disabled={updatingId === ord._id}
                            onChange={(e) =>
                              handleUpdateOrderStatus(ord._id, e.target.value as OrderStatus)
                            }
                          >
                            {vertical.orderStatuses.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {ord.createdAt && (
                        <div className="cr-card-date">
                          Placed on{' '}
                          {new Date(ord.createdAt).toLocaleString(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </div>
                      )}

                      {/* Appointment / Booking specific fields */}
                      {isBooking && (
                        <div className="cr-booking-info">
                          {ord.member && (
                            <div className="cr-info-item">
                              <span className="cr-info-k">Staff / Resource:</span>
                              <span className="cr-info-v">{ord.member}</span>
                            </div>
                          )}
                          {ord.scheduledAt && (
                            <div className="cr-info-item">
                              <span className="cr-info-k">Scheduled for:</span>
                              <span className="cr-info-v highlight">
                                {new Date(ord.scheduledAt).toLocaleString(undefined, {
                                  dateStyle: 'full',
                                  timeStyle: 'short',
                                })}
                              </span>
                            </div>
                          )}
                          {ord.category && (
                            <div className="cr-info-item">
                              <span className="cr-info-k">Service Category:</span>
                              <span className="cr-info-v">{ord.category}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Items table / list */}
                      {ord.items && ord.items.length > 0 && (
                        <div className="cr-items-table">
                          <div className="cr-it-head">
                            <span>Item</span>
                            <span className="cr-it-qty">Qty</span>
                            <span className="cr-it-price">Price</span>
                          </div>
                          {ord.items.map((it, idx) => (
                            <div className="cr-it-row" key={idx}>
                              <span className="cr-it-name">{it.name}</span>
                              <span className="cr-it-qty">x{it.qty}</span>
                              <span className="cr-it-price">
                                {(it.price * (it.qty || 1)).toLocaleString()}
                              </span>
                            </div>
                          ))}
                          {ord.deliveryFee ? (
                            <div className="cr-it-row fee">
                              <span>Delivery Fee</span>
                              <span />
                              <span className="cr-it-price">{ord.deliveryFee.toLocaleString()}</span>
                            </div>
                          ) : null}
                          <div className="cr-it-row total">
                            <strong>Total Payable</strong>
                            <span />
                            <strong className="cr-it-price">{ord.total.toLocaleString()}</strong>
                          </div>
                        </div>
                      )}

                      {/* Delivery & Payment details */}
                      <div className="cr-meta-fields">
                        {ord.paymentMethod && (
                          <div className="cr-meta-item">
                            <span className="cr-meta-k">Payment:</span>
                            <span className="cr-meta-v">
                              {ord.paymentMethod} {ord.paid ? '(Paid ✓)' : '(Pending)'}
                            </span>
                          </div>
                        )}
                        {ord.deliveryAddress && (
                          <div className="cr-meta-item address">
                            <span className="cr-meta-k">Delivery Address:</span>
                            <span className="cr-meta-v">{ord.deliveryAddress}</span>
                          </div>
                        )}
                        {ord.locationUrl && (
                          <div className="cr-meta-item">
                            <span className="cr-meta-k">Map Location:</span>
                            <a
                              href={ord.locationUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="cr-map-link"
                            >
                              Open in Maps ↗
                            </a>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="cr-card-footer">
                        <button
                          type="button"
                          className="cr-card-pdf-btn"
                          onClick={() => handleDownloadPdf(ord._id)}
                        >
                          <DownloadIcon size={14} />
                          <span>Confirmation Slip (PDF)</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* FORM REGISTRATIONS LIST */}
          {(activeTab === 'forms' || orders.length === 0) && (
            <div className="cr-cards-list">
              {registrations.length === 0 ? (
                <div className="cr-empty">No form requests found for this contact.</div>
              ) : (
                registrations.map((reg) => (
                  <div className={`cr-card reg-${reg.status}`} key={reg._id}>
                    <div className="cr-card-top">
                      <div className="cr-card-ref">
                        <span className="cr-card-kind-badge reg">📋 FORM REQUEST</span>
                        <strong>{reg.name || 'Submission'}</strong>
                      </div>

                      {/* Status selector */}
                      <div className="cr-card-status-sel-wrap">
                        <select
                          className={`cr-status-select reg-${reg.status}`}
                          value={reg.status}
                          disabled={updatingId === reg._id}
                          onChange={(e) =>
                            handleUpdateRegStatus(reg._id, e.target.value as RegistrationStatus)
                          }
                        >
                          {REG_STATUS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {reg.createdAt && (
                      <div className="cr-card-date">
                        Submitted on{' '}
                        {new Date(reg.createdAt).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </div>
                    )}

                    {/* Booking/Service info */}
                    <div className="cr-booking-info">
                      {reg.category && (
                        <div className="cr-info-item">
                          <span className="cr-info-k">Service:</span>
                          <span className="cr-info-v">{reg.category}</span>
                        </div>
                      )}
                      {reg.memberName && (
                        <div className="cr-info-item">
                          <span className="cr-info-k">Staff:</span>
                          <span className="cr-info-v">{reg.memberName}</span>
                        </div>
                      )}
                      {reg.date && (
                        <div className="cr-info-item">
                          <span className="cr-info-k">Requested Date:</span>
                          <span className="cr-info-v highlight">
                            {reg.date} {reg.slot ? `at ${reg.slot}` : ''}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Form answers */}
                    {reg.rows && reg.rows.length > 0 && (
                      <div className="cr-answers-box">
                        <div className="cr-answers-title">Submitted Answers:</div>
                        {reg.rows.map((row, idx) => (
                          <div className="cr-answer-row" key={idx}>
                            <span className="cr-ans-q">{row.label}:</span>
                            <span className="cr-ans-a">{String(row.value)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
