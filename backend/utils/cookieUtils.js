const crypto = require('crypto');

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Builds HttpOnly, Secure (in HTTPS/production), SameSite=Lax cookie options.
 * Preserves iOS Safari 16.4+ compatibility across reverse proxies.
 */
function getCookieOptions(req, maxAgeMs = ONE_YEAR_MS) {
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    process.env.NODE_ENV === 'production';

  const secure =
    process.env.COOKIE_SECURE === 'false'
      ? false
      : process.env.COOKIE_SECURE === 'true'
        ? true
        : isHttps;

  return {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: maxAgeMs,
    path: '/'
  };
}

function setDeviceTokenCookie(req, res, deviceToken) {
  res.cookie('deviceToken', deviceToken, getCookieOptions(req, ONE_YEAR_MS));
}

function getAdminSecret() {
  return (
    process.env.ADMIN_COOKIE_SECRET ||
    process.env.ADMIN_PASSWORD ||
    'teche_default_admin_secret_change_me'
  );
}

function createAdminToken(username) {
  const issuedAt = Date.now().toString();
  const payload = `${username}:${issuedAt}`;
  const signature = crypto
    .createHmac('sha256', getAdminSecret())
    .update(payload)
    .digest('hex');
  return `${Buffer.from(payload).toString('base64url')}.${signature}`;
}

function verifyAdminToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return false;
  }
  const [encodedPayload, providedSig] = token.split('.');
  if (!encodedPayload || !providedSig) return false;

  let payload;
  try {
    payload = Buffer.from(encodedPayload, 'base64url').toString('utf8');
  } catch {
    return false;
  }

  const expectedSig = crypto
    .createHmac('sha256', getAdminSecret())
    .update(payload)
    .digest('hex');

  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length) return false;
  if (!crypto.timingSafeEqual(a, b)) return false;

  const [username, issuedAtStr] = payload.split(':');
  const expectedUsername = process.env.ADMIN_USERNAME || 'admin';
  if (username !== expectedUsername) return false;

  const issuedAt = Number(issuedAtStr);
  if (Number.isNaN(issuedAt) || Date.now() - issuedAt > ONE_DAY_MS * 7) {
    return false;
  }

  return true;
}

module.exports = {
  ONE_YEAR_MS,
  ONE_DAY_MS,
  getCookieOptions,
  setDeviceTokenCookie,
  createAdminToken,
  verifyAdminToken
};

