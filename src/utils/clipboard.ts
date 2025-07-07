/**
 * Cross-platform clipboard utility with mobile fallbacks
 */

/**
 * Copy text to clipboard with fallback for mobile devices
 * @param text - The text to copy to clipboard
 * @returns Promise that resolves when text is copied
 */
export async function copyToClipboard(text: string): Promise<void> {
  // Check if we're on mobile first
  const isMobile = isMobileDevice();
  
  // On mobile, skip the clipboard API and go straight to fallback
  if (isMobile) {
    return mobileCopyToClipboard(text);
  }

  // Try the modern clipboard API first for desktop
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fallback to textarea method
    }
  }

  // Fallback for older browsers
  return fallbackCopyToClipboard(text);
}

/**
 * Mobile-specific clipboard method
 * Handles iOS Safari and other mobile browser quirks
 */
function mobileCopyToClipboard(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      // Create a temporary textarea element
      const textArea = document.createElement('textarea');
      textArea.value = text;
      
      // For mobile, we need to make it visible but off-screen
      // iOS Safari requires the element to be in the viewport
      textArea.style.position = 'fixed';
      textArea.style.left = '0';
      textArea.style.top = '0';
      textArea.style.width = '2em';
      textArea.style.height = '2em';
      textArea.style.opacity = '0';
      textArea.style.fontSize = '16px'; // Prevent zoom on iOS
      textArea.style.border = 'none';
      textArea.style.outline = 'none';
      textArea.style.padding = '0';
      textArea.style.margin = '0';
      textArea.style.background = 'transparent';
      textArea.style.color = 'transparent';
      textArea.style.caretColor = 'transparent';
      textArea.style.userSelect = 'text';
      (textArea.style as CSSStyleDeclaration & { webkitUserSelect?: string }).webkitUserSelect = 'text';
      (textArea.style as CSSStyleDeclaration & { mozUserSelect?: string }).mozUserSelect = 'text';
      (textArea.style as CSSStyleDeclaration & { msUserSelect?: string }).msUserSelect = 'text';
      textArea.style.zIndex = '-1';
      
      // Add to DOM
      document.body.appendChild(textArea);
      
      // For mobile, we need to handle the selection differently
      if (isIOS()) {
        // iOS Safari specific handling
        textArea.focus();
        textArea.setSelectionRange(0, textArea.value.length);
      } else {
        // Android and other mobile browsers
        textArea.focus();
        textArea.select();
      }
      
      // Try to copy using document.execCommand
      document.execCommand('copy');
      
      // Clean up after a short delay to ensure the copy operation completes
      setTimeout(() => {
        try {
          document.body.removeChild(textArea);
        } catch {
          // Element might already be removed
        }
      }, 100);
      
      // For mobile, we'll assume it worked if no error was thrown
      // Many mobile browsers don't return accurate success status
      setTimeout(() => {
        resolve();
      }, 50);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Fallback clipboard method using a temporary textarea element
 * This works on desktop browsers where the clipboard API is not available
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

/**
 * Check if we're on iOS specifically
 */
function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
} 