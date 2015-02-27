'use strict';

var $ = require('../../');

/*
 * Load mongoose and connect to mongodb
 */

var mongoose = module.exports = require('mongoose');

mongoose.BaseSchema = function BaseSchema() {
  mongoose.Schema.apply(this, arguments);
  this.add({
    date_created: {
      type: Date,
      default: Date.now
    },
    date_updated: {
      type: Date
    }
  });
  this.pre('save', function (next) {
    this.date_updated = new Date();
    next();
  });
};

$.utils.inherits(mongoose.BaseSchema, mongoose.Schema);

if (process.env.MONGOOSE_DEBUG && process.env.MONGOOSE_DEBUG.toString() === 'true') {
  mongoose.set('debug', true);
}

// Load tenant protection and automatic history unless in migrations mode
if (process.env.NODE_ENV !== 'migrations') {
  mongoose.connect($.config.db);
}
