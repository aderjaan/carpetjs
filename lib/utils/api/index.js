'use strict';

var $ = require('../../../');

var MONGOOSE_MESSAGES = {
  required: '%s is required',
  min: '%s below minimum',
  max: '%s above maximum',
  enum: 'not an allowed value for %s'
};

var mapErrors = function (e) {
  return e && e.message || e;
};

module.exports.parseError = function (err) {
  if (typeof err === 'string') {
    err = { name: err };
  }
  else if (typeof err === 'object' && !$.config.errors[err.name]) {
    if (err.name === 'ValidationError') {
      err = {
        name: 'validation_failed',
        errors: Object.keys(err.errors).map(function (key) {
          var type = err.errors[key].kind || err.errors[key].type;
          var string = MONGOOSE_MESSAGES[type];
          if (string) {
            var path = err.errors[key].path.replace(/_/g, ' ');
            string = $.utils.format(string, path);
            return string[0].toUpperCase().concat(string.substring(1));
          }
          return err.errors[key].message;
        })
      };
    }
    else if (err.name === 'CastError') {
      err = {
        name: 'validation_failed',
        errors: ['Invalid value for field '.concat(err.path, '')]
      };
    }
    else if (err.name === 'MongoError') {
      err = {
        name: 'database_error',
        internal_error: err.$err
      };
    }
    else if (err.errors) {
      err = {
        name: err.message,
        errors: err.errors.map(mapErrors)
      };
    }
    else if (err.name && err.name !== 'Error' && err.message) {
      return {
        name: err.name,
        errors: [err.message],
        httpcode: err.httpcode || 500
      };
    }
    else {
      err = { name: err.message };
    }
  }
  else if (Array.isArray(err)) {
    err = {
      name: 'multiple_errors',
      errors: err.map(mapErrors)
    };
  }

  var def = $.config.errors[err.name] || $.config.errors.unknown;

  err.httpcode = def[0] || 500;
  err.message = def[1];

  return err;
};

/**
 * Writes the error to the response and sets the httpcode
 *
 * @param {object} res
 * @param {object} err
 */
module.exports.error = function (res, err) {

  if (err.status) {
    if (err.status === 404) {
      err = new Error('not_found');
    }
  }

  var parsed = module.exports.parseError(err);

  $.logging.error(parsed);

  if (parsed.name === 'unknown') {
    $.utils.traceError(err, true);
  }

  delete parsed.internal_error;

  var json = /^\/api\//.test(res.req.originalUrl) ||
    res.req && res.req.headers && /json/i.test(res.req.headers['content-type']);

  var handle = json ? 'json' : 'render';
  var args = json ? [parsed] : ['error', parsed];

  return res.status(parsed.httpcode)[handle].apply(res, args);
};

/**
 * Writes a 200 to the response, possibly with data
 *
 * @param {object} res
 * @param {object} data
 *
 */
module.exports.success = function (res, data) {
  if (!data) {
    return res.end();
  }
  return res.json(data);
};

/**
 * Wraps around callbacks that may lead into an error
 * Being sent to the response
 * 'fn' is either a custom callback or a boolean
 * Set 'fn' to `true` to prevent responding with data
 * 'fn' can also be a base api containing a _mapper function
 * in which case _mapper will be used to map the data
 */
module.exports.wrap = function (res, fn) {
  return function (err, data) {
    if (err) {
      return module.exports.error(res, err);
    }

    else if (typeof fn === 'function') {
      return fn && fn.apply(res, Array.prototype.slice.call(arguments, 1));
    }
    else if (fn === true) {
      return module.exports.success(res);
    }

    else if (res.req.method === 'GET' && typeof data === 'undefined') {
      return module.exports.error(res, 'not_found');
    }
    else if (typeof data !== 'object') {
      return module.exports.success(res);
    }
    else {
      data = module.exports.toJSON(data);
    }

    if (fn && fn._mapper) {
      return fn._mapper(res.req, data, function (data) {
        module.exports.success(res, data);
      }, false, true);
    }

    return module.exports.success(res, data);
  };
};

/**
 * Shortcut for rendering error pages
 */
module.exports.renderError = function (res, code, message, title) {
  var level = {
    200: 'info',
    400: 'warn',
    500: 'error'
  };
  $.logging[level[code] || 'warn'](message);
  return res.status(code).render('error', { message: message, title: title });
};

/**
 * Maps data to json, including getters/virtuals if available
 *
 * @param {object} data
 */
module.exports.toJSON = function (data) {
  if (Array.isArray(data)) {
    return data.map(function (item) {
      return module.exports.toJSON(item);
    });
  }
  return data && data.toObject ? data.toObject({ getters: true }) : data;
};

/**
 * Creates or updates the params object based on req.query
 *
 * @param {object} params
 * @param {object} req
 */
module.exports.params = function (req, params) {
  params = params || {};
  params.query = req.query;
  params.conditions = params.conditions || {};

  var keys = 'type filter limit page sort_by sort_type pagination_headers fields'.split(' ');

  keys.forEach(function (key) {
    if (req.query[key] &&
      (/^(page|limit)$/.test(key) || !/^(0|false)$/.test(req.query[key].toString()))) {
      params[key] = req.query[key];
    }
  });

  if (params.zero_based_pagination) {
    req.res.zero_based_pagination = true;
    try {
      params.page = parseInt(params.page || 0, 10) + 1;
    }
    catch (ex) { }
  }

  return params;
};

/**
 * Set headers for paging
 *
 * @param {object} data, the array received from the service
 * @param {object} res
 */
module.exports.setPaginationHeaders = function (data, res) {
  Object.keys(data.paginationCounters || []).forEach(function (key) {
    if (key === 'Current-Page' && res.zero_based_pagination) {
      data.paginationCounters[key]--;
    }
    res.setHeader('X-Pagination-'.concat(key), data.paginationCounters[key]);
  });
  delete data.paginationCounters;
};
