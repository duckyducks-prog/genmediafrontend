# Firebase Authentication Usage Guide

## Overview
The app now uses Firebase Authentication with Google Sign-in. Users must be authenticated to access the main application.

## Key Files

### 1. `client/lib/firebase.ts`
Firebase configuration and auth utilities:
- `auth` - Firebase Auth instance
- `signInWithGoogle()` - Sign in with Google popup
- `logOut()` - Sign out current user
- `onAuthStateChanged()` - Listen to auth state changes

### 2. `client/lib/AuthContext.tsx`
React Context that provides auth state throughout the app:
- `useAuth()` hook - Returns `{ user, loading }`
- `AuthProvider` - Wraps the app to provide auth state

### 3. `client/pages/Login.tsx`
Login page with Google Sign-in button. Shown when user is not authenticated.

### 4. `client/hooks/use-user-id.ts`
Convenience hook to get the current user's ID for API calls.

## How to Use in Components

### Get Current User
```typescript
import { useAuth } from "@/lib/AuthContext";

function MyComponent() {
  const { user, loading } = useAuth();
  
  if (loading) return <div>Loading...</div>;
  if (!user) return <div>Not authenticated</div>;
  
  return <div>Hello {user.email}</div>;
}
```

### Get User ID for API Calls
```typescript
import { useUserId } from "@/hooks/use-user-id";

function MyComponent() {
  const userId = useUserId();
  
  const handleGenerate = async () => {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: userId,  // Include user ID in API calls
        prompt: "A beautiful sunset"
      })
    });
  };
}
```

### Direct Access to Auth
```typescript
import { auth } from "@/lib/firebase";

// Get current user synchronously
const user = auth.currentUser;
const userId = user?.uid;
```

## Protected Routes
The main Index page (`client/pages/Index.tsx`) is automatically protected:
- Shows loading spinner while checking auth state
- Shows Login page if not authenticated
- Shows main app if authenticated

## Sign Out
The header includes a "Sign Out" button that:
1. Calls `logOut()` from firebase.ts
2. Shows a success toast
3. Automatically redirects to login page

## Adding User ID to API Calls

When making API calls that need to be associated with a user:

```typescript
import { useUserId } from "@/hooks/use-user-id";

function GenerateImageNode() {
  const userId = useUserId();
  
  const generateImage = async () => {
    const response = await fetch('https://veo-api-82187245577.us-central1.run.app/generate/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: "...",
        user_id: userId  // Add user ID to tag assets
      })
    });
  };
}
```

## Security Notes

1. **API Keys**: Firebase config contains public API keys - this is safe and expected
2. **User ID**: The user ID (uid) is unique per user and should be sent with API requests
3. **Backend Validation**: Backend should validate the user ID against Firebase tokens if needed
4. **CORS**: Firebase Auth handles CORS automatically for auth operations

## Testing

To test authentication:
1. Run the app
2. You'll see the login page
3. Click "Sign in with Google"
4. After signing in, you'll see the main app
5. Click "Sign Out" in the header to return to login
