'use strict';

var $ = require('../../');
var config = $.config;

var express = require('express');
var app = module.exports = express();
var errors = require('./errors');

// Too busy response
errors['503'](app);

// Redirect favicon to statics
if (config.statics && config.static_redirects && config.static_redirects.length) {
  app.get(config.static_redirects, function (req, res) {
    res.redirect(config.statics.concat(req.path.replace(/^\//, '')));
  });
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
var body = require('body-parser');
app.use(body.json());
app.use(body.urlencoded({ extended: false }));
app.use(require('method-override')());

// Domain/origin configuration
app.use(require('./domains'));

// Load custom server setup
try {
  var custom = require(process.cwd().concat('/config/server'));
  if (custom) {
    custom(app, express);
  }
} catch (ex) {}

// Bootstrap routes
require('./router')(app);

// Handle not found
errors['404'](app);

// Crash handling
errors['500'](app);

// Boot the server
var server = app.listen(config.port, function () {
  $.logging.info(config.name.concat(' running on port ', config.port));
  // Handle shutdown
  process.on('SIGINT', function () {
    server.close();
    if (config.toobusy) {
      config.toobusy.shutdown();
    }
    process.exit();
  });
});
