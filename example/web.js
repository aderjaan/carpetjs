'use strict';

var cluster = require('cluster');
if (cluster.isMaster && process.env.CLUSTERED === 'true') {
  require('os').cpus().forEach(cluster.fork);
}
else {

  // Initialize
  require('./config');

  // Initialize monitoring
  require('./config/monitoring');

  // Start the express server
  module.exports = require('./config/express');

}
