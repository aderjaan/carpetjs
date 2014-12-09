'use strict';

/*
 * Load newrelic when configured to be loaded
 */

if (config.newrelic) {
  require('newrelic');
}
