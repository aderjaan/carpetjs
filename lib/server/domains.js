'use strict';

module.exports = function (req, res, next) {

  res.header('X-Powered-By', config.name);

  if (config.https) {
    if (req.protocol === 'https') {
      res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }
    else {
      return res.redirect('https://'.concat(req.headers.host, req.url));
    }
  }

  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,OPTIONS,DELETE');

  res.header('Access-Control-Allow-Headers', [
    'X-HTTP-Method-Override',
    'Content-Type',
    'Accept',
    'X-Auth-Token',
    'appId', // NOT USED ANYMORE BUT ALLOW FOR LEGACY CLIENTS
    'orgId'  // NOT USED ANYMORE BUT ALLOW FOR LEGACY CLIENTS
  ].join(', '));

  // Intercept OPTIONS method
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  res.header('Access-Control-Expose-Headers', [
    'X-Pagination-Page-Count',
    'X-Pagination-Total-Count',
    'X-Pagination-Current-Page',
    'X-Pagination-Per-Page'
  ].join(', '));

  next();

};