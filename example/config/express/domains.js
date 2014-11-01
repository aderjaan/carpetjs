'use strict';

module.exports = function (req, res, next) {

  if (config.https) {
    if (req.protocol !== 'https') {
      return res.redirect('https://'.concat(req.headers.host, req.url));
    }
  }

  res.header('X-Powered-By', 'MyApp');
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,OPTIONS,DELETE');

  res.header('Access-Control-Allow-Headers', [
    'X-HTTP-Method-Override',
    'Content-Type',
    'Accept',
    'X-Auth-Token'
  ].join(', '));

  // Intercept OPTIONS method
  if (req.method === 'OPTIONS') {
    res.status(204).end();
  }
  else {
    next();
  }

};
