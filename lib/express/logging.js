'use strict';

module.exports = function (app) {

  app.use(function (req, res, next) {
    req.__defineGetter__('log_text', function () {
      return logging.format([req].concat(
        logging.http(req.method, res.statusCode, res.responseTime, req.url)),
        'http');
    });

    res.locals.req = req;
    next();

  });

  app.use(require('express-winston').logger({
    transports: logging.logtypes.http.transports,
    msg: '{{req.log_text}}',
    meta: false
  }));

};
