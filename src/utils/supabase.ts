import { supabase, ProStatus, Pro, CustomEmoji, LongformProfile } from '@/config/supabase';

/**
 * Check if a user has PRO status based on their npub
 */
export async function checkProStatus(npub: string): Promise<ProStatus> {
  try {
    const { data, error } = await supabase
      .from('pros')
      .select('*')
      .eq('npub', npub)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned - user is not a pro
        return { isPro: false };
      }
      throw error;
    }

    if (!data) {
      return { isPro: false };
    }

    const pro: Pro = data;
    const lastPayment = new Date(pro.last_payment);
    const now = new Date();
    
    // Check if the last payment was within the last 30 days
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    const isPro = lastPayment > thirtyDaysAgo;
    
    // Calculate expiration date (30 days from last payment)
    const expiresAt = new Date(lastPayment.getTime() + (30 * 24 * 60 * 60 * 1000));

    return {
      isPro,
      lastPayment: pro.last_payment,
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
      .from('pros')
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
 * Get all pros (for admin use)
 */
export async function getAllSubscribers(): Promise<Pro[]> {
  try {
    const { data, error } = await supabase
      .from('pros')
      .select('*')
      .order('last_payment', { ascending: false });

    if (error) {
      console.error('Error fetching pros:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching pros:', error);
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

/**
 * Check if a user is in the buffer period (14 days after expiration)
 */
export function isInBufferPeriod(expiresAt: string): boolean {
  const expirationDate = new Date(expiresAt);
  const now = new Date();
  const bufferEndDate = new Date(expirationDate.getTime() + (14 * 24 * 60 * 60 * 1000));
  
  return now > expirationDate && now <= bufferEndDate;
}

/**
 * Check if a subscription is fully expired (beyond buffer period)
 */
export function isFullyExpired(expiresAt: string): boolean {
  const expirationDate = new Date(expiresAt);
  const now = new Date();
  const bufferEndDate = new Date(expirationDate.getTime() + (14 * 24 * 60 * 60 * 1000));
  
  return now > bufferEndDate;
}

/**
 * Custom Emoji Functions
 */

/**
 * Get all custom emojis for a user
 */
export async function getCustomEmojis(npub: string): Promise<CustomEmoji[]> {
  try {
    const { data, error } = await supabase
      .from('custom_emojis')
      .select('*')
      .eq('npub', npub)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching custom emojis:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error in getCustomEmojis:', error);
    return [];
  }
}

/**
 * Add a new custom emoji
 */
export async function addCustomEmoji(npub: string, name: string, url: string): Promise<CustomEmoji | null> {
  try {
    const { data, error } = await supabase
      .from('custom_emojis')
      .insert({
        npub,
        name,
        url
      })
      .select()
      .single();

    if (error) {
      console.error('Error adding custom emoji:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error in addCustomEmoji:', error);
    return null;
  }
}

/**
 * Remove a custom emoji
 */
export async function removeCustomEmoji(npub: string, name: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('custom_emojis')
      .delete()
      .eq('npub', npub)
      .eq('name', name);

    if (error) {
      console.error('Error removing custom emoji:', error);
      throw error;
    }

    return true;
  } catch (error) {
    console.error('Error in removeCustomEmoji:', error);
    return false;
  }
}

/**
 * Update a custom emoji
 */
export async function updateCustomEmoji(npub: string, oldName: string, newName: string, url: string): Promise<CustomEmoji | null> {
  try {
    const { data, error } = await supabase
      .from('custom_emojis')
      .update({ name: newName, url })
      .eq('npub', npub)
      .eq('name', oldName)
      .select()
      .single();

    if (error) {
      console.error('Error updating custom emoji:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error in updateCustomEmoji:', error);
    return null;
  }
}

/**
 * Profile Customization Functions
 */

/**
 * Get profile customizations for a user
 */
export async function getLongformProfile(npub: string): Promise<LongformProfile | null> {
  try {
    const { data, error } = await supabase
      .from('longform_profiles')
      .select('*')
      .eq('npub', npub)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned - user has no profile customizations
        return null;
      }
      console.error('Error fetching longform profile:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in getLongformProfile:', error);
    return null;
  }
}
