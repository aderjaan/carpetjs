'use strict';

var $ = require('../../');

module.exports = function (req, res, next) {

  if ($.config.https) {
    if (req.protocol === 'https') {
      res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }
    else {
      return res.redirect('https://'.concat(req.headers.host, req.url));
    }
  }

  Object.keys($.config.headers).forEach(function (key) {
    var value = $.config.headers[key];
    if (typeof value === 'function') {
      value = value();
    }
    if (Array.isArray(value)) {
      value = value.join(', ');
    }

    if (/expose/i.test(key) && req.method === 'OPTIONS') {
      return;
    }

    res.header(key, value);
  })

  // Intercept OPTIONS method
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  next();

};
