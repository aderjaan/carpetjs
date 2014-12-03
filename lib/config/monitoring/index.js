'use strict';

/*
 * Load newrelic when configured to be loaded
 */

if (config.newrelic) {
  logging.info('Loading newrelic');
  require('newrelic');
}
