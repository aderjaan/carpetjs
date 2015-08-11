'use strict';

var $ = require('../../');

module.exports = {
  503: function (app) {
    if ($.config.toobusy) {
      app.use(function (req, res, next) {
        var err = null;
        if ($.config.toobusy()) {
          err = new Error('over_capacity');
        }
        next(err);
      });
    }
  },
  500: function (app) {
    if ($.config.sentry_dsn) {
      require('raven').middleware.express($.config.sentry_dsn);
    }
    app.use(function (err, req, res, next) {

      // prevent jshint (specific version) to complain about unused variable
      next = function () {};

      if ($.config.sentry_dsn) {
        new (require('raven')).Client($.config.sentry_dsn).captureError(err);
      }
      else if (err.stack) {
        global.console.error(err.stack);
      }
      else {
        global.console.trace(err);
      }

      return $.utils.api.error(res, err);
    });
  },
  404: function (app) {
    app.use(function (req, res, next) {
      var err = new Error('not_found');
      next(err);
    });
  }
};
