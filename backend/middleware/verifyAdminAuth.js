const { verifyAdminToken } = require('../utils/cookieUtils');

function verifyAdminAuth(req, res, next) {
  const token = req.cookies?.adminToken;
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

