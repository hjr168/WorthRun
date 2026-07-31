'use strict';

const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function buildMediaDerivative({ mimeType, dimensions, sharpAvailable, width, height }) {
  if (sharpAvailable) return { mimeType: 'image/jpeg', extension: 'jpg', width, height };
  return {
    mimeType,
    extension: EXTENSIONS[mimeType],
    width: dimensions?.width || null,
    height: dimensions?.height || null,
  };
}

module.exports = { buildMediaDerivative };
