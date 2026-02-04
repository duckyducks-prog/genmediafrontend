# 🚀 Development Guide for Non-Technical Users

This guide explains how to work with your app now that it has separate **development** and **production** environments.

---

## 📖 Table of Contents
1. [What Changed?](#what-changed)
2. [Understanding Dev vs Prod](#understanding-dev-vs-prod)
3. [Working on Your Computer (Local Development)](#working-on-your-computer-local-development)
4. [Testing on the Development Server](#testing-on-the-development-server)
5. [Deploying to Production](#deploying-to-production)
6. [Quick Reference](#quick-reference)

---

## What Changed?

### Before
- You had **one version** of your app running online
- Any changes you made and deployed would immediately affect everyone using the app
- If something broke, everyone would see the broken version

### After (Now)
- You have **three versions** of your app:
  1. **Local** (on your computer) - for trying things out
  2. **Development** (online, separate test server) - for testing with others
  3. **Production** (online, main server) - the real app that users see

**Think of it like this:**
- **Local** = Your personal draft
- **Development** = Shared rough draft for the team to review
- **Production** = The final published version

---

## Understanding Dev vs Prod

### 🏠 Local (Your Computer)
- **What it is**: The app running on your computer
- **Who can see it**: Only you
- **When to use it**: Trying new features, fixing bugs, experimenting
- **URL**: http://localhost:8080
- **Data**: Uses test data (won't affect real data)

### 🧪 Development (Dev Server - Online)
- **What it is**: A test version of the app running online
- **Who can see it**: Your team and testers
- **When to use it**: Testing features before they go live, showing others your work
- **URL**: https://genmedia-frontend-dev-856765593724.us-central1.run.app
- **Data**: Uses test data separate from production (won't affect real users' data)

### 🌟 Production (Prod Server - Online)
- **What it is**: The real app that actual users see
- **Who can see it**: Everyone - your users, customers, the public
- **When to use it**: Only deploy here when you're sure everything works
- **URL**: https://genmedia-frontend-856765593724.us-central1.run.app
- **Data**: Uses real user data

---

## Working on Your Computer (Local Development)

### Starting Your Local Version

**What you're doing**: Running the app on your computer so you can test changes

**Steps**:

1. **Open your terminal** (the command line window)

2. **Go to your project folder**:
   ```bash
   cd /Users/ldebortolialves/CODING_PROJECTS/veo-app/genmediafrontend
   ```

3. **Start the app**:
   ```bash
   pnpm dev
   ```

   **What happens**:
   - Your computer starts running the app
   - You'll see messages in the terminal
   - When it says "Local: http://localhost:8080" - it's ready!

4. **Open your browser** and go to:
   ```
   http://localhost:8080
   ```

5. **Make changes to your code**:
   - The app will automatically refresh in your browser when you save changes
   - You can test features, click buttons, try things out
   - **Nothing you do here affects the online versions**

6. **When you're done**, press `Ctrl + C` in the terminal to stop the local app

### What's Special About Local?
- ✅ No login required (easier for testing)
- ✅ Changes appear instantly when you save files
- ✅ Can break things without worrying
- ✅ Uses test data (stored in `dev_workflows` and `dev_assets` collections)

---

## Testing on the Development Server

### Why Use the Dev Server?

Sometimes you want to:
- Test how the app works on the real internet (not just your computer)
- Share your changes with teammates so they can try it
- Make sure everything works before showing it to real users

### How to Deploy to Dev

**What you're doing**: Uploading your code to a test server online

**Steps**:

1. **Make sure you're in the project folder**:
   ```bash
   cd /Users/ldebortolialves/CODING_PROJECTS/veo-app/genmediafrontend
   ```

2. **Run the dev deployment script**:
   ```bash
   ./deploy-dev.sh
   ```

   **What happens**:
   - Your code is packaged up
   - It's sent to Google Cloud
   - Google builds it and puts it on the dev server
   - This takes about 5-10 minutes

3. **Wait for it to finish**:
   - You'll see lots of text scrolling in the terminal
   - When it says "✅ Development deployment complete!" - it's done!
   - You'll see a link like: `https://genmedia-frontend-dev-...`

4. **Test it**:
   - Click the link or copy it into your browser
   - Try out your features
   - If something's broken, fix it and deploy to dev again

### What's Special About Dev Server?
- ✅ Online, so others can access it too
- ✅ Uses test data (separate from production users)
- ✅ You can deploy as many times as you want
- ✅ If something breaks, only testers see it (not real users)

---

## Deploying to Production

### ⚠️ Important: Only Do This When Ready!

Production is the **real app** that actual users see. Only deploy here when:
- ✅ You tested everything locally and it works
- ✅ You tested on the dev server and it works
- ✅ You're confident nothing will break
- ✅ Someone else reviewed your changes (if applicable)

### How to Deploy to Production

**Steps**:

1. **Make sure you're in the project folder**:
   ```bash
   cd /Users/ldebortolialves/CODING_PROJECTS/veo-app/genmediafrontend
   ```

2. **Run the production deployment script**:
   ```bash
   ./deploy.sh
   ```

3. **You'll see a warning**:
   ```
   ⚠️  WARNING: This will deploy to PRODUCTION ⚠️

   Are you sure you want to deploy to production? (yes/no):
   ```

   **Type exactly**: `yes` (and press Enter)

   - If you type anything else, it will cancel
   - This safety check helps prevent accidental deployments

4. **Wait for it to finish** (5-10 minutes)
   - When you see "✅ Production deployment complete!" - it's live!
   - Your changes are now visible to all users

5. **Test the production site**:
   - Go to: https://genmedia-frontend-856765593724.us-central1.run.app
   - Make sure everything works
   - Keep an eye on it for a few minutes to catch any issues

### What If Something Goes Wrong?

If you deploy and realize there's a problem:

1. **Don't panic** - you can roll back to the previous version
2. **Ask for help** from someone technical on your team
3. They can run a command to revert to the last working version

---

## Quick Reference

### Common Commands

| What You Want to Do | Command |
|---------------------|---------|
| **Work on your computer** | `pnpm dev` |
| **Stop the local app** | Press `Ctrl + C` |
| **Deploy to dev server** | `./deploy-dev.sh` |
| **Deploy to production** | `./deploy.sh` |
| **Test prod build locally** | `./scripts/test-prod-build-preview.sh` |

### URLs to Remember

| Environment | URL |
|-------------|-----|
| **Your computer** | http://localhost:8080 |
| **Dev server** | https://genmedia-frontend-dev-856765593724.us-central1.run.app |
| **Production** | https://genmedia-frontend-856765593724.us-central1.run.app |

### The Safe Workflow

```
1. Work on your computer (Local)
   └─> Test it: http://localhost:8080

2. Deploy to dev server
   └─> Run: ./deploy-dev.sh
   └─> Test it: https://genmedia-frontend-dev-...

3. Deploy to production (only when ready!)
   └─> Run: ./deploy.sh
   └─> Type: yes
   └─> Test it: https://genmedia-frontend-...
```

---

## Understanding Data Separation

### What's a Database Collection?

Think of it like file folders where the app stores information:
- **Workflows**: Your saved projects
- **Assets**: Images and videos you've created

### How Data is Separated Now

**Before**: Everything was in one folder
- If you tested something, it mixed with real user data
- Deleting test data might delete real data by accident

**After**: Separate folders for dev and prod
- **Dev folders**: `dev_workflows`, `dev_assets`
- **Prod folders**: `prod_workflows`, `prod_assets`

**What this means for you**:
- ✅ Test all you want - it won't affect real users' data
- ✅ You can delete test data without worrying
- ✅ Real users' workflows and assets are safe in the prod folders

---

## Troubleshooting

### "The app won't start on my computer"

**Try these**:
1. Make sure you're in the right folder:
   ```bash
   cd /Users/ldebortolialves/CODING_PROJECTS/veo-app/genmediafrontend
   ```

2. Make sure dependencies are installed:
   ```bash
   pnpm install
   ```

3. Try again:
   ```bash
   pnpm dev
   ```

### "Deploy script won't run"

**Try making it executable**:
```bash
chmod +x deploy-dev.sh
chmod +x deploy.sh
```

Then try running it again.

### "I deployed but don't see my changes"

**Possible reasons**:
1. **Deployment is still in progress** - wait 5-10 minutes
2. **Browser cache** - try refreshing with `Ctrl + Shift + R` (or `Cmd + Shift + R` on Mac)
3. **Wrong URL** - make sure you're looking at the dev URL if you deployed to dev

### "I broke production!"

1. **Stay calm** - this happens to everyone
2. **Tell your team immediately**
3. Someone technical can roll back to the previous version
4. In the future, always test on dev first!

---

## Best Practices

### ✅ Do This:
- Always test locally first
- Deploy to dev before deploying to prod
- Test the dev version thoroughly
- Ask someone to review big changes
- Deploy to prod during low-traffic times (if possible)

### ❌ Don't Do This:
- Don't deploy directly to prod without testing
- Don't deploy on Fridays (if something breaks, you might have to fix it on the weekend!)
- Don't skip the confirmation prompt
- Don't delete the `.env.production` file

---

## Need Help?

If you're stuck or confused:
1. Check this guide again
2. Ask your team for help
3. Refer to the technical documentation in `/Users/ldebortolialves/.claude/plans/hazy-booping-rose.md`

**Remember**: It's okay to ask questions! Everyone was a beginner once. 🎉
