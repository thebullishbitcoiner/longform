'use client';

import { useState, useEffect, useRef } from 'react';
import { CheckIcon, ArrowTopRightOnSquareIcon, StarIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { useNostr } from '@/contexts/NostrContext';
import { useSupabase } from '@/contexts/SupabaseContext';
import { formatExpirationDate, isExpiringSoon } from '@/utils/supabase';
import { supabase } from '@/config/supabase';
import toast from 'react-hot-toast';
import './page.css';

const SupportPage: React.FC = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLegend, setIsLegend] = useState(false);
  const [isCheckingLegend, setIsCheckingLegend] = useState(false);
  const [isYearly, setIsYearly] = useState(false);
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false);
  const hasLaunchedPaymentRef = useRef(false);
  const { currentUser } = useNostr();
  const { proStatus, isLoading, checkLegendStatus } = useSupabase();

  // Check legend status when user changes
  useEffect(() => {
    if (currentUser?.npub) {
      setIsCheckingLegend(true);
      checkLegendStatus(currentUser.npub)
        .then(setIsLegend)
        .catch(error => {
          console.error('Error checking legend status:', error);
          setIsLegend(false);
        })
        .finally(() => {
          setIsCheckingLegend(false);
        });
    } else {
      setIsLegend(false);
      setIsCheckingLegend(false);
    }
  }, [currentUser?.npub, checkLegendStatus]);

  const handleSubscribe = () => {
    setIsSubmitting(true);

    // Get the user's npub or use 'Anon' as fallback
    const npub = currentUser?.npub || 'Anon';
    
    // Construct the payerdata JSON
    const payerdata = JSON.stringify({ npub });
    
    // Construct the subscription URL
    const subscriptionUrl = new URL('https://zapplanner.albylabs.com/confirm');
    subscriptionUrl.searchParams.set('amount', isYearly ? '10000' : '1000');
    subscriptionUrl.searchParams.set('recipient', 'bullish@getalby.com');
    subscriptionUrl.searchParams.set('timeframe', isYearly ? '365d' : '30d');
    subscriptionUrl.searchParams.set('comment', ` Longform PRO ${isYearly ? 'yearly' : 'monthly'} subscription`);
    subscriptionUrl.searchParams.set('payerdata', payerdata);

    // Open in new tab/window
    window.open(subscriptionUrl.toString(), '_blank');

    // Reset loading state after a short delay
    setTimeout(() => {
      setIsSubmitting(false);
    }, 1000);
  };

  const handleLegendSubscribe = async () => {
    if (!currentUser?.npub) {
      toast.error('Please log in to become a Legend');
      return;
    }

    if (hasLaunchedPaymentRef.current) return; // Prevent duplicate launches
    hasLaunchedPaymentRef.current = true;

    try {
      setIsGeneratingInvoice(true);
      
      // Dynamically import Lightning libraries to avoid SSR issues
      const { LightningAddress } = await import('@getalby/lightning-tools/lnurl');
      const { launchPaymentModal } = await import('@getalby/bitcoin-connect');
      
      // Create Lightning Address instance
      const ln = new LightningAddress("bullish@getalby.com");
      
      // Fetch the Lightning Address details
      await ln.fetch();
      
      // Request an invoice for the specified amount
      const invoice = await ln.requestInvoice({ 
        satoshi: 100000,
        comment: "Longform PRO" 
      });

      // Launch the payment modal
      const { setPaid } = launchPaymentModal({
        invoice: invoice.paymentRequest,
        onPaid: async () => {
          clearInterval(checkPaymentInterval);
          
          try {
            // Insert user into legends table
            const { error } = await supabase
              .from('legends')
              .insert({
                npub: currentUser.npub,
                created_at: new Date().toISOString()
              });

            if (error) {
              throw error;
            }

            // Update legend status
            setIsLegend(true);
            setIsGeneratingInvoice(false);
            hasLaunchedPaymentRef.current = false;
            
            // Show success message
            toast.success('Congratulations! You are now a Longform Legend!');
          } catch (err) {
            console.error('Error updating legend status:', err);
            toast.error('Payment successful but there was an error updating your status. Please contact support.');
            setIsGeneratingInvoice(false);
            hasLaunchedPaymentRef.current = false;
          }
        },
        onCancelled: () => {
          clearInterval(checkPaymentInterval);
          toast.error('Payment cancelled');
          setIsGeneratingInvoice(false);
          hasLaunchedPaymentRef.current = false;
        },
      });

      // Start polling for payment verification
      const checkPaymentInterval = setInterval(async () => {
        try {
          const paid = await invoice.verifyPayment();
          
          if (paid && invoice.preimage) {
            setPaid({
              preimage: invoice.preimage,
            });
          }
        } catch (err) {
          console.error('Payment verification error:', err);
        }
      }, 1000);

      // Stop polling after 10 minutes
      setTimeout(() => {
        clearInterval(checkPaymentInterval);
        setIsGeneratingInvoice(false);
        hasLaunchedPaymentRef.current = false;
      }, 600000);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate invoice';
      toast.error(`Payment error: ${errorMessage}`);
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
                {(isLoading || isCheckingLegend) && !proStatus ? (
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
                <span className="price-amount">{isYearly ? '10,000' : '1,000'}</span>
                <span className="price-currency">sats</span>
                <span className="price-period">/{isYearly ? 'year' : 'month'}</span>
              </div>
              <div className="subscription-toggle">
                <button
                  className={`toggle-button ${!isYearly ? 'active' : ''}`}
                  onClick={() => setIsYearly(false)}
                >
                  Monthly
                </button>
                <button
                  className={`toggle-button ${isYearly ? 'active' : ''}`}
                  onClick={() => setIsYearly(true)}
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
                <button
                  disabled={true}
                  className="subscribe-button legend-button"
                >
                  <span>Legend - No Subscription Needed</span>
                </button>
              ) : proStatus?.isPro ? (
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

          {/* LEGEND Card */}
          <div className="legend-card">
            <div className="legend-header">
              <h2 className="legend-title">Longform LEGEND</h2>
              <div className="legend-price">
                <span className="price-amount">100,000</span>
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
                <button
                  disabled={true}
                  className="subscribe-button legend-button"
                >
                  <span>Already a Legend!</span>
                </button>
              ) : (
                <button
                  onClick={handleLegendSubscribe}
                  disabled={isSubmitting || isGeneratingInvoice}
                  className="subscribe-button legend-subscribe-button"
                >
                  {isSubmitting ? (
                    <div className="loading-spinner" />
                  ) : isGeneratingInvoice ? (
                    <>
                      <div className="loading-spinner" />
                      <span>Generating invoice...</span>
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
                NOTE: LEGEND is a one-time payment that grants permanent PRO access plus exclusive LEGEND benefits.
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
