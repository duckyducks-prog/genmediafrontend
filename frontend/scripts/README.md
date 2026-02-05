# Scripts

## get-firebase-token.ts

Generate a Firebase ID token for testing.

### Usage

```bash
# Generate token and save to .env.test
pnpm tsx scripts/get-firebase-token.ts your-email@example.com your-password

# Run tests with the token
pnpm test
```

### What it does

1. Signs in to Firebase with your credentials
2. Gets an ID token from Firebase Auth
3. Saves the token to `.env.test`
4. Shows when the token expires (tokens are valid for 1 hour)

### Security Notes

- Don't commit `.env.test` to git (already in `.gitignore`)
- Tokens expire after 1 hour
- Use a test account, not your production credentials
- Re-run this script when tokens expire
