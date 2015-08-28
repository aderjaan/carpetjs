'use strict';

var $ = require('../../');

// Load default settings
var settings = require('./default.json');

var extend = function (o) {
  if (typeof o === 'string') {
    try {
      o = require(o);
    }
    catch (ex) {
      global.console.warn('Not a valid JSON file:', o);
    }
  }

  settings = $.utils.extend({}, settings, o);
  return settings;
};

// Extend settings with local default settings
extend(process.cwd().concat('/config/default.json'));

// Extend settings with local environment settings
extend(process.cwd().concat('/config/', process.env.NODE_ENV || settings.NODE_ENV, '.json'));

// Load the settings into process.env if not yet defined
process.env = extend(process.env);

var config = {
  env: process.env.NODE_ENV,
  identifier: process.env.IDENTIFIER,
  name: process.env.NAME,
  port: process.env.PORT,
  https: process.env.HTTPS && process.env.HTTPS.toString() === 'true',
  newrelic: process.env.NEW_RELIC_ENABLED && process.env.NEW_RELIC_ENABLED.toString() === 'true',
  sentry_dsn: process.env.SENTRY_DSN,
  statics: process.env.STATICS,
  static_redirects: ['/favicon.ico', '/robots.txt'],
  template_path: process.cwd().concat(process.env.TEMPLATE_PATH || '/templates'),
  errors: {
    unknown: [500, 'Unknown error'],
    application_error: [500, 'Application error'],
    not_found: [404, 'The requested url looks to be incorrect'],
    over_capacity: [503, 'Our server is over capacity, please try again in a minute'],
    multiple_errors: [500, 'Multiple errors'],
    bad_request: [400, 'The request is invalid'],
    validation_failed: [422, 'Validation failed'],
    not_authenticated: [401, 'User not authenticated']
  }
};

// Load newrelic monitoring
if (config.newrelic) {
  require('newrelic');
}

// Configuration extensions
config.db = require('./db')(config);

// Catch uncaught exceptions
if (config.sentry_dsn) {
  require('raven').patchGlobal(config.sentry_dsn, function (err) {
    global.console.error('Uncaught exception', err);
  });
}
else {
  process.on('uncaughtException', function (err) {
    global.console.error('Uncaught exception', err);
    global.console.trace(err.stack);
  });
}

config.reload = function () {
  $.loadConfig();
};

module.exports = config;
