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
      type: Date,
      default: Date.now
    }
  });

  this.pre('save', function (next) {
    this.date_updated = new Date();
    next();
  });

  // Save lowercase value for shadow paths, used for sorting
  var self = this;
  Object.keys(this.paths).forEach(function (key) {
    var shadow = self.paths[key] && self.paths[key].options && self.paths[key].options.shadow;
    if (shadow) {
      self.pre('save', function (next) {
        var value = this[key];
        if (typeof value !== 'undefined') {
          this[shadow] = value.toString().toLowerCase();
        }
        next();
      });
    }
  });

};

$.utils.inherits(mongoose.BaseSchema, mongoose.Schema);

if (process.env.MONGOOSE_DEBUG && process.env.MONGOOSE_DEBUG.toString() === 'true') {
  mongoose.set('debug', true);
}

mongoose.connect($.config.db);
