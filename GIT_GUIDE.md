# Complete Git Guide - From Zero to Hero

## 📚 Table of Contents
1. [What is Git?](#what-is-git)
2. [Basic Concepts](#basic-concepts)
3. [Essential Commands](#essential-commands)
4. [Common Workflows](#common-workflows)
5. [GitHub Integration](#github-integration)
6. [Troubleshooting](#troubleshooting)
7. [Best Practices](#best-practices)

---

## What is Git?

**Git** is a version control system that tracks changes in your code.

**Think of it like:**
- 📸 Taking snapshots of your project at different points in time
- ⏮️ Ability to undo changes and go back to any previous version
- 👥 Collaborate with others without overwriting each other's work
- 🌿 Work on different features simultaneously (branches)

**GitHub** is a website that hosts your Git repositories online (like Google Drive for code).

---

## Basic Concepts

### 1. Repository (Repo)
A folder that Git is tracking. Contains all your code and Git history.

```
my-project/          ← Repository
├── .git/            ← Git's tracking data (hidden folder)
├── src/             ← Your files
└── README.md
```

### 2. Commit
A snapshot of your project at a specific point in time.

```
Commit 1: "Initial project"
    ↓
Commit 2: "Add login feature"
    ↓
Commit 3: "Fix bug in login"  ← You can go back to any of these!
```

### 3. Staging Area (Index)
A waiting area before committing. You choose which changes to include.

```
Working Directory  →  Staging Area  →  Commit
(Your files)         (git add)        (git commit)
```

### 4. Remote
The online version of your repository (usually on GitHub).

```
Local (Your Computer)  ↔  Remote (GitHub)
     git push →
     ← git pull
```

### 5. Branch
A separate line of development. Like parallel universes for your code.

```
main    ──●──●──●──●──●
              ↓
feature      ●──●──● (new feature)
```

---

## Essential Commands

### Setup (One Time Only)

#### Configure Git (First Time Setup)
```bash
# Set your name (appears in commits)
git config --global user.name "Your Name"

# Set your email (appears in commits)
git config --global user.email "your.email@example.com"

# Check your settings
git config --list
```

#### Initialize a Repository
```bash
# Turn a folder into a Git repository
git init

# Or clone an existing repository from GitHub
git clone https://github.com/username/repository.git
```

---

### Daily Commands (The Big 5)

#### 1. Check Status
See what files changed.

```bash
git status
```

**Output:**
```
On branch main
Changes not staged for commit:
  modified:   src/server.ts
  modified:   README.md

Untracked files:
  newfile.js
```

---

#### 2. Stage Changes
Add files to staging area (prepare for commit).

```bash
# Stage a specific file
git add filename.js

# Stage all changed files
git add .

# Stage multiple specific files
git add file1.js file2.js file3.js
```

**Tip:** Use `git add .` most of the time!

---

#### 3. Commit Changes
Save a snapshot with a message.

```bash
# Commit with a message
git commit -m "Add login feature"

# Commit with a detailed message
git commit -m "Fix login bug" -m "Fixed issue where users couldn't login with special characters in password"
```

**Good commit messages:**
```
✅ "Add user authentication"
✅ "Fix navbar responsive layout"
✅ "Update deployment configuration"

❌ "changes"
❌ "fixed stuff"
❌ "asdfasdf"
```

---

#### 4. Push to GitHub
Upload your commits to GitHub.

```bash
# First time (set up tracking)
git push -u origin main

# After that, just use:
git push
```

---

#### 5. Pull from GitHub
Download changes from GitHub.

```bash
git pull
```

Use this when:
- Working on multiple computers
- Collaborating with others
- Before starting new work (to get latest version)

---

## Common Workflows

### Workflow 1: Daily Development

```bash
# 1. Check what changed
git status

# 2. Stage your changes
git add .

# 3. Commit with message
git commit -m "Add new feature"

# 4. Push to GitHub
git push
```

**PowerShell Script (Copy & Paste):**
```powershell
git status
git add .
git commit -m "Your message here"
git push
```

---

### Workflow 2: Starting Fresh

```bash
# 1. Create a new folder
mkdir my-project
cd my-project

# 2. Initialize Git
git init

# 3. Create some files
# (create your files here)

# 4. Make first commit
git add .
git commit -m "Initial commit"

# 5. Connect to GitHub (create repo on GitHub first!)
git remote add origin https://github.com/username/my-project.git

# 6. Push to GitHub
git push -u origin main
```

---

### Workflow 3: Cloning & Contributing

```bash
# 1. Clone repository from GitHub
git clone https://github.com/username/project.git

# 2. Go into the folder
cd project

# 3. Make changes to files
# (edit your files)

# 4. Stage, commit, and push
git add .
git commit -m "Fix issue #123"
git push
```

---

### Workflow 4: Branching (Advanced)

```bash
# 1. Create a new branch
git checkout -b feature-name

# 2. Make changes and commit
git add .
git commit -m "Add feature"

# 3. Push branch to GitHub
git push -u origin feature-name

# 4. Switch back to main branch
git checkout main

# 5. Merge the feature branch
git merge feature-name

# 6. Delete the feature branch
git branch -d feature-name
```

---

## GitHub Integration

### Creating a New Repository on GitHub

1. **Go to GitHub:** https://github.com
2. **Click** the "+" icon (top right)
3. **Select** "New repository"
4. **Fill in:**
   - Repository name: `my-project`
   - Description: Brief description
   - Public or Private
   - ✅ Check "Add a README file" (optional)
5. **Click** "Create repository"

### Connecting Local Repo to GitHub

```bash
# Add GitHub as remote
git remote add origin https://github.com/username/repository.git

# Verify it's connected
git remote -v

# Push your code
git push -u origin main
```

### Creating a Pull Request (PR)

Pull Requests let others review your code before merging.

```bash
# 1. Create and switch to a new branch
git checkout -b fix-login-bug

# 2. Make changes and commit
git add .
git commit -m "Fix login validation bug"

# 3. Push branch to GitHub
git push -u origin fix-login-bug
```

Then on GitHub:
1. Go to your repository
2. Click "Pull requests" tab
3. Click "New pull request"
4. Select your branch
5. Add description
6. Click "Create pull request"

---

## Troubleshooting

### Problem 1: Forgot to Commit Before Making Changes

```bash
# Save your current changes temporarily
git stash

# Do what you need to do (pull, switch branch, etc.)
git pull

# Bring back your changes
git stash pop
```

---

### Problem 2: Made a Mistake in Last Commit

```bash
# Undo last commit (keeps changes)
git reset --soft HEAD~1

# Make corrections, then commit again
git add .
git commit -m "Fixed commit message"
```

---

### Problem 3: Want to Undo All Local Changes

```bash
# Discard ALL local changes (careful!)
git reset --hard HEAD

# Or just one file
git checkout -- filename.js
```

---

### Problem 4: Merge Conflict

When Git can't automatically merge changes:

```bash
# 1. Git will mark conflicts in your files like this:
<<<<<<< HEAD
Your changes
=======
Their changes
>>>>>>> branch-name

# 2. Edit the file, choose what to keep
# 3. Remove the markers (<<<<<<, =======, >>>>>>>)
# 4. Stage and commit
git add .
git commit -m "Resolve merge conflict"
```

---

### Problem 5: Accidentally Committed Secrets (.env file)

```bash
# Remove from Git but keep locally
git rm --cached .env

# Make sure .env is in .gitignore
echo ".env" >> .gitignore

# Commit the removal
git add .gitignore
git commit -m "Remove .env from tracking"
git push

# Then change your secrets! (They're exposed on GitHub now)
```

---

### Problem 6: Can't Push (Repository Out of Date)

```
! [rejected] main -> main (fetch first)
error: failed to push some refs
```

**Solution:**
```bash
# Pull latest changes first
git pull

# If there are conflicts, resolve them
# Then push again
git push
```

---

### Problem 7: Wrong Remote URL

```bash
# Check current remote
git remote -v

# Change it
git remote set-url origin https://github.com/username/correct-repo.git

# Verify
git remote -v
```

---

## Best Practices

### 1. Commit Often, Push Regularly
```bash
# ✅ Good: Small, frequent commits
git commit -m "Add user model"
git commit -m "Add user controller"
git commit -m "Add user routes"

# ❌ Bad: One huge commit at the end of the day
git commit -m "Worked on user features all day"
```

### 2. Write Meaningful Commit Messages

**Format:**
```
<type>: <short summary>

<optional detailed description>
```

**Examples:**
```bash
✅ feat: Add user authentication
✅ fix: Fix navbar overflow on mobile
✅ docs: Update README with installation steps
✅ refactor: Simplify login validation logic
✅ style: Format code with prettier
✅ test: Add tests for user API

❌ "updates"
❌ "changes"
❌ "stuff"
```

### 3. Use .gitignore

**Always ignore:**
```
node_modules/
dist/
.env
*.log
.DS_Store
```

**Create `.gitignore` file:**
```bash
# Create the file
touch .gitignore

# Add patterns
echo "node_modules/" >> .gitignore
echo "dist/" >> .gitignore
echo ".env" >> .gitignore
```

### 4. Never Commit Secrets

**❌ Never commit:**
- Passwords
- API keys
- Database credentials
- Private keys
- .env files

**✅ Instead:**
- Use environment variables
- Create `.env.example` template
- Add `.env` to `.gitignore`

### 5. Pull Before You Push

```bash
# Always do this workflow
git pull    # Get latest changes first
# Make your changes
git add .
git commit -m "Your message"
git push
```

### 6. Use Branches for Features

```bash
# ✅ Good: Use branches
git checkout -b feature-payment
# Work on payment feature
git commit -m "Add payment feature"
git push -u origin feature-payment

# ❌ Bad: Everything in main branch
# (hard to manage multiple features)
```

---

## Quick Reference Cheat Sheet

### Must-Know Commands

| Command | What It Does |
|---------|-------------|
| `git status` | Check what changed |
| `git add .` | Stage all changes |
| `git commit -m "msg"` | Save snapshot with message |
| `git push` | Upload to GitHub |
| `git pull` | Download from GitHub |
| `git clone <url>` | Copy repository from GitHub |
| `git log` | View commit history |
| `git diff` | See what changed |

### Branching Commands

| Command | What It Does |
|---------|-------------|
| `git branch` | List branches |
| `git branch <name>` | Create branch |
| `git checkout <name>` | Switch branch |
| `git checkout -b <name>` | Create & switch branch |
| `git merge <name>` | Merge branch into current |
| `git branch -d <name>` | Delete branch |

### Undoing Commands

| Command | What It Does |
|---------|-------------|
| `git reset --soft HEAD~1` | Undo last commit (keep changes) |
| `git reset --hard HEAD` | Discard all local changes |
| `git checkout -- <file>` | Discard changes to one file |
| `git revert <commit>` | Undo a specific commit |

### Remote Commands

| Command | What It Does |
|---------|-------------|
| `git remote -v` | View remote URLs |
| `git remote add origin <url>` | Connect to GitHub |
| `git push -u origin main` | Push & track branch |
| `git fetch` | Download without merging |

---

## PowerShell Aliases (Optional Speed Boost)

Add to your PowerShell profile:

```powershell
# Open profile
notepad $PROFILE

# Add these aliases
function gs { git status }
function ga { git add . }
function gc { param($msg) git commit -m $msg }
function gp { git push }
function gl { git pull }
function glog { git log --oneline --graph --all }
```

**Now you can use:**
```powershell
gs           # Instead of: git status
ga           # Instead of: git add .
gc "message" # Instead of: git commit -m "message"
gp           # Instead of: git push
gl           # Instead of: git pull
```

---

## Visual Git Tools (Easier than Command Line)

### For Windows:
1. **GitHub Desktop** - https://desktop.github.com
   - Visual interface for Git
   - No command line needed
   - Great for beginners

2. **GitKraken** - https://www.gitkraken.com
   - Beautiful visual interface
   - Branch visualization
   - Free for public repos

3. **VS Code Built-in**
   - VS Code has Git integration
   - Click the Source Control icon
   - Stage, commit, push with clicks

---

## Learning Resources

### Interactive Tutorials:
- **Learn Git Branching:** https://learngitbranching.js.org
  - Visual, interactive game
  - Learn by doing

- **GitHub Skills:** https://skills.github.com
  - Official GitHub tutorials
  - Step-by-step projects

### Reference:
- **Official Git Docs:** https://git-scm.com/doc
- **GitHub Guides:** https://guides.github.com
- **Git Cheat Sheet:** https://education.github.com/git-cheat-sheet-education.pdf

---

## Your Project Workflow (Copy This)

### Daily Development:
```powershell
# Check what changed
git status

# Stage everything
git add .

# Commit with message
git commit -m "Add feature X"

# Push to GitHub
git push
```

### Starting Work:
```powershell
# Get latest changes
git pull

# Create feature branch (optional)
git checkout -b new-feature

# Make your changes...
```

### Finishing Work:
```powershell
# Stage and commit
git add .
git commit -m "Complete feature X"

# Push to GitHub
git push
```

---

## Summary

**Git in 3 Steps:**
1. **Save locally:** `git add . && git commit -m "message"`
2. **Upload to GitHub:** `git push`
3. **Download from GitHub:** `git pull`

**That's it!** 90% of the time, you'll use these commands.

---

## Quick Start Template

Copy and paste this for every new project:

```bash
# 1. Initialize Git
git init

# 2. Create .gitignore
echo "node_modules/" > .gitignore
echo "dist/" >> .gitignore
echo ".env" >> .gitignore

# 3. First commit
git add .
git commit -m "Initial commit"

# 4. Connect to GitHub (create repo on GitHub first!)
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git

# 5. Push to GitHub
git push -u origin main
```

---

**You're now ready to use Git like a pro!** 🎉

Remember: Practice makes perfect. Start with the basic commands and gradually learn more advanced features.
