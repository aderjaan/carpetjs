'use strict';

/*
 * Load mongoose and connect to mongodb
 */

var mongoose = module.exports = require('mongoose');

mongoose.NestedSet = function () {
  return require('mongoose-nested-set');
};

if (process.env.MONGOOSE_DEBUG && process.env.MONGOOSE_DEBUG.toString() === 'true') {
  mongoose.set('debug', true);
}

mongoose.connect(config.db);

// Load tenant protection and automatic history unless in migrations mode
if (process.env.NODE_ENV !== 'migrations') {
  require('./multitenancy')(mongoose);
  require('./history').save(mongoose);
}
