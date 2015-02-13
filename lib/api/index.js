'use strict';

var $ = require('../../');

module.exports = function BaseApi(serviceName, serviceApp) {
  this._appName = serviceApp;
  this._services = $.bootstrap.services(serviceApp);
  this._service = this._services[serviceName];
};

module.exports.prototype = {

  fieldMap: {},

  mapper: function (req, item, fn, up, single) {
    if (single || !single) {
      return fn(item);
    }
  },

  get: function (req, res) {
    return this._get(req, res);
  },

  getByIdParam: function (req, route, id, fn) {
    if (this.loaders) {
      if (this.loaders[route]) {
        return this.loaders[route].call(this, req, id, fn);
      }
      else if (this.loaders['*']) {
        return this.loaders['*'].call(this, req, id, fn);
      }
      else {
        $.logging.error('No loader for', route);
      }
    }
    return this._service.findById(req, id, fn, { lean: false, parse: false });
  },

  list: function (req, res) {
    return this._list(req, res, $.utils.api.params(req));
  },

  create: function (req, res) {
    return this._create(req, res);
  },

  update: function (req, res) {
    return this._update(req, res);
  },

  remove: function (req, res) {
    var ids = $.utils.getId(req.model || req.body);
    ids = Array.isArray(ids) ? ids : [ids];
    if (!$.utils.isObjectId(ids) || !ids.length) {
      return $.utils.api.error(res, 'bad_request');
    }
    var conditions = ids.length === 1 ? { _id: ids[0] } : { _id: { $in: ids } };
    return this._service.remove(req, conditions, $.utils.api.wrap(res, true));
  },

  _get: function (req, res) {
    var data = $.utils.api.toJSON(req.model);
    this._mapper(req, data, function (data) {
      $.utils.api.success(res, data);
    }, false, true);
  },

  _list: function (req, res, params, service, parse) {
    var self = this;
    params = params || {};
    service = service || this._service;

    parse = parse || function (data, cb) {
      if (!data || !data.length) {
        return cb(data);
      }
      data = $.utils.api.toJSON(data);
      self._mapper(req, data, cb, false, false);
    };

    return service.find(req, params, $.utils.api.wrap(res, function (data) {
      $.utils.api.setPaginationHeaders(data, res);
      parse(data || [], function (parsed) {
        return $.utils.api.success(res, parsed);
      });
    }));
  },

  _create: function (req, res) {
    var self = this;
    this._mapper(req, req.body, function (data) {
      req.body = data;
      return self._service.create(req, req.body, $.utils.api.wrap(res, self));
    }, true, true);
  },

  _update: function (req, res) {
    var self = this;
    this._mapper(req, req.body, function (data) {
      req.body = data;
      return self._service.update(req, req.model, req.body, $.utils.api.wrap(res, self));
    }, true, true);
  },

  _mapper: function (req, item, fn, up, single) {
    if (!single && Array.isArray(item)) {
      var self = this;
      var done = 0;
      return item.forEach(function (x, i) {
        self._mapper(req, item[i], function (output) {
          item[i] = output;
          done++;
          if (done === item.length) {
            fn(item);
          }
        }, up, single);
      });
    }

    var fieldMap = this.fieldMap || {};
    Object.keys(fieldMap).forEach(function (field) {
      var oldName = 'item.'.concat(up ? field : fieldMap[field]);
      var newName = 'item.'.concat(up ? fieldMap[field] : field);
      try {
        if (typeof eval(oldName) !== 'undefined') { // jshint ignore:line
          eval(newName.concat('= ', oldName, '; delete ', oldName)); // jshint ignore:line
        }
      }
      catch (ex) {}
    });

    return this.mapper && this.mapper(req, item, fn, up, single);
  }

};
