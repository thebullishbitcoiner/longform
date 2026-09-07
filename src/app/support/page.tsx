'use client';

import { useState, useEffect, useRef } from 'react';
import { CheckIcon, ArrowTopRightOnSquareIcon, StarIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { useNostr } from '@/contexts/NostrContext';
import { usePlatformStatus } from '@/contexts/PlatformStatusContext';
import { formatExpirationDate, formatUnixDate, isExpiringSoon } from '@/utils/billingDisplay';
import {
  fetchLegendPriceSats,
  fetchProPrices,
  payLegendInvoice,
  payProInvoice,
  PRO_TERM_DAYS_MONTHLY,
  PRO_TERM_DAYS_YEARLY,
} from '@/utils/billingClient';
import toast from 'react-hot-toast';
import './page.css';

const SupportPage: React.FC = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isYearly, setIsYearly] = useState(false);
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false);
  const [legendPriceSats, setLegendPriceSats] = useState(100_000);
  const [proMonthlySats, setProMonthlySats] = useState(1_000);
  const [proYearlySats, setProYearlySats] = useState(10_000);
  const hasLaunchedPaymentRef = useRef(false);
  const { currentUser } = useNostr();
  const { proStatus, meStatus, isLoading, isLegend, refreshProStatus } = usePlatformStatus();

  useEffect(() => {
    void fetchLegendPriceSats().then(setLegendPriceSats);
    void fetchProPrices().then(({ monthly, yearly }) => {
      setProMonthlySats(monthly);
      setProYearlySats(yearly);
    });
  }, []);

  const proPriceSats = isYearly ? proYearlySats : proMonthlySats;
  const termDays = isYearly ? PRO_TERM_DAYS_YEARLY : PRO_TERM_DAYS_MONTHLY;

  const handleProSubscribe = async () => {
    if (!currentUser?.pubkey) {
      toast.error('Please log in to subscribe to PRO');
      return;
    }
    if (hasLaunchedPaymentRef.current) return;
    hasLaunchedPaymentRef.current = true;
    setIsSubmitting(true);

    try {
      const result = await payProInvoice(currentUser.pubkey, termDays);
      if (!result.ok) {
        if (result.error !== 'Cancelled') {
          toast.error(result.error);
        }
        return;
      }
      await refreshProStatus();
      toast.success('PRO subscription updated!');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Payment failed';
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
      hasLaunchedPaymentRef.current = false;
    }
  };

  const handleLegendSubscribe = async () => {
    if (!currentUser?.pubkey) {
      toast.error('Please log in to become a Legend');
      return;
    }
    if (hasLaunchedPaymentRef.current) return;
    hasLaunchedPaymentRef.current = true;

    try {
      setIsGeneratingInvoice(true);
      const result = await payLegendInvoice(currentUser.pubkey);
      if (!result.ok) {
        if (result.error !== 'Cancelled') {
          toast.error(result.error);
        }
        return;
      }
      await refreshProStatus();
      toast.success('Congratulations! You are now a Longform Legend!');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate invoice';
      toast.error(`Payment error: ${msg}`);
    } finally {
      setIsGeneratingInvoice(false);
      hasLaunchedPaymentRef.current = false;
    }
  };

  const benefits = [
    'PRO badge on your profile page',
    'Dashboard with stats and insights',
    'Publish/share articles to list(s)',
    'Early access to new features',
    'Priority customer support',
    'Bragging rights on Nostr',
  ];

  const legendBenefits = [
    'Everything from PRO',
    'LEGEND badge on your profile page with profile pic border',
    'Moar bragging rights on Nostr',
  ];

  const graceEndsLabel =
    meStatus?.graceEndsAt != null ? formatUnixDate(meStatus.graceEndsAt) : null;
  const proEndsLabel =
    meStatus?.proEndsAt != null
      ? formatUnixDate(meStatus.proEndsAt)
      : proStatus?.expiresAt
        ? formatExpirationDate(proStatus.expiresAt)
        : null;

  return (
    <main>
      <div className="support-container">
        <div className="support-content">
          <div className="support-header">
            <h1 className="support-title">Support</h1>
            <p className="support-subtitle">
              Help us build the future of decentralized longform content
            </p>
          </div>

          <div className="pro-card">
            {currentUser && (
              <>
                {isLoading && !proStatus ? (
                  <div className="pro-status-section">
                    <div className="pro-status-loading">
                      <div className="loading-spinner" />
                      <span>Checking status...</span>
                    </div>
                  </div>
                ) : isLegend ? (
                  <div className="pro-status-active pro-status-legend">
                    <div className="pro-status-header">
                      <StarIcon className="pro-badge" />
                      <h3>YOU&apos;RE A LEGEND!</h3>
                    </div>
                    <div className="pro-status-details">
                      <p className="legend-info">
                        You have permanent PRO access as a Longform Legend
                      </p>
                    </div>
                  </div>
                ) : proStatus?.isPro ? (
                  <div
                    className={`pro-status-active ${proStatus.isInBuffer ? 'pro-status-buffer' : ''}`}
                  >
                    <div className="pro-status-header">
                      <StarIcon className="pro-badge" />
                      <h3>
                        {proStatus.isInBuffer ? 'PRO — renewal grace' : 'PRO Active'}
                      </h3>
                    </div>
                    <div className="pro-status-details">
                      {proEndsLabel && !proStatus.isInBuffer && (
                        <p className="expiration-info">
                          {proStatus.expiresAt && isExpiringSoon(proStatus.expiresAt) ? (
                            <span className="expiring-soon">
                              <ExclamationTriangleIcon className="warning-icon" />
                              Expires: {proEndsLabel}
                            </span>
                          ) : (
                            <span>Expires: {proEndsLabel}</span>
                          )}
                        </p>
                      )}
                      {proStatus.isInBuffer && proEndsLabel && (
                        <p className="expiration-info">
                          <span className="expired-status">
                            <ExclamationTriangleIcon className="warning-icon" />
                            Subscription ended: {proEndsLabel}
                          </span>
                        </p>
                      )}
                      {proStatus.isInBuffer && graceEndsLabel && (
                        <p className="buffer-info">
                          Renew by {graceEndsLabel} to keep PRO access (21-day grace period)
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="pro-status-section">
                    <div className="pro-status-inactive">
                      <h3>Not a PRO subscriber</h3>
                      <p>Subscribe to unlock all PRO features</p>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="pro-header">
              <h2 className="pro-title">Longform PRO</h2>
              <div className="pro-price">
                <span className="price-amount">{proPriceSats.toLocaleString()}</span>
                <span className="price-currency">sats</span>
                <span className="price-period">/{isYearly ? 'year' : 'month'}</span>
              </div>
              <div className="subscription-toggle">
                <button
                  className={`toggle-button ${!isYearly ? 'active' : ''}`}
                  onClick={() => setIsYearly(false)}
                  type="button"
                >
                  Monthly
                </button>
                <button
                  className={`toggle-button ${isYearly ? 'active' : ''}`}
                  onClick={() => setIsYearly(true)}
                  type="button"
                >
                  Yearly
                  <span className={`savings-badge ${isYearly ? 'active' : ''}`}>17% off</span>
                </button>
              </div>
            </div>

            <div className="pro-benefits">
              <h3 className="benefits-title">What do you get with PRO?</h3>
              <ul className="benefits-list">
                {benefits.map((benefit, index) => (
                  <li key={index} className="benefit-item">
                    <CheckIcon className="check-icon" />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="subscription-form">
              {isLegend ? (
                <button disabled type="button" className="subscribe-button legend-button">
                  <span>Legend — No Subscription Needed</span>
                </button>
              ) : (
                <button
                  onClick={handleProSubscribe}
                  disabled={isSubmitting}
                  type="button"
                  className={`subscribe-button ${proStatus?.isPro ? 'renew-button' : ''}`}
                >
                  {isSubmitting ? (
                    <div className="loading-spinner" />
                  ) : (
                    <>
                      <span>{proStatus?.isPro ? 'Renew PRO' : 'Subscribe to PRO'}</span>
                      <ArrowTopRightOnSquareIcon className="button-icon" />
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="pro-note">
              <p>
                PRO is a Lightning payment. Your subscription is recorded on the platform roster
                and takes effect immediately after payment.
              </p>
            </div>
          </div>

          <div className="legend-card">
            <div className="legend-header">
              <h2 className="legend-title">Longform LEGEND</h2>
              <div className="legend-price">
                <span className="price-amount">{legendPriceSats.toLocaleString()}</span>
                <span className="price-currency">sats</span>
              </div>
            </div>

            <div className="legend-benefits">
              <h3 className="benefits-title">What do you get with LEGEND?</h3>
              <ul className="benefits-list">
                {legendBenefits.map((benefit, index) => (
                  <li key={index} className="benefit-item legend-benefit-item">
                    <CheckIcon className="check-icon legend-check-icon" />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="subscription-form legend-subscription-form">
              {isLegend ? (
                <button disabled type="button" className="subscribe-button legend-button">
                  <span>Already a Legend!</span>
                </button>
              ) : (
                <button
                  onClick={handleLegendSubscribe}
                  disabled={isSubmitting || isGeneratingInvoice}
                  type="button"
                  className="subscribe-button legend-subscribe-button"
                >
                  {isGeneratingInvoice ? (
                    <>
                      <div className="loading-spinner" />
                      <span>Opening payment...</span>
                    </>
                  ) : (
                    <>
                      <span>Become a Legend</span>
                      <ArrowTopRightOnSquareIcon className="button-icon" />
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="legend-note">
              <p>
                LEGEND is a one-time payment that grants permanent PRO access plus exclusive LEGEND
                benefits.
              </p>
            </div>
          </div>

          <div className="support-info">
            <h3>Why Support Longform?</h3>
            <div className="info-grid">
              <div className="info-item">
                <h4>Decentralized Future</h4>
                <p>
                  We&apos;re building the future of content creation on Nostr, free from centralized
                  control.
                </p>
              </div>
              <div className="info-item">
                <h4>Community Driven</h4>
                <p>
                  Your support directly funds development and helps us prioritize features that matter
                  to you.
                </p>
              </div>
              <div className="info-item">
                <h4>Sustainable Development</h4>
                <p>
                  PRO subscriptions ensure we can continue building and maintaining Longform for blocks
                  to come.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};

export default SupportPage;
