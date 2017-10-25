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

  this.post('init', doc => {
    doc._original = doc.toObject();
  });

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

  if (!this.paths.date_created) {
    this.add({
      date_created: {
        type: Date,
        default: Date.now
      }
    });
  }

  if (!this.paths.date_updated) {
    this.add({
      date_updated: {
        type: Date,
        default: Date.now
      }
    });
  }

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

// TODO: until we have a solution for https://github.com/Automattic/mongoose/issues/4540
mongoose.Types.Embedded.prototype._markModified = mongoose.Types.Embedded.prototype.markModified;
mongoose.Types.Embedded.prototype.markModified = function (path) {
  if (this.__parentArray && !this.__parentArray._markModified) {
    return $.utils.traceError({
      message: 'markModified undefined on __parentArray',
      path,
      data: this
    });
  }

  return mongoose.Types.Embedded.prototype._markModified.call(this, path);
};

mongoose.connected = fn => {
  if (mongoose.connection.readyState === 1) {
    return fn();
  }

  return mongoose.connection.on('connected', fn);
};

mongoose.connect($.config.db, options);
