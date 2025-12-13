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
Login page with Google sign-in button. Shown when user is not authenticated.

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

### Get User ID and Email for API Calls

**IMPORTANT:** All API calls MUST include both `user_id` and `user_email`.

```typescript
import { auth } from "@/lib/firebase";

function MyComponent() {
  const handleGenerate = async () => {
    const user = auth.currentUser;
    
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: "A beautiful sunset",
        user_id: user?.uid,      // User ID
        user_email: user?.email   // User Email (required for whitelist)
      })
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

// Get current user synchronously
const user = auth.currentUser;
const userId = user?.uid;
const userEmail = user?.email;
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

## API Requirements

### All Generation Endpoints Require User Info

These endpoints require `user_id` and `user_email` in the request body:
- `/generate/image` - Image generation
- `/generate/video` - Video generation
- `/generate/text` - Text generation (LLM)
- `/upscale/image` - Image upscaling

### Why user_email is Required

The backend uses `user_email` to check if the user is whitelisted. If the email is not in the whitelist, the API returns HTTP 403 (Forbidden).

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
    
    try {
      const response = await fetch('https://veo-api-82187245577.us-central1.run.app/generate/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt,
          user_id: user?.uid,
          user_email: user?.email,
          aspect_ratio: "1:1"
        })
      });
      
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
