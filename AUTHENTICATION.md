# Authentication System

This document explains how authentication and page protection works in the Longform application.

## Overview

The application uses Nostr authentication and protects certain pages that require user login. When users try to access protected pages without being authenticated, they are automatically redirected to the home page where they can log in.

## Protected Pages

The following pages require authentication:

- **Settings** (`/settings`) - User preferences and relay configuration
- **Dashboard** (`/dashboard`) - Analytics and user statistics  
- **Reader** (`/reader`) - Reading feed from followed users
- **Editor** (`/editor/[id]`) - Content creation and editing

## How It Works

### AuthGuard Component

The `AuthGuard` component is used to protect pages that require authentication:

```tsx
import { AuthGuard } from '@/components/AuthGuard';

export default function ProtectedPage() {
  return (
    <AuthGuard>
      <div>Protected content here</div>
    </AuthGuard>
  );
}
```

### Authentication Flow

1. **User visits protected page** - When a user tries to access a protected page
2. **AuthGuard checks authentication** - The component checks if the user is authenticated
3. **Redirect to home** - If not authenticated, user is redirected to `/`
4. **Show login screen** - The home page displays the login prompt
5. **User logs in** - User clicks "Login with Nostr" button
6. **Access granted** - After successful login, user can access protected pages

### Connection Requirements

Some pages also require a connection to the Nostr network:

```tsx
<AuthGuard requireConnection={true}>
  <div>Content that needs Nostr connection</div>
</AuthGuard>
```

This ensures users are both authenticated and connected to the Nostr network.

## User Experience

### Visual Feedback

When users access protected pages, they see appropriate loading states with consistent styling that matches the app's dark theme.

### Loading States

The AuthGuard component shows appropriate loading states with consistent styling using centralized CSS classes:

- **Checking authentication** - While verifying login status (fullscreen loading with purple spinner)
- **Redirecting to login** - While redirecting to home page (fullscreen loading with purple spinner)
- **Connecting to Nostr network** - While establishing network connection (fullscreen loading with subtitle text)

All loading states use the centralized `.loading-fullscreen`, `.loading-spinner`, `.loading-text`, and `.loading-subtext` classes from `globals.css` for consistency across the application.

### Error Prevention

The AuthGuard component prevents error messages from showing when users are not authenticated:

- **Dashboard** - Prevents "Failed to load dashboard data" error
- **Settings** - Prevents loading errors for relay configuration
- **Editor** - Prevents draft loading errors
- **Reader** - Prevents "Loading your reads..." message from showing to unauthenticated users

## Public Pages

The following pages are public and don't require authentication:

- **Home** (`/`) - Landing page with login prompt
- **Profile** (`/profile/[identifier]`) - Public user profiles and posts

## Technical Implementation

### NostrContext

Authentication state is managed by the `NostrContext` which provides:

- `isAuthenticated` - Whether user is logged in
- `isConnected` - Whether connected to Nostr network
- `isLoading` - Whether authentication check is in progress
- `currentUser` - Current user profile information

### Redirect Logic

The redirect logic is implemented in the `AuthGuard` component:

```tsx
useEffect(() => {
  if (isLoading) return;
  
  if (requireAuth && !isAuthenticated) {
    toast.error('Please login to access this page');
    router.push('/');
  }
}, [isAuthenticated, isLoading, requireAuth, router]);
```

### Component Structure

Protected pages use a consistent structure to prevent error messages:

```tsx
export default function ProtectedPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState(null);

  return (
    <AuthGuard>
      {isLoading ? (
        <div className="loading-content">
          <div className="loading-spinner"></div>
          <p className="loading-text">Loading...</p>
        </div>
      ) : !data ? (
        <ErrorComponent />
      ) : (
        <MainContent data={data} />
      )}
    </AuthGuard>
  );
}
```

This ensures that error states are only shown to authenticated users.

### Centralized Loading Styles

All loading states throughout the application use centralized CSS classes from `globals.css`:

- **`.loading-fullscreen`** - Full-screen loading state (used by AuthGuard)
- **`.loading-content`** - Content-area loading state (used by pages)
- **`.loading-spinner`** - Consistent purple spinner animation
- **`.loading-text`** - Primary loading message styling
- **`.loading-subtext`** - Secondary/subtitle text styling

This ensures visual consistency across all loading states in the application.

## Security Notes

- All protected pages are wrapped with `AuthGuard`
- Authentication state is checked on every page load
- Users cannot access protected content without proper authentication
- Connection to Nostr network is verified for pages that require it
- Toast notifications provide clear feedback about authentication requirements
- Error messages are prevented from showing to unauthenticated users
- Loading states provide smooth user experience during authentication checks
