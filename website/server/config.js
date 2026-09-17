import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

// Load only website credentials. Never read or change the mobile app's .env.
// Shell/deployment variables take precedence over either local file.
dotenv.config({ path: [
  fileURLToPath(new URL('../.env', import.meta.url)),
  fileURLToPath(new URL('../../.env.website.local', import.meta.url)),
], quiet: true });

export const websitePort = Number(process.env.WEBSITE_API_PORT || 8787);
if (!Number.isInteger(websitePort) || websitePort < 1 || websitePort > 65535) {
  throw new Error('WEBSITE_API_PORT must be an integer between 1 and 65535.');
}
