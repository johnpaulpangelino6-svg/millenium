// Automatic Git Sync Watcher
// Watches for file changes and automatically syncs to GitHub
// Keeps your Render.com webhost always updated

import { watch } from 'fs';
import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('================================');
console.log('🔄 MILLENNIUM AUTO-WATCH STARTED');
console.log('================================\n');
console.log('👀 Watching for file changes...');
console.log('💾 Will auto-commit and push to GitHub');
console.log('🚀 Render.com will auto-deploy\n');
console.log('Press Ctrl+C to stop\n');

let syncTimer = null;
let changeDetected = false;

// Directories to watch
const watchDirs = ['src', 'public', 'data'];
const ignorePatterns = ['node_modules', 'dist', '.git', 'data/millennium.db'];

// Debounce function - waits 5 seconds after last change before syncing
function scheduleSync() {
  changeDetected = true;
  
  if (syncTimer) {
    clearTimeout(syncTimer);
  }
  
  syncTimer = setTimeout(() => {
    console.log('\n⏰ 5 seconds passed since last change. Starting sync...\n');
    performSync();
  }, 5000); // Wait 5 seconds after last change
}

// Perform git sync
function performSync() {
  if (!changeDetected) return;
  
  changeDetected = false;
  
  console.log('================================');
  console.log('🔄 AUTO-SYNC TRIGGERED');
  console.log('================================\n');
  
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const commands = [
    'git pull origin main',
    'git add .',
    `git commit -m "Auto-sync: Update code - ${timestamp}"`,
    'git push origin main'
  ];
  
  let currentCommand = 0;
  
  function runNextCommand() {
    if (currentCommand >= commands.length) {
      console.log('\n✅ SYNC COMPLETE!\n');
      console.log('🚀 Render.com will deploy in 2-3 minutes');
      console.log('🌐 https://millenium.onrender.com\n');
      console.log('👀 Watching for more changes...\n');
      return;
    }
    
    const cmd = commands[currentCommand];
    console.log(`▶ Running: ${cmd}`);
    
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        // Ignore "nothing to commit" errors
        if (stderr.includes('nothing to commit') || stderr.includes('no changes')) {
          console.log('ℹ️  No changes to commit (already up to date)\n');
          console.log('👀 Watching for more changes...\n');
          return;
        }
        console.error(`❌ Error: ${stderr}`);
        return;
      }
      
      if (stdout) console.log(stdout);
      if (stderr) console.log(stderr);
      
      currentCommand++;
      runNextCommand();
    });
  }
  
  runNextCommand();
}

// Watch each directory
watchDirs.forEach(dir => {
  const dirPath = path.join(__dirname, dir);
  
  try {
    watch(dirPath, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      
      // Ignore certain files/patterns
      const shouldIgnore = ignorePatterns.some(pattern => 
        filename.includes(pattern)
      );
      
      if (shouldIgnore) return;
      
      // Ignore database files
      if (filename.endsWith('.db') || filename.endsWith('.db-shm') || filename.endsWith('.db-wal')) {
        return;
      }
      
      console.log(`📝 Change detected: ${dir}/${filename}`);
      scheduleSync();
    });
    
    console.log(`✅ Watching: ${dir}/`);
  } catch (err) {
    console.log(`⚠️  Could not watch: ${dir}/ (may not exist)`);
  }
});

console.log('');

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\n================================');
  console.log('⏹️  AUTO-WATCH STOPPED');
  console.log('================================\n');
  process.exit(0);
});
