const $ = require('../../');

module.exports = {
  503 (app) {
    if (!$.config.toobusy) {
      return;
    }

    app.use((req, res, next) => {
      let err = null;

      if ($.config.toobusy()) {
        err = new Error('over_capacity');
      }

      next(err);
    });
  },
  500 (app) {
    if ($.config.sentry_dsn) {
      require('raven').middleware.express($.config.sentry_dsn);
    }

    app.use((err, req, res, next) => { // eslint-disable-line
      $.utils.traceError(err);
      return $.utils.api.error(res, err);
    });
  },
  404 (app) {
    app.use((req, res, next) => next(new Error('not_found')));
  }
};
