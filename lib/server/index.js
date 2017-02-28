const $ = require('../../');
const express = require('express');
const errors = require('./errors');
const body = require('body-parser');

const config = $.config;
const app = module.exports = express();

if ($.sentry) {
  app.use($.sentry.requestHandler());
}

// Too busy response
errors['503'](app);

// Redirect favicon to statics
if (config.statics && config.static_redirects && config.static_redirects.length) {
  app.get(config.static_redirects, (req, res) =>
    res.redirect(`${config.statics}${req.path.replace(/^\//, '')}`));
}

app.enable('trust proxy');

app.use(require('compression')());

// JSON replacer / spaces settings
require('./json')(app);

// Handle view rendering
require('./views')(app);

// Setup logging
require('./logging')(app);

// Body parser
app.use(body.json({ limit: $.config.request_limit }));
app.use(body.urlencoded({ extended: false, limit: $.config.request_limit }));
app.use(require('method-override')());

// Domain/origin configuration
app.use(require('./domains'));

// Load custom server setup
try {
  const custom = require(`${process.cwd()}/config/server`);
  if (custom) {
    custom(app, express);
  }
}
catch (ex) {}

// Bootstrap routes
require('./router')(app);

// Handle not found
errors['404'](app);

// Crash handling
errors['500'](app);

// Boot the server
const server = app.listen(config.port, () => {
  $.logging.info(`${config.name} running on port ${config.port}`);
  // Handle shutdown
  process.on('SIGINT', () => {
    server.close();
    if (config.toobusy) {
      config.toobusy.shutdown();
    }
    process.exit();
  });
});
