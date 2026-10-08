// Early environment variable sanitization
// Runs before any libraries (like cloudinary or mongodb) are imported or evaluated

if (process.env.CLOUDINARY_URL) {
  let cUrl = process.env.CLOUDINARY_URL.trim();
  if (cUrl.startsWith('export ')) {
    cUrl = cUrl.substring(7).trim();
  }
  if (cUrl.startsWith('CLOUDINARY_URL=')) {
    cUrl = cUrl.substring('CLOUDINARY_URL='.length).trim();
  }
  cUrl = cUrl.replace(/^["']|["']$/g, '').trim();

  if (cUrl.startsWith('cloudinary://')) {
    process.env.CLOUDINARY_URL = cUrl;
  } else {
    console.warn(
      `[Env] CLOUDINARY_URL does not start with 'cloudinary://' (got '${cUrl.substring(0, 15)}...'). Disabling to prevent SDK errors.`
    );
    delete process.env.CLOUDINARY_URL;
  }
}

export {};
