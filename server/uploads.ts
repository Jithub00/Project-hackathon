import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { HttpError } from './http';

const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const VIDEO_TYPES: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

/** Checks the first bytes of the file match the declared type. */
function signatureMatches(mime: string, buffer: Buffer): boolean {
  if (mime === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mime === 'image/png') return buffer.subarray(0, 4).toString('hex') === '89504e47';
  if (mime === 'image/webp') return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  if (mime === 'video/mp4' || mime === 'video/quicktime') return buffer.subarray(4, 8).toString('ascii') === 'ftyp' || buffer.subarray(4, 8).toString('ascii') === 'moov' || buffer.subarray(4, 8).toString('ascii') === 'mdat';
  if (mime === 'video/webm') return buffer.subarray(0, 4).toString('hex') === '1a45dfa3';
  return false;
}

function safeName(name: string): string {
  return name.replace(/[^\w.\- ]+/g, '_').slice(0, 120);
}

export interface SavedUpload {
  url: string;
  kind: 'photo' | 'video';
  sizeBytes: number;
  fileName: string;
}

/** Stores a base64 data-URL upload in the uploads folder and returns its public URL. */
export function saveUpload(uploadsDir: string, input: { fileName: string; mimeType: string; dataUrl: string }): SavedUpload {
  const match = /^data:([^;]+);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(input.dataUrl);
  if (!match) throw new HttpError(400, 'That upload could not be read. Choose the file again.', 'BAD_UPLOAD');
  const mime = input.mimeType.toLowerCase();
  if (match[1].toLowerCase() !== mime) throw new HttpError(400, 'The file type does not match. Choose the file again.', 'BAD_UPLOAD');
  const imageExt = IMAGE_TYPES[mime];
  const videoExt = VIDEO_TYPES[mime];
  if (!imageExt && !videoExt) {
    throw new HttpError(415, 'Upload a JPG, PNG, WebP, MP4, WebM or MOV file.', 'UNSUPPORTED_TYPE');
  }
  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  const kind = imageExt ? 'photo' : 'video';
  const limit = kind === 'photo' ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (buffer.length > limit) {
    throw new HttpError(413, `That file is larger than the ${Math.round(limit / 1024 / 1024)} MB demo limit.`, 'TOO_LARGE');
  }
  if (!signatureMatches(mime, buffer)) {
    throw new HttpError(415, 'The file contents do not match its type.', 'BAD_CONTENT');
  }
  fs.mkdirSync(uploadsDir, { recursive: true });
  const stored = `${randomUUID()}.${imageExt ?? videoExt}`;
  fs.writeFileSync(path.join(uploadsDir, stored), buffer);
  return { url: `/uploads/${stored}`, kind, sizeBytes: buffer.length, fileName: safeName(input.fileName) };
}
