'use client';

import { useEffect, useRef } from 'react';
import { LightningAddress } from '@getalby/lightning-tools/lnurl';
import { launchPaymentModal } from '@getalby/bitcoin-connect';
import { supabase } from '@/config/supabase';

interface LightningPaymentProps {
  amount: number; // in sats
  description: string;
  onPaymentSuccess: () => void;
  onPaymentError: (error: string) => void;
  npub: string;
}

export default function LightningPayment({ 
  amount, 
  description, 
  onPaymentSuccess, 
  onPaymentError,
  npub 
}: LightningPaymentProps) {
  const hasLaunchedRef = useRef(false);

  // Automatically generate invoice when component mounts
  useEffect(() => {
    const generateInvoice = async () => {
      if (hasLaunchedRef.current) return; // Prevent duplicate launches
      hasLaunchedRef.current = true;
      
      try {
      
      // Create Lightning Address instance
      const ln = new LightningAddress("bullish@getalby.com");
      
      // Fetch the Lightning Address details
      await ln.fetch();
      
      // Request an invoice for the specified amount
      const invoice = await ln.requestInvoice({ 
        satoshi: amount,
        comment: description 
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
                npub: npub,
                created_at: new Date().toISOString()
              });

            if (error) {
              throw error;
            }

            onPaymentSuccess();
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to update legend status';
            onPaymentError(errorMessage);
          }
        },
        onCancelled: () => {
          clearInterval(checkPaymentInterval);
          onPaymentError('Payment cancelled');
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
      }, 600000);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate invoice';
      onPaymentError(errorMessage);
    }
    };

    generateInvoice();
  }, [amount, description, npub, onPaymentSuccess, onPaymentError]);




  // This component doesn't render anything - it immediately launches the payment modal
  return null;
}
