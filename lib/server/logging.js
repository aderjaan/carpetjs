'use strict';

var $ = require('../../');

module.exports = function (app) {

  app.use(function (req, res, next) {
    req.__defineGetter__('log_text', function () {
      var url = req.originalUrl || req.url;
      var headers = ['silly', 'debug'].indexOf(process.env.LOGLEVEL_HTTP) < 0 ? '' : req.headers;
      var body = ['silly', 'debug'].indexOf(process.env.LOGLEVEL_HTTP) < 0 ? '' : req.body;

      return $.logging.format([req].concat(
        $.logging.http(req.method, res.statusCode, res.responseTime, url, {
          headers: headers,
          body: body
        })), 'http');
    });
    next();
  });

  app.use(require('express-winston').logger({
    transports: $.logging.logtypes.http.transports,
    msg: '{{req.log_text}}',
    meta: false
  }));

};
