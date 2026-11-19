const Settings = require('../models/Settings');

/**
 * Computes Haversine distance in meters between two WGS84 coordinates.
 */
function haversineDistanceMeters(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const EARTH_RADIUS_METERS = 6371000;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) *
    Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

function normalizeIp(rawIp) {
  if (!rawIp || typeof rawIp !== 'string') return '';
  return rawIp.replace(/^::ffff:/i, '').trim();
}

function extractClientIp(req) {
  const forwarded = req.headers['x-forwarded-for']?.split(',')[0]?.trim();
  return normalizeIp(forwarded || req.ip || '');
}

async function getEffectiveOfficeIp() {
  try {
    const settings = await Settings.findOne({ key: 'global' }).lean();
    if (settings && typeof settings.officePublicIp === 'string' && settings.officePublicIp.trim()) {
      return normalizeIp(settings.officePublicIp);
    }
  } catch (err) {
    console.error('Failed to read officePublicIp from Settings:', err.message);
  }
  return normalizeIp(process.env.OFFICE_PUBLIC_IP || '');
}

async function verifyOfficePresence(req, res, next) {
  try {
    const clientIp = extractClientIp(req);
    const officePublicIp = await getEffectiveOfficeIp();

    // Primary Check: Institute Wi-Fi Public IP
    if (officePublicIp && clientIp === officePublicIp) {
      req.locationMethod = 'OFFICE_WIFI';
      return next();
    }

    // Fallback Check: 100m GPS Geofence (for power cuts / Wi-Fi outages)
    const { lat, lng } = req.body || {};
    const parsedLat = Number(lat);
    const parsedLng = Number(lng);
    const officeLat = Number(process.env.OFFICE_LAT);
    const officeLng = Number(process.env.OFFICE_LNG);
    const allowedRadius = Number(process.env.ALLOWED_RADIUS_METERS || 100);

    const hasValidCoords =
      lat !== undefined &&
      lng !== undefined &&
      lat !== null &&
      lng !== null &&
      lat !== '' &&
      lng !== '' &&
      Number.isFinite(parsedLat) &&
      Number.isFinite(parsedLng) &&
      Number.isFinite(officeLat) &&
      Number.isFinite(officeLng);

    if (hasValidCoords) {
      const distance = haversineDistanceMeters(parsedLat, parsedLng, officeLat, officeLng);
      if (distance <= allowedRadius) {
        req.locationMethod = 'OFFICE_GPS';
        return next();
      }
    }

    const actionLabel = req.originalUrl?.includes('check-out') || req.path?.includes('check-out')
      ? 'Check-Out'
      : 'Check-In';
    return res.status(403).json({
      error: `You must be connected to the TechE Institute Wi-Fi or within 100m of campus to ${actionLabel}.`
    });
  } catch (err) {
    console.error('verifyOfficePresence error:', err);
    return res.status(500).json({ error: 'Failed to verify office presence.' });
  }
}

module.exports = {
  verifyOfficePresence,
  extractClientIp,
  normalizeIp,
  haversineDistanceMeters,
  getEffectiveOfficeIp
};
