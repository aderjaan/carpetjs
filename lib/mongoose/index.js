const $ = require('../../');
const inherits = require('util').inherits;

/*
 * Load mongoose and connect to mongodb
 */

const mongoose = module.exports = require('mongoose');

if (global.Promise) {
  mongoose.Promise = global.Promise;
}

const _Schema = mongoose.Schema;
mongoose.Schema = function Schema (...args) {
  _Schema.apply(this, args);

  // Save lowercase value for shadow paths, used for sorting
  Object.keys(this.paths).forEach(key => {
    const path = this.paths[key];
    const shadow = path && path.options && path.options.shadow;

    if (!shadow) {
      return;
    }

    this.pre('save', function (next) {
      const value = this[key];

      if (typeof value !== 'undefined') {
        this[shadow] = value.toString().toLowerCase().slice(0, 100);
      }

      next();
    });
  });
};

inherits(mongoose.Schema, _Schema);

Object.keys(_Schema).forEach(key => mongoose.Schema[key] = _Schema[key]);

mongoose.BaseSchema = function BaseSchema (...args) {
  mongoose.Schema.apply(this, args);

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

  this.index({ date_created: -1 });
  this.index({ date_updated: -1 });

  this.pre('save', function (next) {
    this.date_updated = new Date();
    next();
  });
};

inherits(mongoose.BaseSchema, mongoose.Schema);

if (process.env.MONGOOSE_DEBUG && process.env.MONGOOSE_DEBUG.toString() === 'true') {
  mongoose.set('debug', true);
}

const options = {};

if ($.config.db.indexOf(',') >= 0 && $.config.db.indexOf('replicaSet=') < 0) {
  options.mongos = true;
}

mongoose.connect($.config.db, options);
