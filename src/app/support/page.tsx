'use client';

import { useState } from 'react';
import { CheckIcon, ArrowTopRightOnSquareIcon, StarIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { useNostr } from '@/contexts/NostrContext';
import { useSupabase } from '@/contexts/SupabaseContext';
import { formatExpirationDate, isExpiringSoon } from '@/utils/supabase';
import './page.css';

const SupportPage: React.FC = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { currentUser } = useNostr();
  const { proStatus, isLoading } = useSupabase();

  const handleSubscribe = () => {
    setIsSubmitting(true);

    // Get the user's npub or use 'Anon' as fallback
    const npub = currentUser?.npub || 'Anon';
    
    // Construct the payerdata JSON
    const payerdata = JSON.stringify({ npub });
    
    // Construct the subscription URL
    const subscriptionUrl = new URL('https://zapplanner.albylabs.com/confirm');
    subscriptionUrl.searchParams.set('amount', '1000');
    subscriptionUrl.searchParams.set('recipient', 'bullish@getalby.com');
    subscriptionUrl.searchParams.set('timeframe', '30d');
    subscriptionUrl.searchParams.set('comment', ' Longform PRO subscription');
    subscriptionUrl.searchParams.set('payerdata', payerdata);

    // Open in new tab/window
    window.open(subscriptionUrl.toString(), '_blank');

    // Reset loading state after a short delay
    setTimeout(() => {
      setIsSubmitting(false);
    }, 1000);
  };

  const benefits = [
    'PRO badge on your profile page',
    'Dashboard with stats and insights',
    'Publish/share articles to list(s)',
    'Early access to new features',
    'Priority customer support',
    'Bragging rights on Nostr',
  ];

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
            {/* PRO Status Display */}
            {currentUser && (
              <>
                {isLoading && !proStatus ? (
                  <div className="pro-status-section">
                    <div className="pro-status-loading">
                      <div className="loading-spinner" />
                      <span>Checking PRO status...</span>
                    </div>
                  </div>
                ) : proStatus?.isPro ? (
                  <div className={`pro-status-active ${proStatus.isInBuffer ? 'pro-status-buffer' : ''}`}>
                    <div className="pro-status-header">
                      <StarIcon className="pro-badge" />
                      <h3>{proStatus.isInBuffer ? 'PRO Expired' : 'PRO Active'}</h3>
                    </div>
                    <div className="pro-status-details">
                      {proStatus.lastPayment && (
                        <p className="payment-info">
                          Last payment: {formatExpirationDate(proStatus.lastPayment)}
                        </p>
                      )}
                      {proStatus.expiresAt && (
                        <p className="expiration-info">
                          {proStatus.isInBuffer ? (
                            <span className="expired-status">
                              <ExclamationTriangleIcon className="warning-icon" />
                              Expired on: {formatExpirationDate(proStatus.expiresAt)}
                            </span>
                          ) : isExpiringSoon(proStatus.expiresAt) ? (
                            <span className="expiring-soon">
                              <ExclamationTriangleIcon className="warning-icon" />
                              Expires: {formatExpirationDate(proStatus.expiresAt)}
                            </span>
                          ) : (
                            <span>Expires: {formatExpirationDate(proStatus.expiresAt)}</span>
                          )}
                        </p>
                      )}
                      {proStatus.isInBuffer && (
                        <p className="buffer-info">
                          You have 14 days to renew before losing PRO access
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
                <span className="price-amount">1000</span>
                <span className="price-currency">sats</span>
                <span className="price-period">/month</span>
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
              {proStatus?.isPro ? (
                <button
                  onClick={handleSubscribe}
                  disabled={isSubmitting}
                  className="subscribe-button renew-button"
                >
                  {isSubmitting ? (
                    <div className="loading-spinner" />
                  ) : (
                    <>
                      <span>Renew PRO Subscription</span>
                      <ArrowTopRightOnSquareIcon className="button-icon" />
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={handleSubscribe}
                  disabled={isSubmitting}
                  className="subscribe-button"
                >
                  {isSubmitting ? (
                    <div className="loading-spinner" />
                  ) : (
                    <>
                      <span>Subscribe to PRO</span>
                      <ArrowTopRightOnSquareIcon className="button-icon" />
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="pro-note">
              <p>
                NOTE: Clicking the button will bring you to ZapPlanner to set up a subscription. Please allow 21 hours for it to take effect. Subscribers are currently managed manually while an automated solution is in the works.
              </p>
            </div>
          </div>

          <div className="support-info">
            <h3>Why Support Longform?</h3>
            <div className="info-grid">
              <div className="info-item">
                <h4>Decentralized Future</h4>
                <p>We&apos;re building the future of content creation on Nostr, free from centralized control.</p>
              </div>
              <div className="info-item">
                <h4>Community Driven</h4>
                <p>Your support directly funds development and helps us prioritize features that matter to you.</p>
              </div>
              <div className="info-item">
                <h4>Sustainable Development</h4>
                <p>PRO subscriptions ensure we can continue building and maintaining Longform for blocks to come.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};

export default SupportPage;
