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
    app.use((err, req, res, next) => { // eslint-disable-line
      if (res.sentry) {
        console.log(`Sentry reference: ${res.sentry}`);
      }

      $.utils.traceError(err);

      return $.utils.api.error(res, err);
    });

    if ($.sentry) {
      app.use($.sentry.errorHandler());
    }
  },
  404 (app) {
    app.use((req, res, next) => next(new Error('not_found')));
  }
};
