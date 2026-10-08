import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Sanitize CLOUDINARY_URL to handle common paste errors like:
// 'CLOUDINARY_URL=cloudinary://...', surrounding quotes, or 'export CLOUDINARY_URL=...'
export function sanitizeCloudinaryEnv(): string | null {
  let url = process.env.CLOUDINARY_URL;
  if (!url) return null;

  url = url.trim();
  if (url.startsWith('export ')) {
    url = url.substring(7).trim();
  }
  if (url.startsWith('CLOUDINARY_URL=')) {
    url = url.substring('CLOUDINARY_URL='.length).trim();
  }
  // Strip surrounding quotes
  url = url.replace(/^["']|["']$/g, '').trim();

  if (url.startsWith('cloudinary://')) {
    process.env.CLOUDINARY_URL = url;
    return url;
  }

  console.warn(
    `[Cloudinary] Warning: CLOUDINARY_URL does not start with 'cloudinary://' (starts with: ${url.substring(0, 15)}...). Falling back to database/local storage.`
  );
  delete process.env.CLOUDINARY_URL;
  return null;
}

// 1. Sanitize process.env.CLOUDINARY_URL FIRST before requiring cloudinary SDK
sanitizeCloudinaryEnv();

// 2. Now load cloudinary safely
let cloudinary: any = null;
let isConfigured = false;

try {
  const cloudinaryModule = require('cloudinary');
  cloudinary = cloudinaryModule.v2 || cloudinaryModule;

  if (process.env.CLOUDINARY_URL && process.env.CLOUDINARY_URL.startsWith('cloudinary://')) {
    cloudinary.config();
    const conf = cloudinary.config();
    if (conf.cloud_name) {
      isConfigured = true;
      console.log(`[Cloudinary] Cloudinary configured successfully for cloud: "${conf.cloud_name}".`);
    }
  } else if (
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  ) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME.trim().replace(/^["']|["']$/g, ''),
      api_key: process.env.CLOUDINARY_API_KEY.trim().replace(/^["']|["']$/g, ''),
      api_secret: process.env.CLOUDINARY_API_SECRET.trim().replace(/^["']|["']$/g, ''),
      secure: true,
    });
    isConfigured = true;
    console.log('[Cloudinary] Cloudinary configured successfully with explicit credentials.');
  } else {
    console.log('[Cloudinary] No active CLOUDINARY_URL or credentials detected. Attachments will use MongoDB/local storage.');
  }
} catch (err: any) {
  console.warn('[Cloudinary] Initialization warning (falling back to local/database storage):', err.message);
  isConfigured = false;
}

export async function uploadToCloudinary(
  filePath: string,
  _originalName: string,
  mimeType: string
): Promise<{ url: string; publicId: string } | null> {
  if (!isConfigured || !cloudinary) return null;

  try {
    const isImage = mimeType.startsWith('image/');
    const resourceType: 'image' | 'raw' = isImage ? 'image' : 'raw';

    const result = await cloudinary.uploader.upload(filePath, {
      resource_type: resourceType,
      folder: 'duo_attachments',
      use_filename: true,
      unique_filename: true,
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
    };
  } catch (err: any) {
    console.warn('[Cloudinary] Upload failed, falling back to database storage:', err.message);
    return null;
  }
}

export async function deleteFromCloudinary(publicId: string, mimeType?: string): Promise<void> {
  if (!isConfigured || !cloudinary || !publicId) return;
  try {
    const isImage = mimeType && mimeType.startsWith('image/');
    const resourceType: 'image' | 'raw' = isImage ? 'image' : 'raw';
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch (err: any) {
    console.warn('[Cloudinary] Failed to delete asset from Cloudinary:', err.message);
  }
}

export function isCloudinaryEnabled(): boolean {
  return isConfigured;
}
