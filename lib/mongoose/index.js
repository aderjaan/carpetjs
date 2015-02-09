'use strict';

var $ = require('../../');

/*
 * Load mongoose and connect to mongodb
 */

var mongoose = module.exports = require('mongoose');

mongoose.BaseSchema = function BaseSchema() {
  mongoose.Schema.apply(this, arguments);
  this.add({
    updated_by: {
      type: mongoose.Schema.ObjectId,
      ref: 'shared.User'
    },
    date_created: {
      type: Date,
      default: Date.now
    },
    date_updated: {
      type: Date
    }
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
