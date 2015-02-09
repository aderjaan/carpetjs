'use strict';

var $ = require('../../');

// Load default settings
var settings = require('./default.json');

// Extend settings with local default settings
try {
  settings = $.utils.extend({}, settings, require(process.cwd().concat('/config/default.json')));
} catch (ex) {}

// Extend settings with local environment settings
try {
  var path = process.cwd().concat('/config/', process.env.NODE_ENV || settings.NODE_ENV, '.json');
  settings = $.utils.extend({}, settings, require(path));
} catch (ex) {}

// Load the settings into process.env if not yet defined
process.env = $.utils.extend({}, settings, process.env);

var config = {
  env: process.env.NODE_ENV,
  identifier: process.env.IDENTIFIER,
  name: process.env.NAME,
  port: process.env.PORT,
  https: process.env.HTTPS && process.env.HTTPS.toString() === 'true',
  newrelic: process.env.NEW_RELIC_ENABLED && process.env.NEW_RELIC_ENABLED.toString() === 'true',
  toobusy: process.env.TOOBUSY_ENABLED && process.env.TOOBUSY_ENABLED.toString() === 'true',
  sentry_dsn: process.env.SENTRY_DSN,
  favicon: process.env.FAVICON,
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
  require('raven').patchGlobal(config.sentry_dsn, function () {
    process.exit(1);
  });
}
else {
  process.on('uncaughtException', function (err) {
    $.logging.error('Uncaught exception', err);
    global.console.trace(err.stack);
    if (config.env !== 'test') {
      process.exit(1);
    }
  });
}

config.reload = function () {
  $.loadConfig();
};

module.exports = config;
