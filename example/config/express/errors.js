'use strict';

module.exports = function (app) {

  app.use(function (req, res, next) {
    var err = new Error('The requested item does not exist');
    err.status = 404;
    next(err);
  });

  app.use(function (err, req, res, next) {

    var defaultMessage = 'Application error';
    next = function () {};

    if (!err.status) {
      logging.error('Uncaught application exception %s', err.message);
      global.console.trace(err);
      err.message = defaultMessage;
    }

    var message = { message: err.message || defaultMessage };
    var handle = 'render';
    var args = ['error', message];

    if (/json/i.test(req.headers['content-type'])) {
      handle = 'json';
      args = [message];
    }

    res.status(err.status || 500)[handle].apply(res, args);
  });

};
