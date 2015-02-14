'use strict';

var $ = require('../../');
var mongoose = require('mongoose');

module.exports = function BaseService(Model) {
  this._model = Model;
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
  defaultSearchFields: 'name description',
  defaultLimit: 25,
  defaultPopulate: '',
  defaultPopulateSingle: '',

  create: function create(req, doc, fn) {
    var self = this;

    doc = this._strip(doc, this.createFields || this.updateFields);
    this._validateCreate(req, doc, function (err) {
      if (err) {
        return fn(err);
      }
      var model = new self._model(self._parseInput(doc));
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

  findById: function findById(req, id, fn, options) {
    options = options || {};
    options.lean = options.lean !== undefined ? options.lean : true;
    options.conditions = { _id: id };

    return this.find(req, options, fn, true);
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
        for (var key in changes) {
          conditions[key] = changes[key];
        }
        return self.commit(conditions, req, 'save', fn);
      }
      else {
        if (single) {
          conditions = { _id: $.utils.getId(conditions) };
          changes = new self._model(changes).toObject({ getters: true });
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
    // use inactive property rather than deleting
    if (!!this._model.schema.paths.inactive) {
      conditions.inactive = { $ne: true };
      return this.commit(req, 'update', conditions, {
        inactive: true
      }, {
        multi: true
      }, fn);
    }
    this.commit(req, 'remove', conditions, fn);
  },

  count: function count(req, conditions, fn) {
    this.commit(req, 'count', conditions, fn);
  },

  distinct: function distinct(req, field, conditions, fn) {
    this.commit(req, 'count', field, conditions, fn);
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

    return model[method].apply(model, args);
  },

  _strip: function _strip(doc, whitelist) {
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
    var self = this;
    // Strip all foreignkey objects back to their ids
    this.foreignKeyFields.split(' ').forEach(function (foreignKey) {
      $.utils.foreignKeyToId(self._model, doc, foreignKey);
    });

    delete doc._id;
    delete doc.id;
    delete doc.__v;
    return doc;
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

    var uniqueFields = this.uniqueFields && this.uniqueFields.split(' ') || [];
    var conditions = [];

    for (var i = 0; i < uniqueFields.length; i++) {
      var key = uniqueFields[i];

      if (!!this._model.schema.paths[key]) {

        var values = docs.map(function (doc) {
          var val = doc[key];
          val = val && mongoose.Types.ObjectId.isValid(val.toString()) ? $.utils.getId(val) : val;
          return val;
        }).filter(function (val) {
          return !!val;
        });

        // Check if the list itself contains duplicates, otherwise return immediately
        for (var j = 0; j < values.length; j++) {
          if (values.indexOf(values[j]) !== values.lastIndexOf(values[j])) {
            return fn('duplicate_unique_fields');
          }
        }

        conditions[conditions.push({}) - 1][key] = { $in: values };
      }
    }

    conditions = { $or: conditions };

    // We're asuming that a batch check will have the same 'uniqueFieldsContext'
    // Hence we only verify the first
    (this.uniqueFieldsContext || '').split(' ').forEach(function (key) {
      if (docs[0][key]) {
        conditions[key] = mongoose.Types.ObjectId.isValid(docs[0][key].toString()) ?
          $.utils.getId(docs[0][key]) : docs[0][key];
      }
    });

    if (id) {
      conditions._id = { $ne: id };
    }

    if (!conditions.$or.length) {
      return fn();
    }

    return this.count(req, conditions, function (err, count) {
      if (err || count > 0) {
        return fn('duplicate_unique_fields');
      }
      return fn();
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

    params.fields = typeof params.fields !== 'undefined' ? params.fields :
      single && this.defaultFieldsSingle || this.defaultFields;

    params.populate = typeof params.populate !== 'undefined' ? params.populate :
      single && this.defaultPopulateSingle || this.defaultPopulate;

    if (!params.populate) {
      delete params.populate;
    }
    else if (Array.isArray(params.populate) && !!params.populate[0].path) {
      params.populate = [params.populate];
    }

    params.lean = params.lean !== undefined ? params.lean : true;

    try {
      params.limit = parseInt(params.limit !== undefined ? params.limit :
        ($.isApiCall() ? this.defaultLimit : 0), 10);
      params.page = Math.max(1, parseInt(params.page || 1, 10));
    }
    catch (ex) {
      params.limit = this.defaultLimit;
      params.page = 1;
    }

    if (params.page > 1) {
      params.skip = params.limit * (params.page - 1);
    }

    if (params.sort_by && params.sort_type) {
      params.sort = {};
      params.sort[params.sort_by] = parseInt(params.sort_type, 10) || 1;
      delete params.sort_by;
      delete params.sort_type;
    }
    else {
      params.sort = params.sort || this.defaultSort;
    }

    if (params.filter) {
      var searchFields = (params.searchFields || this.defaultSearchFields || '').split(' ');
      delete params.searchFields;
      params.conditions.$or = searchFields.map(function (key) {
        var condition = {};
        condition[key] = $.utils.filterToRegExp(params.filter);
        return condition;
      });
    }

    if (this.filterFields) {
      this.filterFields.split(' ').forEach(function (key) {
        if (/^date_/.test(key)) {
          var keyFrom = key.concat('_from');
          var from = new Date(params.query[keyFrom]);
          if (from.toString() !== 'Invalid Date') {
            params.conditions[key] = { $gte: from };
          }

          var keyUntil = key.concat('_until');
          var until = new Date(params.query[keyUntil]);
          if (until.toString() !== 'Invalid Date') {
            if (params.query[keyUntil].length <= 10) {
              // unless a specific time was provided, query until end of the day
              until.setDate(until.getDate() + 1);
            }
            params.conditions[key] = params.conditions[key] || {};
            params.conditions[key].$lte = until;
          }

        }
        else if (params.query[key]) {
          var filter = params.query[key];
          if (typeof filter === 'string' && /,/.test(filter)) {
            filter = {
              $in: filter.split(',')
            };
          }
          params.conditions[key] = filter;
        }
      });
    }

    var method = single && 'findOne' || 'find';

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
  _pushToSet: function _pushToSet(req, key, model, ids, fn) {
    model[key] = $.utils.getId((model[key] || []).concat(ids).reduce(function (x, key) {
      return x.indexOf(key) < 0 ? x.concat(key) : x;
    }, []));
    this.commit(model, req, 'save', fn);
  },

  _pullFromSet: function _pullFromSet(req, key, model, ids, fn) {
    ids = $.utils.getId(ids);
    model[key] = model[key].filter(function (id) {
      return ids.indexOf($.utils.getId(id)) < 0;
    });
    this.commit(model, req, 'save', fn);
  }

};
