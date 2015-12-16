'use strict';

var $ = require('../../');

module.exports = function BaseService(Model) {
  this._model = Model;
};

var parseSort = function (sort) {
  if (!sort || typeof sort === 'object') {
    return sort || {};
  }

  var output = {};
  sort.toString().split(',').forEach(function (key) {
    var type = 1;
    if (/^-(.*)$/.test(key)) {
      key = RegExp.$1;
      type = -1;
    }
    output[key] = type;
  });

  return output;
};

var parseFields = function (fields, service, single) {
  var defaults = single && service.defaultFieldsSingle || service.defaultFields;

  fields = fields && fields.split(' ') || [];
  defaults = (defaults && defaults.split(' ') || []).concat(
    service.allowedFields && service.allowedFields.split(' ') || []);

  return defaults.filter(function (field) {
    return !fields.length || fields.indexOf(field) >= 0;
  }).join(' ') || '_id';
};

module.exports.prototype = {

  defaultFields: '',
  defaultFieldsSingle: '',
  createFields: '',
  updateFields: '',
  uniqueFields: 'name',
  uniqueFieldsContext: '',
  foreignKeyFields: '',
  filterFields: '',
  defaultLimit: 25,
  defaultPopulate: '',
  defaultPopulateSingle: '',
  defaultSearchFields: 'name description',

  create: function create(req, doc, fn) {
    var self = this;
    this._createModel(req, doc, function (err, model) {
      if (err) {
        return fn(err);
      }
      self.commit(model, req, 'save', function (err) {
        return fn(err, !err ? model : undefined);
      });
    });
  },

  batchCreate: function batchCreate(req, docs, fn) {
    var self = this;

    this._validateCreate(req, docs, function (err) {
      if (err) {
        return fn(err);
      }

      docs = docs.map(function (doc) {
        return new self._model(doc).toObject();
      });

      self.commit(self._model.collection, req, 'insert', docs, function (err) {
        if (err) {
          return self.remove({
            _id: { $in: $.utils.getId(docs) }
          }, function (removeErr) {
            fn(removeErr || err);
          });
        }
        fn(null, docs);
      });
    });
  },

  find: function find(req, params, fn, single) {
    return this._find(req, params, fn, single);
  },

  findOne: function findOne(req, params, fn) {
    if (typeof params === 'function') {
      fn = params;
      params = {};
    }
    return this.find(req, params, fn, true);
  },

  findById: function findById(req, id, fn, params) {
    params = params || {};
    params.conditions = { _id: id };

    return this.find(req, params, fn, true);
  },

  update: function update(req, conditions, changes, fn) {
    var self = this;
    var isModel = !!conditions.save;
    var id = $.utils.getId(conditions);
    var single = isModel || $.utils.isObjectId(id);

    changes = this._strip(changes, this.updateFields);

    // In case of an individual model
    this._validateUpdate(req, id, changes, function (err) {
      if (err) {
        return fn(err);
      }

      if (isModel) {
        Object.keys(changes).forEach(function (key) {
          var path = self._model.schema.paths[key];
          var isEmbeddedDocument = path &&
            path.casterConstructor &&
            path.casterConstructor &&
            path.casterConstructor.name === 'EmbeddedDocument';

          // Fields or array that are the same should be skipped
          // Unless it's an embedded document
          var skip = key === '_id' ||
              conditions[key] === changes[key] ||
              (!isEmbeddedDocument && $.utils.idEquals(conditions[key], changes[key]));

          if (!skip) {
            conditions[key] = changes[key];
          }
        });
        return self.commit(conditions, req, 'save', fn);
      }
      else {
        if (single) {
          conditions = { _id: $.utils.getId(conditions) };
          var keys = Object.keys(changes);
          changes = new self._model(changes).toObject({ getters: true });
          changes = keys.reduce(function (result, key) {
            result[key] = changes[key];
            return result;
          }, {});
        }
        self.commit(req, 'update', conditions, {
          // Explicitly use $set to prevent accepting any other (unsafe) $operations
          // In case of need for e.g. $addToSet,
          // we have to expose that in an explicit service method
          $set: self._parseInput(changes)
        }, { multi: true }, fn);
      }
    });
  },

  remove: function remove(req, conditions, fn) {
    var self = this;

    if (!this._model.schema.paths.inactive) {
      return this.commit(req, 'remove', conditions, fn);
    }
    else if (!this.uniqueFields) {
      conditions.inactive = { $ne: true };

      return this.commit(req, 'update', conditions, {
        inactive: true
      }, {
        multi: true
      }, fn);
    }

    this.find(req, {
      conditions: conditions,
      fields: this.uniqueFields
    }, function (err, items) {
      if (err) {
        return fn(err);
      }

      if (!items.length) {
        return fn();
      }

      items = items.filter(function (item) {
        return !item.inactive;
      });

      if (!items.length) {
        return fn('item_non_removeable');
      }

      var error;
      var done = 0;
      var removed = 0;
      var fields = self.uniqueFields && self.uniqueFields.split(' ') || [];
      items.forEach(function (item) {
        var update = {
          inactive: true
        };

        fields.forEach(function (field) {
          if (typeof item[field] !== 'undefined') {
            update[field] = item[field].toString().concat('.deleted.', new Date().toISOString());
          }
        });

        return self.commit(req, 'update', { _id: $.utils.getId(item) }, update, function (err, up) {
          if (err) {
            error = err;
          }
          else {
            removed += up.n;
          }
          done++;
          if (done === items.length) {
            fn(error, removed);
          }
        });
      });

    });
  },

  count: function count(req, conditions, fn) {
    if (!!this._model.schema.paths.inactive && typeof conditions.inactive === 'undefined') {
      conditions.inactive = { $ne: true };
    }
    this.commit(req, 'count', conditions, fn);
  },

  distinct: function distinct(req, field, conditions, fn) {
    this.commit(req, 'distinct', field, conditions, fn);
  },

  aggregate: function aggregate(req, conditions, fn) {
    this.commit(req, 'aggregate', conditions, fn);
  },

  commit: function commit(model, req, method) {
    var args = Array.prototype.slice.call(arguments, 0);

    if (typeof req === 'string') {
      method = req;
      req = model;
      model = this._model;
      args.unshift(model);
    }

    args = args.slice(3);

    if (this.COMMIT_REQ) {
      args.unshift(req);
    }

    if (['silly', 'debug'].indexOf(process.env.LOGLEVEL_SERVICE) >= 0) {
      var start = new Date();
      var log = JSON.stringify(args.filter(function (arg) {
        return arg && arg.conditions;
      })[0] || {}, null, 2);

      args = args.map(function (arg) {
        if (typeof arg !== 'function') {
          return arg;
        }

        return function () {
          $.logging.info('%s: %dms:', method, new Date() - start, log);
          return arg.apply(this, arguments);
        }.bind(this);
      });
    }

    return model[method].apply(model, args);
  },

  _strip: function _strip(doc, whitelist) {
    var schema = this._model.schema;

    Object.keys(doc).forEach(function (key) {
      if (doc[key] && !!doc[key]._id) {
        doc[key] = $.utils.getId(doc[key]);
      }

      var enumValues = schema.paths[key] && schema.paths[key].enumValues || [];
      if (doc[key] === '' && enumValues.length && enumValues.indexOf(doc[key]) < 0) {
        doc[key] = undefined;
      }
    });

    if (!whitelist) {
      return doc;
    }
    else if (typeof whitelist === 'string') {
      whitelist = whitelist.split(' ');
    }

    return whitelist.reduce(function (d, key) {
      if (doc.hasOwnProperty(key)) {
        d[key] = doc[key];
      }
      return d;
    }, {});
  },

  _parseInput: function _parseInput(doc) {
    if (doc.toObject) {
      doc = JSON.parse(JSON.stringify(doc.toObject({ depopulate: true })));
    }

    delete doc._id;
    delete doc.id;
    delete doc.__v;
    return doc;
  },

  _createModel: function (req, doc, fn) {
    var self = this;
    doc = this._strip(doc, this.createFields || this.updateFields);
    this._validateCreate(req, doc, function (err) {
      if (err) {
        return fn(err);
      }
      fn(null, new self._model(self._parseInput(doc)));
    });
  },

  _validateCreate: function _validateCreate(req, docs, fn) {
    docs = Array.isArray(docs) ? docs : [docs];
    return this._validateUnique(req, null, docs, fn);
  },

  _validateUpdate: function _validateUpdate(req, id, docs, fn) {
    docs = Array.isArray(docs) ? docs : [docs];
    return this._validateUnique(req, id, docs, fn);
  },

  _validateUnique: function _validateUnique(req, id, docs, fn) {
    docs = Array.isArray(docs) ? docs : [docs];

    if (!docs.length) {
      return fn();
    }

    var uniqueFields = this.uniqueFields && this.uniqueFields.split(' ') || [];
    var conditions = [];
    var error = function () {
      return {
        name: 'duplicate_unique_fields',
        message: 'An item already exists with the same value for "'.concat(keys.join('/'), '"')
      };
    };

    for (var i = 0; i < uniqueFields.length; i++) {

      var keys = uniqueFields[i].replace(/&/g, '+').split('&');

      var values = docs.map(function (doc) {
        return keys.reduce(function (result, key) {
          var val = $.utils.tryGetId(doc[key], true);
          if (val) {
            result[key] = val;
          }
          return result;
        }, {});
      }).filter(function (value) {
        return !!Object.keys(value).length;
      });

      if (!values.length) {
        continue;
      }

      // Check if the list itself contains duplicates, otherwise return immediately
      var jvalues = values.map(function (value) {
        // stringified so that indexOf will work
        return JSON.stringify(value);
      });
      for (var j = 0; j < jvalues.length; j++) {
        if (jvalues.indexOf(jvalues[j]) !== jvalues.lastIndexOf(jvalues[j])) {
          return fn(error());
        }
      }

      conditions = conditions.concat(values);
    }

    if (!conditions.length) {
      return fn();
    }

    conditions = { $or: conditions };

    if (id) {
      conditions._id = { $ne: id };
    }

    var uniqueFieldsContext = this.uniqueFieldsContext && this.uniqueFieldsContext.split(' ') || [];

    conditions = uniqueFieldsContext.reduce(function (conditions, key) {
      // We're asuming that a batch check will have the same 'uniqueFieldsContext'
      // Hence we only verify the first
      if (key === 'global') {
        conditions.OVERRIDE_MULTITENANCY = true;
      }
      else if (docs[0][key]) {
        conditions[key] = $.utils.tryGetId(docs[0][key]);
      }
      return conditions;
    }, conditions);

    return this.count(req, conditions, function (err, count) {
      return fn(err || count > 0 ? error() : null);
    });

  },

  _find: function _find(req, params, fn, single) {

    var self = this;

    if (typeof params === 'function') {
      single = fn;
      fn = params;
      params = {};
    }

    params = params || {};
    params.query = params.query || {};
    params.conditions = params.conditions || {};

    if (!!this._model.schema.paths.inactive &&
        typeof params.conditions.inactive === 'undefined') {
      params.conditions.inactive = { $ne: true };
    }

    params.fields = parseFields(params.fields, this, single);

    params.populate = typeof params.populate !== 'undefined' ? params.populate :
      single && this.defaultPopulateSingle || this.defaultPopulate;

    if (!params.populate) {
      delete params.populate;
    }
    else if (Array.isArray(params.populate) && !!params.populate[0].path) {
      params.populate = [params.populate];
    }

    params.lean = params.lean !== undefined ? params.lean : true;

    var isApiCall = /\/api\//.test(req && req.originalUrl);

    params.limit = parseInt(params.limit !== undefined ? params.limit :
      (isApiCall ? this.defaultLimit : 0), 10);
    params.page = Math.max(1, parseInt(params.page || 1, 10));

    if (params.page > 1) {
      params.skip = params.limit * (params.page - 1);
    }

    params.sort = $.utils.extend({}, params.sort || {});

    if (params.sort_by) {
      var sortTypes = params.sort_type && params.sort_type.toString().split(',') || [];
      var sort = params.sort_by.toString().split(',').map(function (key, i) {
        var path = self._model.schema.paths[key];
        if (path && path.options && path.options.shadow) {
          key = path.options.shadow;
        }
        return (sortTypes[i] === '-1' ? '-' : '').concat(key);
      }).join(',');

      params.sort = $.utils.extend(params.sort, parseSort(sort));

      delete params.sort_by;
      delete params.sort_type;
    }

    var defaultSort = parseSort(this.defaultSort);
    Object.keys(params.sort).forEach(function (key) {
      delete defaultSort[key];
    });

    params.sort = $.utils.extend(params.sort, defaultSort);

    if (params.filter) {
      var searchFields = (params.searchFields || this.defaultSearchFields || '').split(' ');
      delete params.searchFields;
      var filter = params.filter;
      params.conditions.$or = searchFields.map(function (key) {
        var condition = {};
        condition[key] = key === '$text' ? { $search: filter } : $.utils.filterToRegExp(filter);
        return condition;
      });
    }

    if (this.filterFields) {
      this.filterFields.split(' ').forEach(function (key) {
        var filter = params.query[key];
        if (typeof filter === 'string') {
          filter = filter.split(',');
        }
        else if (filter && !Array.isArray(filter)) {
          filter = [filter];
        }

        // Check if the field is supplied with `_from` and/or `_until` keys
        if (/^date_/.test(key)) {
          var keyFrom = key.concat('_from');
          var keyUntil = key.concat('_until');

          var from = params.query[keyFrom];
          var until = params.query[keyUntil];
          if (from) {
            filter = (filter || []).concat('>='.concat(from));
          }
          if (until) {
            filter = (filter || []).concat('<'.concat(until.length <= 10 ? '=' : '', until));
          }
        }

        if (!filter || !filter.length) {
          return;
        }

        var path = self._model.schema.paths[key];
        if (path && (path.instance === 'Number' || path.instance === 'Date')) {
          filter = filter.map(function (value) {
            var mod = '';
            if (/^([<>])(=?)(.*?)$/.test(value)) {
              mod = '$'.concat(RegExp.$1 === '<' ? 'lt' : 'gt', RegExp.$2 === '=' ? 'e' : '');
              value = RegExp.$3;
            }

            if (path.instance === 'Number') {
              try {
                value = +value;
              }
              catch (ex) {}

              if (mod) {
                var v = {};
                v[mod] = value;
                return v;
              }
            }
            else if (path.instance === 'Date') {
              var date = new Date(value);
              if (!isNaN(date)) {

                var nextDay = new Date(value);
                nextDay.setDate(nextDay.getDate() + 1);

                if (/00\.000Z$/.test(date.toISOString())) {
                  // If no operator provided, compare with the full range of `d till d+`
                  if (!mod) {
                    return { $gte: date, $lt: nextDay };
                  }
                  // If greater than, compare with `d+1`
                  else if (mod === '$gt') {
                    return { $gte: nextDay };
                  }
                  // If less than or equal, compare with `d+1`
                  else if (mod === '$lte') {
                    return { $lt: nextDay };
                  }
                }

                var vv = {};
                vv[mod] = date;
                return vv;
              }
            }

            return value;
          });

          if (filter.length > 1) {
            params.conditions.$and = params.conditions.$and || [];
            params.conditions.$and = params.conditions.$and.concat(filter.map(function (value) {
              var v = {};
              v[key] = value;
              return v;
            }));
          }
          else {
            params.conditions[key] = filter[0];
          }
        }
        else {
          params.conditions[key] = filter.length === 1 ? filter[0] : { $in: filter };
        }

      });
    }

    var method = single && 'findOne' || 'find';

    delete params.query;

    this.commit(req, method, params.conditions, params.fields, params, function (err, data) {
      if (err || !data) {
        return fn && fn(err);
      }
      if (params.pagination_headers) {
        return self.count(req, params.conditions, function (errCount, count) {
          if (!errCount) {
            data.paginationCounters = {
              'Total-Count': count,
              'Page-Count': params.limit ? Math.ceil(count / params.limit) : 1,
              'Current-Page': params.page || 1,
              'Per-Page': params.limit || 'all'
            };
          }
          return fn && fn(err || errCount, data);
        });
      }
      return fn && fn(err, data);
    });
  },

  // Update a foreign key collection using push or pull
  _pushToSet: function _pushToSet(req, key, data, ids, fn, model) {
    data[key] = $.utils.getId((data[key] || []).concat(ids).reduce(function (x, key) {
      return x.indexOf(key) < 0 ? x.concat(key) : x;
    }, []));
    this.commit(model || data, req, 'save', fn);
  },

  _pullFromSet: function _pullFromSet(req, key, data, ids, fn, model) {
    ids = $.utils.getId(ids);
    data[key] = data[key].filter(function (id) {
      return ids.indexOf($.utils.getId(id)) < 0;
    });
    this.commit(model || data, req, 'save', fn);
  }

};
