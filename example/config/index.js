'use strict';

global._ = require('lodash');
global.async = require('async');

// Load defaults into process.env
process.env = _.extend(require('./default.json'), process.env);

// Mimics process.env by looking at a local JSON file
try {
  _.extend(process.env, require('./'.concat(process.env.NODE_ENV, '.json')));
}
catch (ex) {}

// Global configuration
global.config = {
  env: process.env.NODE_ENV,
  name: process.env.NAME,
  port: process.env.PORT,
  root: __dirname.replace(/config$/, ''),
  https: process.env.HTTPS === 'true',
  newrelic: process.env.NEW_RELIC_ENABLED === 'true',
  upload_dir: require('os').tmpdir(),
  STATIC_USER: process.env.STATIC_USER
};

config.db = process.env.MONGOHQ_URL || process.env.MONGODB_URL || 'mongodb://'.concat(
  process.env.WERCKER_MONGODB_HOST || process.env.MONGODB_HOST || 'localhost', '/',
  process.env.MONGODB_DB || 'myapp'.concat(config.env === 'test' ? '_test' : ''));

// Setup bootstrapper
global.$ = require('carpetjs').bootstrap;

// Inject the authorization framework by overriding the bootstrapper's require
$.require = require('./authorization');

// Setup utils
global.utils = $.bootstrap(config.root.concat('utils'));

// Setup logging
global.logging = require('./logging');

// Setup mongoose
global.mongoose = require('mongoose');
