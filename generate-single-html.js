import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

console.log('=== Automatic Single HTML Builder ===');
console.log('Rebuilding React application with Vite to compile all latest updates...');

try {
  // Always run vite build to ensure we compile the absolute latest changes.
  // We forward the active APP_URL from server.ts as VITE_API_URL so the compiled bundle knows where its host lives!
  const serverUrl = process.env.APP_URL || '';
  const updateManifestUrl = process.env.UPDATE_MANIFEST_URL || '';
  let envPrefix = '';
  if (serverUrl) {
    envPrefix += `VITE_API_URL="${serverUrl}" `;
  }
  if (updateManifestUrl) {
    envPrefix += `VITE_UPDATE_MANIFEST_URL="${updateManifestUrl}" `;
  }
  
  console.log(`Building with API URL: ${serverUrl || 'Default fallback'}`);
  if (updateManifestUrl) {
    console.log(`Building with custom Update Manifest URL: ${updateManifestUrl}`);
  }
  execSync(`${envPrefix}npx vite build`, { stdio: 'inherit' });

  const distHtmlPath = path.join(process.cwd(), 'dist/index.html');
  const targetHtmlPath = path.join(process.cwd(), 'baltic_master_zen.html');

  if (fs.existsSync(distHtmlPath)) {
    fs.copyFileSync(distHtmlPath, targetHtmlPath);
    console.log('\n======================================================');
    console.log('SUCCESS: Offline single-file HTML generated successfully!');
    console.log(`Source: ${distHtmlPath}`);
    console.log(`Destination: ${targetHtmlPath}`);
    console.log('======================================================\n');
  } else {
    throw new Error('dist/index.html was not found after running vite build.');
  }
} catch (error) {
  console.error('CRITICAL ERROR: Failed to compile and copy single HTML app:', error);
  process.exit(1);
}
