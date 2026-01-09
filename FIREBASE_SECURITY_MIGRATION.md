# Firebase API Key Security Migration

## ✅ Completed Steps

### 1. Updated `client/lib/firebase.ts`

- Removed hardcoded Firebase configuration values
- Updated to use Vite environment variables (`import.meta.env.VITE_*`)
- All sensitive credentials now loaded from environment variables

### 2. Created `.env.local` for Local Development

- Contains the **new** rotated Firebase API key
- File is automatically gitignored (`.gitignore` already has `*.local` pattern)
- **CRITICAL**: This file is already created and contains the new API key

### 3. Created `.env.example` Template

- Provides a template for other developers
- Shows required environment variables without exposing secrets
- Safe to commit to git

### 4. Added TypeScript Types (`client/vite-env.d.ts`)

- Added type definitions for all Firebase environment variables
- Provides autocomplete and type safety in the IDE

### 5. Verified `.gitignore`

- ✅ Already contains `*.local` pattern
- ✅ Already contains `.env` pattern
- No changes needed - secrets are protected

## 🚀 Next Steps: Fly.io Deployment

**IMPORTANT**: This is a **Vite** project, not Next.js. Environment variables use the `VITE_` prefix.

### Option A: Set Secrets via Fly.io CLI

Run these commands to set environment variables in your Fly.io deployment:

```bash
fly secrets set VITE_FIREBASE_API_KEY="<your-firebase-api-key>"
fly secrets set VITE_FIREBASE_AUTH_DOMAIN="genmediastudio.firebaseapp.com"
fly secrets set VITE_FIREBASE_PROJECT_ID="genmediastudio"
fly secrets set VITE_FIREBASE_STORAGE_BUCKET="genmediastudio.firebasestorage.app"
fly secrets set VITE_FIREBASE_MESSAGING_SENDER_ID="856765593724"
fly secrets set VITE_FIREBASE_APP_ID="1:856765593724:web:2d56922818e4dd876ff1f9"
fly secrets set VITE_FIREBASE_MEASUREMENT_ID="G-M4801D5V62"
```

**Note**: Replace `<your-firebase-api-key>` with your actual Firebase API key from the Firebase Console.

After setting secrets, deploy:

```bash
fly deploy
```

### Option B: Use Fly.io Environment Variables UI

1. Go to your Fly.io dashboard
2. Navigate to your app settings
3. Add the following environment variables:
   - `VITE_FIREBASE_API_KEY`: `<your-firebase-api-key>`
   - `VITE_FIREBASE_AUTH_DOMAIN`: `genmediastudio.firebaseapp.com`
   - `VITE_FIREBASE_PROJECT_ID`: `genmediastudio`
   - `VITE_FIREBASE_STORAGE_BUCKET`: `genmediastudio.firebasestorage.app`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`: `856765593724`
   - `VITE_FIREBASE_APP_ID`: `1:856765593724:web:2d56922818e4dd876ff1f9`
   - `VITE_FIREBASE_MEASUREMENT_ID`: `G-M4801D5V62`

## 📋 Environment Variables Reference

| Variable                            | Description               | Example/Notes                      |
| ----------------------------------- | ------------------------- | ---------------------------------- |
| `VITE_FIREBASE_API_KEY`             | Firebase API Key (SECRET) | Get from Firebase Console          |
| `VITE_FIREBASE_AUTH_DOMAIN`         | Firebase Auth Domain      | genmediastudio.firebaseapp.com     |
| `VITE_FIREBASE_PROJECT_ID`          | Firebase Project ID       | genmediastudio                     |
| `VITE_FIREBASE_STORAGE_BUCKET`      | Firebase Storage Bucket   | genmediastudio.firebasestorage.app |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | FCM Sender ID             | 856765593724                       |
| `VITE_FIREBASE_APP_ID`              | Firebase App ID           | 1:856765593724:web:...             |
| `VITE_FIREBASE_MEASUREMENT_ID`      | Analytics Measurement ID  | G-M4801D5V62                       |

## 🔒 Security Notes

1. **API Key Rotation**: The old exposed API key has been rotated to a new secure key
2. **Storage**: The new API key is ONLY stored in `.env.local` (gitignored) and Fly.io secrets
3. **Git Protection**: `.env.local` is gitignored and will never be committed
4. **Production Deployment**: Must set environment variables in Fly.io before deploying
5. **⚠️ NEVER commit API keys to git or include them in documentation files**

## ✅ Verification Checklist

- [x] Firebase config updated to use environment variables
- [x] `.env.local` created with new API key
- [x] `.env.example` template created
- [x] TypeScript types added
- [x] `.gitignore` verified (already contains `*.local`)
- [x] Dev server restarted and running
- [ ] **TODO**: Set Fly.io environment variables
- [ ] **TODO**: Deploy to Fly.io
- [ ] **TODO**: Verify production deployment works

## 🔍 How to Verify

### Local Development

1. The dev server should already be running with the new configuration
2. Try signing in with Google - it should work with the new API key
3. Check browser console for any Firebase errors

### Production (After Fly.io Deployment)

1. Deploy the app to Fly.io after setting environment variables
2. Test Google sign-in on the production URL
3. Verify no console errors related to Firebase

## 📚 Additional Notes

- This is a **Vite** project, so we use `VITE_` prefix (not `NEXT_PUBLIC_`)
- Environment variables are embedded at **build time** in Vite
- If you change environment variables in Fly.io, you must redeploy the app
- The `measurementId` is for Google Analytics (optional)

## 🆘 Troubleshooting

If you encounter issues:

1. **Local Development**: Ensure `.env.local` exists and contains all variables
2. **Build Errors**: Run `pnpm typecheck` to verify TypeScript types
3. **Production Issues**: Verify all Fly.io environment variables are set correctly
4. **Firebase Errors**: Check Firebase console for API key restrictions

## 🔄 For Team Members

If you're setting up this project for the first time:

1. Copy `.env.example` to `.env.local`
2. Ask an admin for the Firebase API key
3. Update `VITE_FIREBASE_API_KEY` in your `.env.local`
4. Run `pnpm dev` to start development

## 🔐 Getting Your Firebase API Key

To get your Firebase API key from the Firebase Console:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (`genmediastudio`)
3. Click the gear icon → Project settings
4. Scroll to "Your apps" section
5. Find your web app
6. Copy the `apiKey` value
7. Paste it into your `.env.local` file

---

**Migration completed**: All Firebase credentials are now secured via environment variables! 🎉

**REMEMBER**: Never commit `.env.local` or include API keys in documentation files.
