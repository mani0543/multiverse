import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { UPLOADS_DIR } from './db.ts';

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// 25MB maximum upload limit for attachments
export const MAX_FILE_SIZE = 25 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, _file, cb) => {
    // Generate secure random storage key, preventing path traversal or executable naming
    const storageKey = crypto.randomBytes(24).toString('hex');
    cb(null, storageKey);
  },
});

const ALLOWED_MIME_PREFIXES = [
  'image/',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
  'audio/',
  'video/',
];

// Block dangerous executable extensions
const DISALLOWED_EXTENSIONS = [
  '.exe',
  '.bat',
  '.cmd',
  '.sh',
  '.bin',
  '.msi',
  '.com',
  '.vbs',
  '.js',
  '.mjs',
  '.php',
  '.phtml',
  '.cgi',
  '.py',
  '.rb',
  '.pl',
];

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (DISALLOWED_EXTENSIONS.includes(ext)) {
      return cb(new Error('Executable and script file uploads are forbidden for security.'));
    }

    const isAllowed = ALLOWED_MIME_PREFIXES.some((prefix) => file.mimetype.startsWith(prefix));
    if (!isAllowed) {
      // Allow generic safe octet-stream only if not executable
      if (file.mimetype === 'application/octet-stream') {
        return cb(null, true);
      }
      return cb(new Error(`File type ${file.mimetype} is not supported.`));
    }

    cb(null, true);
  },
});

export function sanitizeFilename(originalName: string): string {
  // Strip control characters, quotes, path traversal sequences
  return path.basename(originalName).replace(/[^a-zA-Z0-9._\- ()+]/g, '_');
}
