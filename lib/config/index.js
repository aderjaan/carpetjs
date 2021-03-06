const $ = require('../../');

// Load default settings
let settings = require('./default.json');

const extend = o => {
  if (typeof o === 'string') {
    try {
      o = require(o);
    }
    catch (ex) {
      if (ex instanceof SyntaxError) {
        global.console.warn('Not a valid JSON file:', o);
      }
      o = {};
    }
  }

  settings = Object.assign({}, settings, o);
  return settings;
};

// Extend settings with local default settings
extend(`${process.cwd()}/config/default.json`);

// Extend settings with local environment settings
extend(`${process.cwd()}/config/${process.env.NODE_ENV || settings.NODE_ENV}.json`);

// Load the settings into process.env if not yet defined
process.env = extend(process.env);

const env = process.env.NODE_ENV;
const config = {
  env,
  identifier: process.env.IDENTIFIER,
  name: process.env.NAME,
  port: process.env.PORT,
  https: process.env.HTTPS && process.env.HTTPS.toString() === 'true',
  newrelic: process.env.NEW_RELIC_ENABLED && process.env.NEW_RELIC_ENABLED.toString() === 'true',
  sentry_dsn: process.env.SENTRY_DSN,
  sentry_config: {},
  statics: process.env.STATICS,
  static_redirects: ['/favicon.ico', '/robots.txt'],
  json: {},
  cache: [process.env.REDISCLOUD_URL ? 'redis' : 'memory'],
  headers: {
    'X-Powered-By': () => config.name,
    Expires: -1,
    'Access-Control-Allow-Origin': ['*'],
    'Access-Control-Allow-Methods': ['GET', 'PUT', 'POST', 'OPTIONS', 'DELETE'],
    'Access-Control-Allow-Headers': [
      'X-HTTP-Method-Override',
      'Content-Type',
      'Accept',
      'X-Auth-Token',
      'X-Organization-Name'
    ],
    'Access-Control-Expose-Headers': [
      'X-Pagination-Page-Count',
      'X-Pagination-Total-Count',
      'X-Pagination-Current-Page',
      'X-Pagination-Per-Page'
    ]
  },
  request_limit: process.env.REQUEST_LIMIT || '1mb',
  templates: {
    path: `${process.cwd()}${process.env.TEMPLATE_PATH || '/templates'}`,
    autoescape: true,
    trimBlocks: true,
    noCache: env === 'development'
  },
  errors: {
    unknown: [500, 'Unknown error'],
    database_error: [500, 'Database error'],
    application_error: [500, 'Application error'],
    not_found: [404, 'The requested url looks to be incorrect'],
    over_capacity: [503, 'Our server is over capacity, please try again in a minute'],
    multiple_errors: [500, 'Multiple errors'],
    bad_request: [400, 'The request is invalid'],
    validation_failed: [422, 'Validation failed'],
    not_authenticated: [401, 'User not authenticated'],
    duplicate_unique_fields: [409, 'An item already exists with the same properties'],
    remove_prevented: [422, 'There are dependencies that prevent this item from being removed'],
    remove_unconfirmed: [449, 'There are dependencies that must be confirmed to be removed']
  }
};

const crash = err => {
  $.logging.error('Uncaught exception:', err.message, err.stack);
  process.exit(1);
};

if (config.sentry_dsn) {
  $.sentry = require('raven');
  $.sentry.config(config.sentry_dsn, config.sentry_config).install(crash);
}
else {
  process.on('uncaughtException', crash);
}

// Configure templates
require('nunjucks').configure(config.templates.path, config.templates);

// Load newrelic monitoring
if (config.newrelic) {
  require('newrelic');
}

// Configuration extensions
config.db = require('./db')(config);

config.reload = () => $.loadConfig();

module.exports = config;
