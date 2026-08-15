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

const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/;

if (semverRegex.test(inputArg)) {
  nextVersion = inputArg;
} else {
  const [versionPart, preReleasePart] = currentVersion.split('-');
  const parts = versionPart.split('.').map(Number);

  if (parts.length !== 3 || parts.some(isNaN)) {
    console.error(`ERROR: Invalid version format (${currentVersion})`);
    process.exit(1);
  }

  switch (inputArg.toLowerCase()) {
    case 'dev':
      if (preReleasePart && preReleasePart.startsWith('dev.')) {
        const devNum = parseInt(preReleasePart.split('.')[1], 10) || 0;
        nextVersion = `${versionPart}-dev.${devNum + 1}`;
      } else {
        parts[2] += 1;
        nextVersion = `${parts.join('.')}-dev.0`;
      }
      break;
    case 'patch':
      parts[2] += 1; // 0.1.1 -> 0.1.2
      nextVersion = parts.join('.');
      break;
    case 'minor':
      parts[1] += 1; // 0.1.1 -> 0.2.0
      parts[2] = 0;
      nextVersion = parts.join('.');
      break;
    case 'major':
      parts[0] += 1; // 0.1.1 -> 1.0.0
      parts[1] = 0;
      parts[2] = 0;
      nextVersion = parts.join('.');
      break;

    default:
      console.error(`ERROR: Invalid argument "${inputArg}"`);
      console.error(`USAGE: node scripts/bump.js [patch | minor | major | dev | <version>]`);
      process.exit(1);
  }
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