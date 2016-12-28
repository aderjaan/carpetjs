const $ = require('../../');

module.exports = function BaseApi (serviceName, serviceApp) {
  this._appName = serviceApp;
  this._services = $.bootstrap.services(serviceApp);
  this._service = this._services[serviceName];
};

module.exports.prototype = {

  fieldMap: {},

  mapper (req, item, fn, up, single) {
    return (single || !single) && fn(item);
  },

  get (req, res) {
    return this._get(req, res);
  },

  getByIdParam (req, uri, method, id, fn) {
    if (this.loaders) {
      const loader =
        this.loaders[uri] ||
        this.loaders[`${method} ${uri}`] ||
        this.loaders[`* ${uri}`] ||
        this.loaders['*'];

      if (loader) {
        return loader.call(this, req, id, fn);
      }
    }

    const options = { lean: false };
    if (method !== 'GET') {
      options.cache = false;
    }

    return this._service.findById(req, id, fn, options);
  },

  list (req, res) {
    return this._list(req, res, $.utils.api.params(req));
  },

  create (req, res) {
    return this._create(req, res);
  },

  update (req, res) {
    return this._update(req, res);
  },

  remove (req, res) {
    const ids = [].concat($.utils.getId(req.model || req.body));

    if (!$.utils.isObjectId(ids) || !ids.length) {
      return $.utils.api.error(res, 'bad_request');
    }

    const conditions = ids.length === 1 ? { _id: ids[0] } : { _id: { $in: ids } };
    return this._service.remove(req, conditions, $.utils.api.wrap(res, true));
  },

  _get (req, res) {
    const data = $.utils.api.toJSON(req.model);
    return this._mapper(req, data, data => $.utils.api.success(res, data), false, true);
  },

  _list (req, res, params, service, parse) {
    params = params || {};
    service = service || this._service;

    parse = parse || ((data, cb) => {
      if (!data || !data.length) {
        return cb(data);
      }

      data = $.utils.api.toJSON(data);
      return this._mapper(req, data, cb, false, false);
    });

    return service.find(req, params, $.utils.api.wrap(res, data => {
      $.utils.api.setPaginationHeaders(data, res);
      parse(data || [], parsed => $.utils.api.success(res, parsed));
    }));
  },

  _create (req, res) {
    this._mapper(req, req.body, data => this._service.create(req, data, (err, model) => {
      if (err) {
        return $.utils.api.error(res, err);
      }

      this.getByIdParam(req, req.uri, 'GET', $.utils.getId(model), $.utils.api.wrap(res, this));
    }), true, true);
  },

  _update (req, res) {
    this._mapper(req, req.body, data =>
      this._service.update(req, req.model, data, (err, model) => {
        if (err) {
          return $.utils.api.error(res, err);
        }

        this.getByIdParam(req, req.uri, 'GET', $.utils.getId(model), $.utils.api.wrap(res, this));
      }), true, true);
  },

  _mapper (req, item, fn, up, single) {
    if (!single && Array.isArray(item)) {
      let done = 0;
      return item.forEach((x, i) => {
        this._mapper(req, item[i], output => {
          item[i] = output;
          done += 1;

          if (done === item.length) {
            fn(item);
          }
        }, up, single);
      });
    }

    const fieldMap = this.fieldMap || {};
    this.mapper(req, item, item => {
      Object.keys(fieldMap).forEach(field => {
        const oldName = `item.${up ? field : fieldMap[field]}`;
        const newName = `item.${up ? fieldMap[field] : field}`;

        /* eslint-disable */
        try {
          if (typeof eval(oldName) !== 'undefined') {
            eval(`${newName}=${oldName}; delete ${oldName}`);
          }
        }
        catch (ex) {}
        /* eslint-enable */
      });

      return fn && fn(item);
    }, up, single);
  }

};
