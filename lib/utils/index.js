'use strict';

var $ = require('../../');
var nunjucks = require('nunjucks');

module.exports = exports = require('util');

/*
 * Object hashing
 */
exports.hash = require('object-hash');

/*
 * Error tracing
 */
exports.traceError = function (err, expose) {
  if (expose && $.config.sentry_dsn) {
    new (require('raven')).Client($.config.sentry_dsn).captureError(err);
  }

  var shouldTrace = $.config.env === 'development' ||
    process.env.STACKTRACE && process.env.STACKTRACE.toString() === 'true';

  if (!shouldTrace) {
    return;
  }
  else if (err.stack) {
    global.console.error(err.stack);
  }
  else {
    global.console.trace(err);
  }
};

/*
 * Clone any object
 */
exports.clone = function (obj) {
  if (!obj || (typeof obj !== 'function' && typeof obj !== 'object')) {
    return obj;
  }
  return Array.isArray(obj) ? obj.slice() : Object.assign({}, obj);
};

/*
 * Check if objects are equal
 */
exports.isEqual = function (a, b) {
  return JSON.stringify(exports.clone(a)) === JSON.stringify(exports.clone(b));
};

/**
 * Render a template
 */
exports.template = function (template, options) {
  if (/[<>{}]/.test(template)) {
    return nunjucks.renderString(template, options);
  }

  template = template.replace(/(\.html|)+$/, '.html');
  return nunjucks.render(template, options);
};

/**
 * Returns a string version of the object's id
 * Param can be either a string, ObjectId or Mongoose object
 */
exports.getId = function (obj) {
  if (Array.isArray(obj)) {
    return obj.map(exports.getId);
  }
  if (obj) {
    if (typeof obj === 'string') {
      return obj;
    }
    else if (obj._id) {
      return obj._id.toString();
    }
    else if (obj.toHexString) {
      return obj.toHexString();
    }
    else if (obj.id) {
      return obj.id.toString();
    }
    else if (obj.toString) {
      var s = obj.toString();
      if (s !== '[object Object]') {
        return s;
      }
    }
  }
  return '';
};

/**
 * Returns a string version of the object's id if possible
 * Otherwise return the original object
 * Param can be anything
 */
exports.tryGetId = function (obj) {
  var result = exports.getId(obj);
  return exports.isObjectId(result) ? result : obj;
};

/**
 * Returns an ObjectId version of an id
 * Param can be either a string, ObjectId or Mongoose object
 */
exports.getObjectId = function (obj) {
  if (Array.isArray(obj)) {
    return obj.map(exports.getObjectId);
  }
  if (!obj) {
    return require('mongoose').Types.ObjectId();
  }
  obj = exports.getId(obj);
  if (exports.isObjectId(obj)) {
    return require('mongoose').Types.ObjectId(obj);
  }
  return undefined;
};

/**
 * Shortcut to mongoose.Types.ObjectId.isValid
 */
exports.isObjectId = function (id) {
  if (Array.isArray(id)) {
    return id.map(exports.isObjectId).filter(function (id) { return !id; }).length === 0;
  }
  return require('mongoose').Types.ObjectId.isValid(String(id));
};

/**
 * Check for equality of two id's
 * Params can be either strings, ObjectIds or Mongoose objects
 */
exports.idEquals = function (x, y, orderIndependent) {
  var xx = exports.getId(x);
  var yy = exports.getId(y);
  if (!Array.isArray(xx) || !Array.isArray(yy)) {
    return xx && yy && xx === yy || false;
  }
  else if (xx.length !== yy.length) {
    return false;
  }
  else if (orderIndependent) {
    return xx.length === yy.length && xx.filter(function (id) {
      return exports.containsId(yy, id);
    }).length === xx.length;
  }

  for (var i = 0; i < xx.length; i++) {
    if (!exports.idEquals(xx[i], yy[i])) {
      return false;
    }
  }

  return true;
};

/**
 * Check if an array contains an id
 */
exports.filterById = function (list, id) {
  return (list || []).filter(function (o) {
    return exports.idEquals(o, id);
  });
};

/**
 * Check if an array contains an id
 */
exports.containsId = function (list, id) {
  return !!exports.filterById(list, id).length;
};

/**
 * Flattens an object or array of objects to only _ids
 */
exports.flatten = function (obj) {
  if (Array.isArray(obj)) {
    return obj.map(exports.flatten);
  }
  if (obj && obj._id) {
    return exports.getId(obj);
  }
  return obj;
};

/**
 * Strip _ids
 */
exports.stripIds = function (obj) {
  if (Array.isArray(obj)) {
    return obj.map(exports.stripIds);
  }
  obj = new Object(obj);
  if (obj && obj._id) {
    delete obj._id;
  }
  return obj;
};

/**
 * Create valid regular expression from filter string
 */
exports.filterToRegExp = function (filter, exact, caseSensitive) {
  var string = filter.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&');
  if (exact) {
    string = '^'.concat(string, '$');
  }
  return new RegExp(string, caseSensitive ? '' : 'i');
};

/**
 * Parse relative date formats such as `+1D`, `-5Y` to an absolute date string
 */
exports.parseRelativeDate = function (query) {
  var methods = {
    ms: 'Milliseconds', s: 'Seconds', m: 'Minutes', h: 'Hours', D: 'Date', M: 'Month', Y: 'FullYear'
  };

  if (/^([+-][0-9]+)([YMDhms])$/.test(query)) {
    var value = parseInt(RegExp.$1, 10);
    var method = methods[RegExp.$2];

    var date = new Date();
    date['set'.concat(method)](date['get'.concat(method)]() + value);

    return date.toISOString();
  }
};

/**
 * Check for valid email
 */
var validateEmailRx = new RegExp('^[a-z0-9!#$%&\'*+/=?^_`{|}~-]+'.concat(
  '(?:\\.[a-z0-9!#$%&\'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+',
  '[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$'));
exports.validateEmail = function (email) {
  return validateEmailRx.test(email.toLowerCase());
};
