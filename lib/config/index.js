'use strict';

/*
 * Expose:
 *  - global.config, all configuration settings globally available
 *  - global.logging, logging functions globally available
 *  - global.utils, utils functions globally available
 *  - global.$, bootstrapper functions globally available
 *  - global._, lodash library globally available
 *  - global.async, async library globally available
 *  - global.mongoose, mongoose library globally available
 */

var root = require('./root');

var requireNoCache = function (module) {
  delete require.cache[require.resolve(module)];
  return require(module);
};

global._ = require('lodash');
global.async = require('async');

// Load default settings
var settings = require('./default.json');

// Extend settings with local default settings
try {
  settings = _.extend({}, settings, require(root.concat('config/default.json')));
} catch (ex) {}

// Extend settings with local environment settings
try {
  settings = _.extend({}, settings, require(root.concat('config/', process.env.NODE_ENV, '.json')));
} catch (ex) {}

// Load the settings into process.env if not yet defined
process.env = _.extend({}, settings, process.env);

global.config = {
  root: root,
  env: process.env.NODE_ENV,
  identifier: process.env.IDENTIFIER,
  name: process.env.NAME,
  port: process.env.PORT,
  https: process.env.HTTPS === 'true',
  newrelic: process.env.NEW_RELIC_ENABLED === 'true',
  toobusy: process.env.TOOBUSY_ENABLED === 'true',
  sentry_dsn: process.env.SENTRY_DSN,
  favicon: process.env.FAVICON,
  errors: {
    unknown: [500, 'Unknown error'],
    validation_failed: [422, 'Validation failed']
  }
};

// Setup logging
global.logging = require('./logging');

requireNoCache('./monitoring');

// Configuration extensions
config.db = requireNoCache('./db');
config.aws = requireNoCache('./aws');
config.notifications = requireNoCache('./notifications');

// Setup bootstrapper
global.$ = require('../bootstrap');

// Setup utils
global.utils = $.bootstrap(__dirname.concat('/../utils'));

// Load local utils
try {
  _.extend(global.utils, $.bootstrap(config.root.concat('utils')));
} catch (ex) {}

// Setup mongoose
global.mongoose = require('./mongoose');

// Load local config
try {
  requireNoCache(root.concat('config'));
} catch (ex) {}

// Catch uncaught exceptions
if (config.sentry_dsn) {
  require('raven').patchGlobal(config.sentry_dsn, function () {
    process.exit(1);
  });
}
else {
  process.on('uncaughtException', function (err) {
    logging.error('Uncaught exception', err);
    global.console.trace(err.stack);
    if (config.env !== 'test') {
      process.exit(1);
    }
  });
}
