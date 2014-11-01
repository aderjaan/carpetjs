'use strict';

module.exports = function (app) {

  app.use(function (req, res, next) {
    req.__defineGetter__('log_text', function () {
      return logging.format([
        req,
        logging.cap(req.method, 7),
        logging.cap(res.statusCode, 3, 1),
        logging.cap(res.responseTime, 4, 1).concat('ms'),
        req.url
      ], 'http');
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
