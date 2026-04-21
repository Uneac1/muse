"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const envCandidates = [
    path_1.default.resolve(__dirname, '../../../.env'),
    path_1.default.resolve(__dirname, '../../.env'),
    path_1.default.resolve(__dirname, '../../../.env.example'),
    path_1.default.resolve(__dirname, '../../.env.example'),
];
for (const envPath of envCandidates) {
    if (fs_1.default.existsSync(envPath)) {
        dotenv_1.default.config({ path: envPath, override: false });
    }
}
const serverRoot = path_1.default.resolve(__dirname, '../..');
const configuredDbPath = process.env.DB_PATH || './data/muse-mail.db';
const resolvedDbPath = path_1.default.resolve(serverRoot, configuredDbPath);
const legacyDbPath = path_1.default.resolve(serverRoot, './data/outlook.db');
const dbPath = process.env.DB_PATH
    ? resolvedDbPath
    : fs_1.default.existsSync(legacyDbPath)
        ? legacyDbPath
        : resolvedDbPath;
exports.config = {
    port: parseInt(process.env.PORT || '3000', 10),
    serverOrigin: process.env.SERVER_ORIGIN ||
        process.env.WEB_APP_ORIGIN ||
        `http://localhost:${parseInt(process.env.PORT || '3000', 10)}`,
    logLevel: process.env.LOG_LEVEL || 'info',
    dbPath,
    accessPassword: process.env.ACCESS_PASSWORD || '',
    googleClientId: process.env.GOOGLE_CLIENT_ID || process.env.ADMIN_GOOGLE_CLIENT_ID || '',
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || process.env.ADMIN_GOOGLE_CLIENT_SECRET || '',
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
    webAppOrigin: process.env.WEB_APP_ORIGIN ||
        process.env.SERVER_ORIGIN ||
        `http://localhost:5173`,
    openaiOAuthRedirectUri: process.env.OPENAI_OAUTH_REDIRECT_URI ||
        `${process.env.SERVER_ORIGIN || process.env.WEB_APP_ORIGIN || `http://localhost:${parseInt(process.env.PORT || '3000', 10)}`}/api/oauth/openai/callback`,
    googleOAuthRedirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI ||
        `${process.env.SERVER_ORIGIN || process.env.WEB_APP_ORIGIN || `http://localhost:${parseInt(process.env.PORT || '3000', 10)}`}/api/oauth/google/callback`,
    adminGoogleOAuthRedirectUri: process.env.ADMIN_GOOGLE_OAUTH_REDIRECT_URI ||
        `${process.env.SERVER_ORIGIN || process.env.WEB_APP_ORIGIN || `http://localhost:${parseInt(process.env.PORT || '3000', 10)}`}/api/auth/google/callback`,
};
//# sourceMappingURL=index.js.map