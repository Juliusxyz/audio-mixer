# Audio Mixer - Release and Update Setup

## Issues Found and Fixed:

### ✅ **Version Consistency**
- Fixed version mismatch between files
- All files now use version `0.1.1`

### ✅ **GitHub Actions Workflow**
- Updated environment variable names for Tauri signing
- Workflow triggers on version tags

### ❌ **Missing Setup Steps**

You need to set up these GitHub repository secrets for releases to work:

1. **TAURI_SIGNING_PRIVATE_KEY** - Your private signing key
2. **TAURI_SIGNING_PRIVATE_KEY_PASSWORD** - Password for the signing key

## How to Set Up the Updater:

### Step 1: Generate Signing Keys
```bash
# Run this in your project root
npx @tauri-apps/cli signer generate -w ~/.tauri/myapp.key
```

### Step 2: Add Repository Secrets
1. Go to: https://github.com/Juliusxyz/audio-mixer/settings/secrets/actions
2. Add these secrets:
   - `TAURI_SIGNING_PRIVATE_KEY`: Content of your private key file
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: Password you set for the key

### Step 3: Create Your First Release
```bash
# Bump version first (optional)
npm version patch  # or minor/major

# Create and push a tag
git tag v0.1.1
git push origin v0.1.1
```

### Step 4: Test the Updater
1. The GitHub Action will create a release with installers
2. Build and test your app - it should check for updates
3. Create a new version to test the update process

## Current Status:
- ✅ Version files synchronized
- ✅ GitHub Actions workflow configured  
- ✅ Update check disabled in development
- ❌ Need to set up signing keys and repository secrets
- ❌ Need to create first release

## Next Steps:
1. Generate signing keys
2. Add repository secrets
3. Create first release with `git tag v0.1.1 && git push origin v0.1.1`
