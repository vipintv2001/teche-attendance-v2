const { verifyAdminToken } = require('../utils/cookieUtils');

function extractAdminToken(req) {
  if (req.cookies?.adminToken) return req.cookies.adminToken;
  if (req.headers['x-admin-token']) return req.headers['x-admin-token'];
  const authHeader = req.headers.authorization;
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return null;
}

function verifyAdminAuth(req, res, next) {
  const token = extractAdminToken(req);
  if (!verifyAdminToken(token)) {
    return res.status(401).json({
      authenticated: false,
      error: 'Admin authentication required. Please log in.'
    });
  }
  req.isAdmin = true;
  return next();
}

module.exports = verifyAdminAuth;
module.exports.extractAdminToken = extractAdminToken;
