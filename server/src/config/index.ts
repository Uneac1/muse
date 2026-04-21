import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const envCandidates = [
  path.resolve(__dirname, '../../../.env.example'),
  path.resolve(__dirname, '../../.env.example'),
  path.resolve(__dirname, '../../../.env'),
  path.resolve(__dirname, '../../.env'),
];

for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
  }
}

const serverRoot = path.resolve(__dirname, '../..');
const configuredDbPath = process.env.DB_PATH || './data/muse-mail.db';
const resolvedDbPath = path.resolve(serverRoot, configuredDbPath);
const legacyDbPath = path.resolve(serverRoot, './data/outlook.db');
const dbPath = process.env.DB_PATH
  ? resolvedDbPath
  : fs.existsSync(legacyDbPath)
    ? legacyDbPath
    : resolvedDbPath;

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  serverOrigin: process.env.SERVER_ORIGIN || `http://localhost:${parseInt(process.env.PORT || '3000', 10)}`,
  logLevel: process.env.LOG_LEVEL || 'info',
  dbPath,
  accessPassword: process.env.ACCESS_PASSWORD || '',
  adminGoogleClientId: process.env.ADMIN_GOOGLE_CLIENT_ID || '',
  adminGoogleClientSecret: process.env.ADMIN_GOOGLE_CLIENT_SECRET || '',
  adminAllowedEmails: (process.env.ADMIN_ALLOWED_EMAILS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean),
  defaultGitHubToken: process.env.DEFAULT_GITHUB_TOKEN || '',
  defaultCloudflareToken: process.env.DEFAULT_CLOUDFLARE_TOKEN || '',
  defaultNotionToken: process.env.DEFAULT_NOTION_TOKEN || '',
  defaultMiSubUrl: process.env.DEFAULT_MISUB_URL || 'https://misub.y130.icu/',
  defaultMiSubPassword: process.env.DEFAULT_MISUB_PASSWORD || 'y130',
  defaultYmailAdminPassword: process.env.DEFAULT_YMAIL_ADMIN_PASSWORD || '',
  ymailSiteUrl: process.env.YMAIL_SITE_URL || 'https://ymail.y130.icu',
  ymailApiBaseUrl: process.env.YMAIL_API_BASE_URL || 'https://ymail-api.y130.icu',
  webAppOrigin: process.env.WEB_APP_ORIGIN || 'http://localhost:5173',
  googleOAuthRedirectUri:
    process.env.GOOGLE_OAUTH_REDIRECT_URI || `http://localhost:${parseInt(process.env.PORT || '3000', 10)}/api/oauth/google/callback`,
  adminGoogleOAuthRedirectUri:
    process.env.ADMIN_GOOGLE_OAUTH_REDIRECT_URI || `http://localhost:${parseInt(process.env.PORT || '3000', 10)}/api/auth/google/callback`,
};
