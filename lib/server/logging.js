const $ = require('../../');

module.exports = app => {
  app.use((req, res, next) => {
    Object.defineProperty(req, 'log_text', {
      get () {
        const url = req.originalUrl || req.url;
        let json;

        if (['silly', 'debug'].indexOf(process.env.LOGLEVEL_HTTP) >= 0) {
          json = {};
          json.headers = req.headers;
          json.request = req.body;

          if (req.responseData) {
            json.response = req.responseData;
          }
        }

        return $.logging.format([req].concat(
          $.logging.http(req.method, res.statusCode, res.responseTime, url, json)), 'http');
      }
    });

    next();
  });

  app.use(require('express-winston').logger({
    transports: $.logging.logtypes.http.transports,
    msg: '{{req.log_text}}',
    meta: false
  }));
};
