import { supabase, ProStatus, Subscriber } from '@/config/supabase';

/**
 * Check if a user has PRO status based on their npub
 */
export async function checkProStatus(npub: string): Promise<ProStatus> {
  try {
    const { data, error } = await supabase
      .from('subscribers')
      .select('*')
      .eq('npub', npub)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned - user is not a subscriber
        return { isPro: false };
      }
      throw error;
    }

    if (!data) {
      return { isPro: false };
    }

    const subscriber: Subscriber = data;
    const lastPayment = new Date(subscriber.last_payment);
    const now = new Date();
    
    // Check if the last payment was within the last 30 days
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    const isPro = lastPayment > thirtyDaysAgo;
    
    // Calculate expiration date (30 days from last payment)
    const expiresAt = new Date(lastPayment.getTime() + (30 * 24 * 60 * 60 * 1000));

    return {
      isPro,
      lastPayment: subscriber.last_payment,
      expiresAt: expiresAt.toISOString()
    };
  } catch (error) {
    console.error('Error checking PRO status:', error);
    return { isPro: false };
  }
}

/**
 * Update a user's last payment date (for admin use)
 */
export async function updateLastPayment(npub: string, paymentDate: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('subscribers')
      .upsert({
        npub,
        last_payment: paymentDate,
        updated_at: new Date().toISOString()
      });

    if (error) {
      console.error('Error updating last payment:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error updating last payment:', error);
    return false;
  }
}

/**
 * Get all subscribers (for admin use)
 */
export async function getAllSubscribers(): Promise<Subscriber[]> {
  try {
    const { data, error } = await supabase
      .from('subscribers')
      .select('*')
      .order('last_payment', { ascending: false });

    if (error) {
      console.error('Error fetching subscribers:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching subscribers:', error);
    return [];
  }
}

/**
 * Format the expiration date for display
 */
export function formatExpirationDate(expiresAt: string): string {
  const date = new Date(expiresAt);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Check if a subscription is expiring soon (within 7 days)
 */
export function isExpiringSoon(expiresAt: string): boolean {
  const expirationDate = new Date(expiresAt);
  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000));
  
  return expirationDate <= sevenDaysFromNow;
}
