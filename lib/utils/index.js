const $ = require('../../');
const nunjucks = require('nunjucks');
const hash = require('object-hash');

module.exports = exports = require('util');

/*
 * Object hashing
 */
const replacer = (key, value) => {
  if (value instanceof RegExp) {
    return value.toString();
  }

  return value;
};

exports.hash = (o, s = JSON.stringify(o, replacer), p = JSON.parse(s)) => hash(p);

/*
 * Error tracing
 */
exports.traceError = (err, expose) => {
  if (expose && $.config.sentry_dsn) {
    new (require('raven')).Client($.config.sentry_dsn).captureError(err);
  }

  const shouldTrace = $.config.env === 'development' ||
    (process.env.STACKTRACE && process.env.STACKTRACE.toString() === 'true');

  if (!shouldTrace) {
    return;
  }
  else if (err.stack) {
    return global.console.error(err.stack);
  }

  return global.console.trace(err);
};

/*
 * Clone any object
 */
exports.clone = obj => {
  if (!obj || (typeof obj !== 'function' && typeof obj !== 'object')) {
    return obj;
  }

  return Array.isArray(obj) ? obj.slice() : Object.assign({}, obj);
};

/*
 * Check if objects are equal
 */
exports.isEqual = (a, b) => JSON.stringify(exports.clone(a)) === JSON.stringify(exports.clone(b));

/**
 * Render a template
 */
exports.template = (template, options) => {
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
exports.getId = obj => {
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
      const s = obj.toString();

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
exports.tryGetId = obj => {
  const result = exports.getId(obj);
  return exports.isObjectId(result) ? result : obj;
};

/**
 * Returns an ObjectId version of an id
 * Param can be either a string, ObjectId or Mongoose object
 */
exports.getObjectId = obj => {
  if (Array.isArray(obj)) {
    return obj.map(exports.getObjectId);
  }
  else if (!obj) {
    return new (require('mongoose').Types.ObjectId)();
  }

  obj = exports.getId(obj);

  if (exports.isObjectId(obj)) {
    return new (require('mongoose').Types.ObjectId)(obj);
  }

  return undefined;
};

/**
 * Shortcut to mongoose.Types.ObjectId.isValid
 */
exports.isObjectId = id => {
  if (Array.isArray(id)) {
    return id.every(exports.isObjectId);
  }

  return require('mongoose').Types.ObjectId.isValid(String(id));
};

/**
 * Check for equality of two id's
 * Params can be either strings, ObjectIds or Mongoose objects
 */
exports.idEquals = (x, y, orderIndependent) => {
  const xx = exports.getId(x);
  const yy = exports.getId(y);

  if (!Array.isArray(xx) || !Array.isArray(yy)) {
    return (xx && yy && xx === yy) || false;
  }
  else if (xx.length !== yy.length) {
    return false;
  }
  else if (orderIndependent) {
    return xx.length === yy.length && xx.every(id => exports.containsId(yy, id));
  }

  for (let i = 0; i < xx.length; i += 1) {
    if (!exports.idEquals(xx[i], yy[i])) {
      return false;
    }
  }

  return true;
};

/**
 * Filter array by id
 */
exports.filterById = (list = [], id) => list.filter(o => exports.idEquals(o, id));

/**
 * Check if an array contains an id
 */
exports.containsId = (list = [], id) => list.some(o => exports.idEquals(o, id));

/**
 * Flattens an object or array of objects to only _ids
 */
exports.flatten = obj => {
  if (Array.isArray(obj)) {
    return obj.map(exports.flatten);
  }
  else if (obj && obj._id) {
    return exports.getId(obj);
  }

  return obj;
};

/**
 * Strip _ids
 */
exports.stripIds = obj => {
  if (Array.isArray(obj)) {
    return obj.map(exports.stripIds);
  }

  obj = Object.assign({}, obj);

  if (obj && obj._id) {
    delete obj._id;
  }

  return obj;
};

/**
 * Create valid regular expression from filter string
 */
exports.filterToRegExp = (filter, exact, caseSensitive) => {
  let string = filter.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&');

  if (exact) {
    string = `^${string}$`;
  }

  return new RegExp(string, caseSensitive ? '' : 'i');
};

/**
 * Flatten array
 */
exports.flattenArray = arr => arr.reduce((a, b) =>
  a.concat(Array.isArray(b) ? exports.flattenArray(b) : b), []);

/**
 * Parse relative date formats such as `+1D`, `-5Y` to an absolute date string
 */
exports.parseRelativeDate = query => {
  const methods = {
    ms: 'Milliseconds',
    s: 'Seconds',
    m: 'Minutes',
    h: 'Hours',
    D: 'Date',
    M: 'Month',
    Y: 'FullYear'
  };

  if (/^([+-][0-9]+)([YMDhms])$/.test(query)) {
    const value = parseInt(RegExp.$1, 10);
    const method = methods[RegExp.$2];

    const date = new Date();
    date[`set${method}`](date[`get${method}`]() + value);

    return date.toISOString();
  }
};

/**
 * Check for valid email
 */
const validateEmailRx = new RegExp([
  '^[a-z0-9!#$%&\'*+/=?^_`{|}~-]+',
  '(?:\\.[a-z0-9!#$%&\'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+',
  '[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$'].join(''));

exports.validateEmail = email => validateEmailRx.test(email.toLowerCase());
