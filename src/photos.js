const crypto = require('node:crypto');
const multer = require('multer');
const sharp = require('sharp');
const { APIError } = require('./validation');

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_URL = /^\/api\/items\/([1-9][0-9]{0,18})\/photo\?v=([a-f0-9]{32})$/;
const formats = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };
const receive = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 8, parts: 9, fieldSize: 65535, fieldNameSize: 64 },
  fileFilter(req, file, done) {
    done(formats[file.mimetype] ? null : new APIError('Photo must be a JPEG, PNG, or WebP image'), Boolean(formats[file.mimetype]));
  }
}).single('photo');

// This parser is mounted only after authentication and CSRF validation.
function receivePhoto(req, res, next) {
  receive(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      return next(new APIError(error.code === 'LIMIT_FILE_SIZE'
        ? 'Photo must be no larger than 5 MiB'
        : 'Invalid photo upload: use one photo and valid listing fields', error.code === 'LIMIT_FILE_SIZE' ? 413 : 400));
    }
    next(error instanceof APIError ? error : new APIError('Invalid multipart upload'));
  });
}

async function preparePhoto(file) {
  if (!file) return null;
  try {
    const input = sharp(file.buffer, { limitInputPixels: 25000000, failOn: 'warning' });
    const metadata = await input.metadata();
    if (metadata.format !== formats[file.mimetype] || (metadata.pages || 1) !== 1) {
      throw new Error('Photo contents do not match their declared image format');
    }
    const bytes = await input.rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' }).jpeg({ quality: 85 }).toBuffer();
    return { bytes, version: crypto.randomBytes(16).toString('hex') };
  } catch {
    throw new APIError('Invalid photo: upload a valid, single-frame JPEG, PNG, or WebP image up to 25 megapixels');
  }
}

function photoUrl(itemId, version) {
  return `/api/items/${itemId}/photo?v=${version}`;
}

function isStoredPhoto(url) {
  return typeof url === 'string' && PHOTO_URL.test(url);
}

function checkPhotoReference(values, current) {
  if (isStoredPhoto(values.image_url) && values.image_url !== current?.image_url) {
    throw new APIError('Uploaded photo URLs can only be retained on their original listing');
  }
}

async function writePhoto(db, itemId, photo, current, values) {
  // JSON-only edits and deletes remain compatible with databases awaiting migration.
  const removing = isStoredPhoto(current?.image_url) &&
    Object.hasOwn(values, 'image_url') && values.image_url !== current.image_url;
  if (!photo && !removing) return;
  try {
    await db.execute('DELETE FROM item_photos WHERE item_id=?', [itemId]);
    if (photo) {
      await db.execute('INSERT INTO item_photos (item_id,jpeg_bytes,version,updated_at) VALUES (?,?,?,?)',
        [itemId, photo.bytes, photo.version, new Date()]);
    }
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE' || /no such table: item_photos/.test(error.message)) {
      throw new APIError('Photo storage is not initialized; apply the item_photos database migration', 503);
    }
    throw error;
  }
}

module.exports = { receivePhoto, preparePhoto, photoUrl, isStoredPhoto, checkPhotoReference, writePhoto, MAX_PHOTO_BYTES };
