const fs = require('fs');
const path = require('path');

const targetFiles = [
  './packages/core/package.json',
  './packages/dom/package.json',
  './packages/dom-core/package.json',
];

const primaryPath = path.resolve(__dirname, '..', targetFiles[0]);
if (!fs.existsSync(primaryPath)) {
  console.error(`ERROR: File not found -> ${primaryPath}`);
  process.exit(1);
}

const primaryPkg = JSON.parse(fs.readFileSync(primaryPath, 'utf8'));
const currentVersion = primaryPkg.version;

const inputArg = process.argv[2] || 'patch';

let nextVersion;

const semverRegex = /^\d+\.\d+\.\d+$/;

if (semverRegex.test(inputArg)) {
  nextVersion = inputArg;
} else {
  const parts = currentVersion.split('.').map(Number);
  
  if (parts.length !== 3 || parts.some(isNaN)) {
    console.error(`ERROR: Invalid version format (${currentVersion})`);
    process.exit(1);
  }

  switch (inputArg.toLowerCase()) {
    case 'patch':
      parts[2] += 1; // 0.1.1 -> 0.1.2
      break;
    case 'minor':
      parts[1] += 1; // 0.1.1 -> 0.2.0
      parts[2] = 0;
      break;
    case 'major':
      parts[0] += 1; // 0.1.1 -> 1.0.0
      parts[1] = 0;
      parts[2] = 0;
      break;
    default:
      console.error(`ERROR: Invalid argument "${inputArg}"`);
      console.error(`USAGE: node scripts/bump.js [patch | minor | major | <version>]`);
      process.exit(1);
  }
  
  nextVersion = parts.join('.');
}

console.log(`Updating version: ${currentVersion} -> ${nextVersion}`);

targetFiles.forEach(relPath => {
  const fullPath = path.resolve(__dirname, '..', relPath);
  if (fs.existsSync(fullPath)) {
    const pkg = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    pkg.version = nextVersion;
    fs.writeFileSync(fullPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log(` SUCCESS: ${relPath}`);
  }
});

console.log(`\n We've updated all packages to version v${nextVersion}`);