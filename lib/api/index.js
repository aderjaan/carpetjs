'use strict';

module.exports = function BaseApi(serviceName, serviceApp) {
  this._services = $.services(serviceApp);
  this._service = this._services[serviceName];
};

module.exports.prototype = {

  fieldMap: {},

  get: function (req, res) {
    return this._get(req, res);
  },

  list: function (req, res) {
    return this._list(req, res, utils.api.params(req));
  },

  create: function (req, res) {
    return this._create(req, res);
  },

  update: function (req, res) {
    return this._update(req, res);
  },

  remove: function (req, res) {
    return this._service.remove(req, { _id: req.model._id }, utils.api.wrap(res, true));
  },

  history: function (req, res) {
    var services = this._services;
    return this._list(req, res, utils.api.params(req, {
      conditions: {
        'entity.$id': utils.getId(req.model)
      },
      sort_by: 'date',
      sort_type: -1
    }), $.service('history', 'shared'), function (data, cb) {
      var map = {};
      var changes = _.chain(data).pluck('changes').flatten();

      // map is a hash that contains all unique object id's
      // for every 'type'
      changes.forEach(function (change) {
        ['from', 'to'].forEach(function (name) {
          var arr = Array.isArray(change[name]) ? change[name] : [change[name]];
          arr = utils.getId(arr);
          if (_.all(arr, mongoose.Types.ObjectId.isValid)) {
            map[change.key] = (map[change.key] || []).concat(arr);
          }
        });
      });

      // Fetch the matching object from the service for every 'type'
      async.parallel(Object.keys(map).map(function (key) {
        return function (fn) {
          var service = services[$.camelize(key)];
          if (!service) {
            return fn();
          }
          service.find(req, {
            conditions: { _id: { $in: map[key] } }
          }, function (err, models) {
            changes.forEach(function (change) {
              ['from', 'to'].forEach(function (name) {
                var isArray = Array.isArray(change[name]);
                var arr = isArray ? change[name] : [change[name]];

                // Modify the original paths or fall back to the original value
                var newArr = utils.getId(arr).map(function (id, index) {
                  return _.find(models, function (m) {
                    return utils.getId(m) === id;
                  }) || arr[index];
                });

                change[name] = isArray ? newArr : newArr[0];
              });

              // In case of arrays, give more friendly response (added/remove iso from/to)
              if (Array.isArray(change.from) && Array.isArray(change.to)) {
                change.added = change.to.filter(function (o) {
                  return utils.getId(change.from).indexOf(utils.getId(o)) === -1;
                });
                change.removed = change.from.filter(function (o) {
                  return utils.getId(change.to).indexOf(utils.getId(o)) === -1;
                });
                delete change.from;
                delete change.to;
              }
            });
            fn();
          });
        };
      }), function () {
        cb(utils.api.toJSON(data));
      });
    });
  },

  _get: function (req, res) {
    var data = utils.api.toJSON(req.model);
    data = this._mapper(data);
    return utils.api.success(res, data);
  },

  _list: function (req, res, params, service, parse) {
    var self = this;
    params = params || {};
    service = service || this._service;
    parse = parse || function (data, cb) {
      data = utils.api.toJSON(data);
      data = data.map(function (item) {
        return self._mapper(item);
      });
      cb(data);
    };
    return service.find(req, params, utils.api.wrap(res, function (data) {
      utils.api.setPaginationHeaders(data, res);
      parse(data || [], function (parsed) {
        return utils.api.success(res, parsed);
      });
    }));
  },

  _create: function (req, res) {
    req.body = this._mapper(req.body, true);
    return this._service.create(req, req.body, utils.api.wrap(res, this));
  },

  _update: function (req, res) {
    req.body = this._mapper(req.body, true);
    return this._service.update(req, req.model, req.body, utils.api.wrap(res, this));
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
