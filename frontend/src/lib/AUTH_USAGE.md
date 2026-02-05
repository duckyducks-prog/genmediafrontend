# Firebase Authentication Usage Guide

## Overview

The app now uses Firebase Authentication with Google Sign-in. Users must be authenticated to access the main application.

**Email Whitelisting**: After successful Google sign-in, the user's email is checked against a whitelist. If the email is not authorized, the user is immediately signed out and shown an error message.

## Key Files

### 1. `src/lib/firebase.ts`

Firebase configuration and auth utilities:

- `auth` - Firebase Auth instance
- `signInWithGoogle()` - Sign in with Google popup (includes email whitelisting)
- `logOut()` - Sign out current user
- `onAuthStateChanged()` - Listen to auth state changes
- `ALLOWED_EMAILS` - Array of authorized email addresses

**Email Whitelisting**: To add new authorized users, update the `ALLOWED_EMAILS` array in this file:

```typescript
const ALLOWED_EMAILS = [
  "ldebortolialves@hubspot.com",
  "newuser@example.com", // Add new emails here
];
```

### 2. `src/lib/AuthContext.tsx`

React Context that provides auth state throughout the app:

- `useAuth()` hook - Returns `{ user, loading }`
- `AuthProvider` - Wraps the app to provide auth state

### 3. `src/pages/Login.tsx`

Login page with Google sign-in button. Shown when user is not authenticated.

### 4. `src/hooks/use-user-id.ts`

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

### Get Authorization Token for API Calls

**IMPORTANT:** All API calls MUST include an `Authorization` header with the Firebase ID token.

```typescript
import { auth } from "@/lib/firebase";

function MyComponent() {
  const handleGenerate = async () => {
    const user = auth.currentUser;
    const token = await user?.getIdToken();

    const response = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        prompt: "A beautiful sunset",
        // No longer need user_id or user_email
      }),
    });

    // Handle 403 - User not whitelisted
    if (response.status === 403) {
      toast({
        title: "Access Denied",
        description: "Access denied. Contact administrator.",
        variant: "destructive",
      });
      return;
    }
  };
}
```

### Direct Access to Auth

```typescript
import { auth } from "@/lib/firebase";

// Get current user and token
const user = auth.currentUser;
const token = await user?.getIdToken();
```

## Email Whitelisting

### Frontend Whitelisting

The frontend checks the user's email immediately after Google sign-in:

1. User clicks "Sign in with Google"
2. Google authentication succeeds
3. Email is checked against `ALLOWED_EMAILS` in `src/lib/firebase.ts`
4. If email is NOT in the list:
   - User is immediately signed out
   - Error message is displayed: "Access denied. Your email is not authorized."
   - Both toast notification and inline error are shown

### Adding New Users

To authorize a new user:

1. Open `src/lib/firebase.ts`
2. Add their email (lowercase) to the `ALLOWED_EMAILS` array
3. Save the file - changes take effect immediately

```typescript
const ALLOWED_EMAILS = ["ldebortolialves@hubspot.com", "newuser@company.com"];
```

### Error Handling

The Login page displays errors in two ways:

1. **Toast notification** - Temporary notification at the top
2. **Inline error message** - Red text below the sign-in button

## Protected Routes

The main Index page (`src/pages/Index.tsx`) is automatically protected:

- Shows loading spinner while checking auth state
- Shows Login page if not authenticated
- Shows main app if authenticated

## Sign Out

The header includes a "Sign Out" button that:

1. Calls `logOut()` from firebase.ts
2. Shows a success toast
3. Automatically redirects to login page

## API Requirements

### All Generation Endpoints Require Authorization Header

These endpoints require `Authorization: Bearer <token>` header:

- `/generate/image` - Image generation
- `/generate/video` - Video generation
- `/generate/text` - Text generation (LLM)
- `/generate/upscale` - Image upscaling
- `/library` - Asset library (GET and DELETE)
- `/generate/video/status` - Video generation status polling

### How Authorization Works

1. The frontend obtains a Firebase ID token using `auth.currentUser?.getIdToken()`
2. The token is sent in the `Authorization` header as `Bearer <token>`
3. The backend verifies the token and extracts user information (uid, email)
4. The backend checks if the user's email is whitelisted
5. If the email is not whitelisted, the API returns HTTP 403 (Forbidden)

**Benefits:**

- More secure: tokens are cryptographically signed and time-limited
- No need to send user_id or user_email in request body
- Backend extracts user info from verified token

### Handling 403 Errors

Always check for 403 responses and show a clear error message:

```typescript
if (response.status === 403) {
  toast({
    title: "Access Denied",
    description: "Access denied. Contact administrator.",
    variant: "destructive",
  });
  return;
}
```

## Example: Complete Image Generation

```typescript
import { auth } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";

function GenerateImageComponent() {
  const { toast } = useToast();

  const generateImage = async (prompt: string) => {
    const user = auth.currentUser;
    const token = await user?.getIdToken();

    try {
      const response = await fetch(
        "https://veo-api-82187245577.us-central1.run.app/generate/image",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            prompt: prompt,
            aspect_ratio: "1:1",
          }),
        },
      );

      if (response.status === 403) {
        toast({
          title: "Access Denied",
          description: "Access denied. Contact administrator.",
          variant: "destructive",
        });
        return;
      }

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      // Handle success
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate image",
        variant: "destructive",
      });
    }
  };
}
```

## Security Notes

1. **API Keys**: Firebase config contains public API keys - this is safe and expected
2. **User ID**: The user ID (uid) is unique per user and should be sent with API requests
3. **User Email**: The email is used for whitelist validation on the backend
4. **Backend Validation**: Backend validates user email against whitelist
5. **CORS**: Firebase Auth handles CORS automatically for auth operations

## Creating User Accounts

Users must be created in the Firebase Console:

1. Go to [Firebase Console](https://console.firebase.google.com/) → Authentication
2. Click "Users" tab → "Add user"
3. Enter email and password
4. Users can then sign in with these credentials

## Testing

To test authentication:

1. Create a test user in Firebase Console (see above)
2. Run the app - you'll see the login page
3. Enter email and password, then click "Sign In"
4. After signing in, you'll see the main app
5. Click "Sign Out" in the header to return to login
6. Test 403 handling by signing in with an email that's not whitelisted on the backend
