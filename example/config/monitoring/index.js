'use strict';

if (config.newrelic) {
  logging.info('Loading newrelic');
  require('newrelic');
}
