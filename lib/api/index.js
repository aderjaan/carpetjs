'use strict';

var $ = require('../../');

module.exports = function BaseApi(serviceName, serviceApp) {
  this._appName = serviceApp;
  this._services = $.bootstrap.services(serviceApp);
  this._service = this._services[serviceName];
};

module.exports.prototype = {

  fieldMap: {},

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
    data = this._mapper(data);
    return $.utils.api.success(res, data);
  },

  _list: function (req, res, params, service, parse) {
    var self = this;
    params = params || {};
    service = service || this._service;
    parse = parse || function (data, cb) {
      data = $.utils.api.toJSON(data);
      data = data.map(function (item) {
        return self._mapper(item);
      });
      cb(data);
    };
    return service.find(req, params, $.utils.api.wrap(res, function (data) {
      $.utils.api.setPaginationHeaders(data, res);
      parse(data || [], function (parsed) {
        return $.utils.api.success(res, parsed);
      });
    }));
  },

  _create: function (req, res) {
    req.body = this._mapper(req.body, true);
    return this._service.create(req, req.body, $.utils.api.wrap(res, this));
  },

  _update: function (req, res) {
    req.body = this._mapper(req.body, true);
    return this._service.update(req, req.model, req.body, $.utils.api.wrap(res, this));
  },

  _mapper: function (item, up) {
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
    if (this.mapper) {
      item = this.mapper(item, up);
    }
    return item;
  }

};
