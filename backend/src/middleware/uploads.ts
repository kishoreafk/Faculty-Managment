import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import { Request } from 'express';

/**
 * Whitelist of allowed MIME types for uploaded documents.
 *
 * Two separate whitelists because:
 *  - vaultify is a general document vault (allow PDF/Office/images)
 *  - timetable files are expected to be PDF/Excel/images
 */
export const ALLOWED_MIME_TYPES = {
  // Documents
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv',
  // Images
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp'
} as const;

export const ALLOWED_MIME_VALUES: ReadonlyArray<string> = Object.values(ALLOWED_MIME_TYPES);

/** Map of extension → mime type for cross-validation. */
const EXT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp'
};

/** Files we explicitly do NOT accept, even if the extension looks innocent. */
const FORBIDDEN_EXTENSIONS = new Set<string>([
  // Executable / script
  'exe', 'msi', 'bat', 'cmd', 'sh', 'ps1', 'com', 'scr', 'pif', 'vbs', 'js', 'jar',
  // Server-side
  'php', 'phtml', 'php3', 'php4', 'php5', 'phps', 'asp', 'aspx', 'jsp', 'cgi', 'pl',
  // HTML (would let an attacker upload a page that browsers render)
  'html', 'htm', 'xhtml', 'svg',
  // Archives that often contain the above
  'zip', 'rar', '7z', 'tar', 'gz', 'iso'
]);

/** Strip control characters and any path separators from a user-supplied filename. */
export const sanitizeFilename = (raw: string, maxLength = 200): string => {
  if (!raw) return 'file';
  // Strip NUL, CR, LF, tab, and other control chars (0x00-0x1F except 0x1F? also strip 0x7F).
  // eslint-disable-next-line no-control-regex
  let cleaned = String(raw).replace(/[\x00-\x1F\x7F]/g, '');
  // Strip path separators and parent-dir references.
  cleaned = cleaned.replace(/[/\\]/g, '_');
  cleaned = cleaned.replace(/\.\.+/g, '.');
  // Strip leading dots and spaces.
  cleaned = cleaned.replace(/^[.\s]+/, '');
  // Collapse multiple dots (prevents ...tricks...).
  cleaned = cleaned.replace(/\.{2,}/g, '.');
  if (cleaned.length > maxLength) {
    const ext = path.extname(cleaned);
    const base = path.basename(cleaned, ext).slice(0, Math.max(0, maxLength - ext.length));
    cleaned = base + ext;
  }
  if (!cleaned) cleaned = 'file';
  return cleaned;
};

/**
 * Generate a Content-Disposition header value that is safe against header
 * injection. We use RFC 5987 `filename*` for the original (UTF-8) name and
 * a stripped ASCII `filename` for old clients.
 */
export const buildContentDisposition = (
  rawFilename: string,
  disposition: 'attachment' | 'inline' = 'attachment'
): string => {
  const safe = sanitizeFilename(rawFilename);
  // ASCII fallback: keep only printable ASCII; replace everything else with `_`.
  const asciiFallback = safe
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\]/g, '_')
    .slice(0, 200) || 'file';
  // RFC 5987 percent-encoding for the UTF-8 name.
  const utf8 = encodeURIComponent(safe).replace(/['()]/g, escape);
  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${utf8}`;
};

/** Multer file filter that rejects anything not in the whitelist. */
export const makeMimeFilter = (allowed: ReadonlyArray<string>) => {
  return (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(1);
    if (FORBIDDEN_EXTENSIONS.has(ext)) {
      return cb(new Error(`File extension ".${ext}" is not allowed.`));
    }
    const mime = file.mimetype.toLowerCase();
    if (!allowed.includes(mime)) {
      return cb(new Error(`File type "${mime}" is not allowed.`));
    }
    // Cross-check: extension and mime must agree.
    if (EXT_TO_MIME[ext] && EXT_TO_MIME[ext] !== mime) {
      return cb(new Error(`File extension does not match MIME type (${mime}).`));
    }
    cb(null, true);
  };
};

/**
 * Build a configured multer instance. By default it stores files on disk
 * under `uploads/temp/` (matching the legacy behaviour) with a generated
 * filename; controllers move them to the final location.
 */
export const makeUploader = (opts: {
  maxMb: number;
  allowed: ReadonlyArray<string>;
}) => {
  return multer({
    storage: multer.diskStorage({
      destination: 'uploads/temp/',
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        // Use a UUID + original extension only; never trust the original name.
        const safeName = `${crypto.randomUUID()}${ext}`;
        cb(null, safeName);
      }
    }),
    limits: {
      files: 1,
      fileSize: Math.max(1, Math.floor(opts.maxMb)) * 1024 * 1024
    },
    fileFilter: makeMimeFilter(opts.allowed)
  });
};
