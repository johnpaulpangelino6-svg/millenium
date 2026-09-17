# Auto Git Sync Script for Millennium SmartBoard
# Automatically pulls latest changes and pushes new updates to GitHub
# This keeps your webhost (Render.com) always updated

Write-Host "================================" -ForegroundColor Cyan
Write-Host "🔄 MILLENNIUM AUTO-SYNC TOOL" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Pull latest changes from GitHub
Write-Host "📥 STEP 1: Pulling latest changes from GitHub..." -ForegroundColor Yellow
git pull origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Pull successful!" -ForegroundColor Green
} else {
    Write-Host "⚠️  Pull had conflicts or errors" -ForegroundColor Red
    Write-Host "Please resolve conflicts manually" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 2: Check for local changes
Write-Host "🔍 STEP 2: Checking for local changes..." -ForegroundColor Yellow
$status = git status --porcelain

if ($status) {
    Write-Host "📝 Found changes to commit:" -ForegroundColor Green
    git status --short
    Write-Host ""
    
    # Step 3: Add all changes
    Write-Host "➕ STEP 3: Adding all changes..." -ForegroundColor Yellow
    git add .
    Write-Host "✅ All changes staged" -ForegroundColor Green
    Write-Host ""
    
    # Step 4: Commit changes
    Write-Host "💾 STEP 4: Creating commit..." -ForegroundColor Yellow
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $commitMessage = "Auto-sync: Update code - $timestamp"
    git commit -m $commitMessage
    Write-Host "✅ Commit created: $commitMessage" -ForegroundColor Green
    Write-Host ""
    
    # Step 5: Push to GitHub
    Write-Host "📤 STEP 5: Pushing to GitHub..." -ForegroundColor Yellow
    git push origin main
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Push successful!" -ForegroundColor Green
        Write-Host ""
        Write-Host "================================" -ForegroundColor Cyan
        Write-Host "🎉 SYNC COMPLETE!" -ForegroundColor Green
        Write-Host "================================" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "🚀 Render.com will auto-deploy in 2-3 minutes" -ForegroundColor Yellow
        Write-Host "🌐 Your site: https://millenium.onrender.com" -ForegroundColor Cyan
        Write-Host ""
    } else {
        Write-Host "❌ Push failed!" -ForegroundColor Red
        Write-Host "Check your internet connection or GitHub credentials" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "✅ No changes to commit" -ForegroundColor Green
    Write-Host "📁 Working directory is clean" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Everything is already up to date! ✨" -ForegroundColor Green
}

Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
