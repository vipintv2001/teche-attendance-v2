const requireAdminAuth = require('./requireAdminAuth');

module.exports = requireAdminAuth;
module.exports.extractAdminToken = requireAdminAuth.extractAdminToken;
