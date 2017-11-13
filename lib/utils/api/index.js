const $ = require('../../../');

const MONGOOSE_MESSAGES = {
  required: '%s is required',
  min: '%s below minimum',
  max: '%s above maximum',
  enum: 'not an allowed value for %s'
};

const mapErrors = e => (e && e.message) || e;

module.exports.parseError = err => {
  if (typeof err === 'string') {
    err = { name: err };
  }
  else if (typeof err === 'object' && !$.config.errors[err.name]) {
    if (err.name === 'ValidationError') {
      err = {
        name: 'validation_failed',
        errors: Object.keys(err.errors).map(key => {
          const type = err.errors[key].kind || err.errors[key].type;
          let string = MONGOOSE_MESSAGES[type];

          if (string) {
            const path = err.errors[key].path.replace(/_/g, ' ');
            string = $.utils.format(string, path);

            return `${string[0].toUpperCase()}${string.substring(1)}`;
          }

          return err.errors[key].message;
        })
      };
    }
    else if (err.name === 'CastError') {
      err = {
        name: 'validation_failed',
        errors: [`Invalid value for field ${err.path}`]
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

  const def = $.config.errors[err.name] || $.config.errors.unknown;

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
module.exports.error = (res, err) => {
  res.req = res.req || {};

  if (err.status) {
    if (err.status === 404) {
      err = new Error('not_found');
    }
  }

  const parsed = module.exports.parseError(err);

  $.logging.error(parsed);

  if (parsed.name === 'unknown') {
    $.utils.traceError(res.req, err, true);
  }

  delete parsed.internal_error;

  const json = /^\/api\//.test(res.req.originalUrl) ||
    (res.req.headers && /json/i.test(res.req.headers['content-type']));

  const handle = json ? 'json' : 'render';
  const args = json ? [parsed] : ['error', parsed];

  return res.status(parsed.httpcode)[handle].apply(res, args);
};

/**
 * Writes a 200 to the response, possibly with data
 *
 * @param {object} res
 * @param {object} data
 *
 */
module.exports.success = (res, data) => {
  if (!data) {
    return res.end();
  }

  if (res.req && typeof res.req.extra_data === 'object') {
    Object.assign(data, res.req.extra_data);
  }

  res.req.responseData = data;

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
module.exports.wrap = (res, fn) => (err, data, ...args) => {
  if (err) {
    return module.exports.error(res, err);
  }

  else if (typeof fn === 'function') {
    return fn && fn(data, ...args);
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

  data = module.exports.toJSON(data);

  if (fn && fn._mapper) {
    return fn._mapper(res.req, data, data => module.exports.success(res, data), false, true);
  }

  return module.exports.success(res, data);
};

/**
 * Shortcut for rendering error pages
 */
module.exports.renderError = (res, code, message, title) => {
  if (code >= 500) {
    $.logging.error(message);
  }
  else if (code >= 400) {
    $.logging.warn(message);
  }

  return res.status(code).render('error', { message, title });
};

/**
 * Maps data to json, including getters/virtuals if available
 *
 * @param {object} data
 */
module.exports.toJSON = data => {
  if (Array.isArray(data)) {
    return data.map(item => module.exports.toJSON(item));
  }

  return data && data.toObject ? data.toObject({ getters: true }) : data;
};

/**
 * Creates or updates the params object based on req.query
 *
 * @param {object} params
 * @param {object} req
 */
module.exports.params = (req, params) => {
  params = params || {};
  params.query = req.query;
  params.conditions = params.conditions || {};

  const keys = 'type filter limit page sort_by sort_type pagination_headers fields'.split(' ');
  keys.forEach(key => {
    const value = req.query[key];
    const copy = value && (/^(page|limit)$/.test(key) || !/^(0|false)$/.test(value.toString()));

    if (copy) {
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
module.exports.setPaginationHeaders = (data, res) => {
  Object.keys(data.paginationCounters || []).forEach(key => {
    if (key === 'Current-Page' && res.zero_based_pagination) {
      data.paginationCounters[key] -= 1;
    }

    res.setHeader(`X-Pagination-${key}`, data.paginationCounters[key]);
  });

  delete data.paginationCounters;
};
