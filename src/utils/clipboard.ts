/**
 * Cross-platform clipboard utility with mobile fallbacks
 */

/**
 * Copy text to clipboard with fallback for mobile devices
 * @param text - The text to copy to clipboard
 * @returns Promise that resolves when text is copied
 */
export async function copyToClipboard(text: string): Promise<void> {
  // Try the modern clipboard API first
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      console.warn('Clipboard API failed, falling back to textarea method:', error);
    }
  }

  // Fallback for mobile devices and older browsers
  return fallbackCopyToClipboard(text);
}

/**
 * Fallback clipboard method using a temporary textarea element
 * This works on mobile devices where the clipboard API is not available
 */
function fallbackCopyToClipboard(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      // Create a temporary textarea element
      const textArea = document.createElement('textarea');
      textArea.value = text;
      
      // Make it invisible but keep it in the DOM
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      textArea.style.opacity = '0';
      textArea.style.pointerEvents = 'none';
      textArea.style.zIndex = '-1';
      
      // Add to DOM
      document.body.appendChild(textArea);
      
      // Select the text
      textArea.focus();
      textArea.select();
      
      // Try to copy using document.execCommand
      const successful = document.execCommand('copy');
      
      // Clean up
      document.body.removeChild(textArea);
      
      if (successful) {
        resolve();
      } else {
        reject(new Error('Failed to copy text using execCommand'));
      }
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Check if the clipboard API is available and working
 */
export function isClipboardAPIAvailable(): boolean {
  return !!(navigator.clipboard && window.isSecureContext);
}

/**
 * Check if we're on a mobile device
 */
export function isMobileDevice(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
} 