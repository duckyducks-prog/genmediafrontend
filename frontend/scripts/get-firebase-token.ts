#!/usr/bin/env tsx
/**
 * Generate Firebase ID Token for Testing
 * 
 * Usage:
 *   pnpm tsx scripts/get-firebase-token.ts <email> <password>
 * 
 * The token will be saved to .env.test automatically
 */

/// <reference types="node" />

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env.test (for test credentials)
dotenv.config({ path: '.env.test' });
// Also load from .env.local (for Firebase config)
dotenv.config({ path: '.env.local' });

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

async function getToken(email: string, password: string) {
  try {
    // Initialize Firebase
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);

    // Sign in
    console.log('🔐 Signing in to Firebase...');
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    
    // Get ID token
    const token = await userCredential.user.getIdToken();
    
    console.log('✅ Token generated successfully!');
    console.log('\nToken (copy this):');
    console.log('─'.repeat(80));
    console.log(token);
    console.log('─'.repeat(80));

    // Save to .env.test
    const envTestPath = join(process.cwd(), '.env.test');
    let envContent = '';
    
    try {
      envContent = readFileSync(envTestPath, 'utf-8');
    } catch {
      // File doesn't exist yet
    }

    // Update or add FIREBASE_TEST_TOKEN
    if (envContent.includes('FIREBASE_TEST_TOKEN=')) {
      envContent = envContent.replace(
        /FIREBASE_TEST_TOKEN=.*/,
        `FIREBASE_TEST_TOKEN=${token}`
      );
    } else {
      envContent += `\nFIREBASE_TEST_TOKEN=${token}\n`;
    }

    writeFileSync(envTestPath, envContent);
    console.log('\n✅ Token saved to .env.test');
    
    // Show expiry info
    const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    const expiryDate = new Date(decoded.exp * 1000);
    console.log(`\n⏰ Token expires at: ${expiryDate.toLocaleString()}`);
    console.log(`   (in ${Math.round((decoded.exp * 1000 - Date.now()) / 1000 / 60)} minutes)`);
    
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Parse command line arguments or use environment variables
const email = process.argv[2] || process.env.FIREBASE_TEST_EMAIL;
const password = process.argv[3] || process.env.FIREBASE_TEST_PASSWORD;

if (!email || !password) {
  console.error('❌ Missing credentials!');
  console.error('Either:');
  console.error('  1. Set FIREBASE_TEST_EMAIL and FIREBASE_TEST_PASSWORD in .env.test');
  console.error('  2. Or run: pnpm tsx scripts/get-firebase-token.ts <email> <password>');
  process.exit(1);
}

getToken(email, password);
