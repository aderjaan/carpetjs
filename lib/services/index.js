'use strict';

module.exports = function BaseService(Model) {
  this._model = Model;
};

module.exports.prototype = {

  uniqueFields: 'name',
  uniqueFieldsContext: '',
  filterFields: '',
  foreignKeyFields: '',
  createOptions: '',
  updateOptions: '',

  defaultLimit: 25,
  defaultFields: '',
  defaultFieldsSingle: '',
  defaultPopulate: undefined,
  defaultPopulateSingle: undefined,
  defaultSearchFields: 'name description',

  create: function create(req, doc, fn) {
    var self = this;

    doc = this._strip(doc, this.createOptions || this.updateOptions);

    if (!!this._model.schema.paths.organization) {
      doc.organization = mongoose.Types.ObjectId(req.organizationId);
    }

    this._validateCreate(req, doc, function (err) {
      if (err) {
        return fn(err);
      }

      var model = new self._model(self._parseInput(doc));
      model.save(req, function (err, item) {
        if (err) {
          return fn(err);
        }
        return self._find(req, {
          conditions: {
            _id: item._id
          },
          lean: false
        }, fn, true);
      });
    });
  },

  batchCreate: function batchCreate(req, docs, fn) {
    var self = this;

    docs = docs.map(function (doc) {
      if (!!self._model.schema.paths.organization) {
        doc.organization = mongoose.Types.ObjectId(req.organizationId);
      }
      return doc;
    });

    this._validateCreate(req, docs, function (err) {
      if (err) {
        return fn(err);
      }

      docs = docs.map(function (doc) {
        var model = new self._model(self._parseInput(doc));
        return model.toObject ? model.toObject() : model;
      });

      self._model.collection.insert(docs, function (err) {
        if (err) {
          return self.remove({
            _id: { $in: utils.getId(docs) }
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
    return this.find(req, {
      conditions: { _id: id },
      lean: options.lean
    }, fn, true);
  },

  update: function update(req, conditions, changes, fn) {
    var self = this;
    changes = this._strip(changes, this.updateOptions);

    // In case of an individual model
    if (!!conditions.save) {
      return this._validateUpdate(req, conditions.id, changes, function (err) {
        if (err) {
          return fn(err);
        }
        for (var key in changes) {
          conditions[key] = changes[key];
        }
        return conditions.save(req, function (err, data) {
          if (err) {
            return fn(err);
          }
          self._parseOutputSingle(data, req, function (data) {
            fn(null, data);
          });
        });
      });
    }

    if (!!this._model.schema.paths.organization) {
      conditions.organization = req.organizationId;
    }

    // Explicitly use $set to prevent accepting any other (unsafe) $operations
    // In case of need for e.g. $addToSet, we have to expose that in an explicit service method
    this._model.update(conditions, {
      $set: this._parseInput(changes)
    }, { multi: true }, function (err) {
      if (err) {
        return fn(err);
      }
      self._parseOutput(conditions, req, function (data) {
        fn(null, data);
      });
    });
  },

  remove: function remove(req, conditions, fn) {
    if (!!this._model.schema.paths.organization) {
      conditions.organization = req.organizationId;
    }
    // use inactive property rather than deleting
    if (!!this._model.schema.paths.inactive) {
      conditions.inactive = { $ne: true };
      return this._model.update(conditions, { inactive: true }, { multi: true }, fn);
    }
    this._model.remove(conditions, fn);
  },

  count: function count(req, conditions, fn) {
    if (!!this._model.schema.paths.organization) {
      conditions.organization = req.organizationId;
    }
    this._model.count(conditions, fn);
  },

  distinct: function distinct(req, field, conditions, fn) {
    if (typeof conditions === 'function') {
      fn = conditions;
      conditions = {};
    }
    conditions = conditions || {};
    if (!!this._model.schema.paths.organization) {
      conditions.organization = req.organizationId;
    }

    this._model.distinct(field, conditions, fn);
  },

  aggregate: function aggregate(req, ops, fn) {
    if (typeof ops === 'function') {
      fn = ops;
      ops = [];
    }

    ops = ops || [];
    if (!!this._model.schema.paths.organization) {
      ops.unshift({
        $match: {
          organization: mongoose.Types.ObjectId(req.organizationId)
        }
      });
    }
    this._model.aggregate(ops, fn);
  },

  _strip: function _strip(doc, whitelist) {
    if (!whitelist) {
      return doc;
    }
    else if (typeof whitelist === 'string') {
      whitelist = whitelist.split(' ');
    }
    return _.pick(doc, whitelist);
  },

  _parseOutput: function _parseOutput(data, req, fn) {
    fn(data);
  },

  _parseOutputSingle: function _parseOutputSingle(data, req, fn) {
    this._parseOutput([data], req, function (output) {
      fn(output[0]);
    });
  },

  _parseInput: function _parseInput(doc) {
    var self = this;
    // Strip all foreignkey objects back to their ids
    this.foreignKeyFields.split(' ').forEach(function (foreignKey) {
      utils.foreignKeyToId(self._model, doc, foreignKey);
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

    var uniqueFields = (this.uniqueFields || '').split(' ');
    var conditions = { $or: [] };

    for (var i = 0; i < uniqueFields.length; i++) {
      var key = uniqueFields[i];

      var values = docs.map(function (doc) {
        var val = doc[key];
        val = val && mongoose.Types.ObjectId.isValid(val.toString()) ? utils.getId(val) : val;
        return val;
      });
      values = _.compact(values);

      // Check if the list itself contains duplicates, otherwise return immediately
      if (_.uniq(values).length < values.length) {
        return fn('duplicate_unique_fields');
      }

      var r = {};
      r[key] = { $in: values };
      conditions.$or.push(r);
    }

    // We're asuming that a batch check will have the same 'uniqueFieldsContext'
    // Hence we only verify the first
    (this.uniqueFieldsContext || '').split(' ').forEach(function (key) {
      if (docs[0][key]) {
        conditions[key] = mongoose.Types.ObjectId.isValid(docs[0][key].toString()) ?
          utils.getId(docs[0][key]) : docs[0][key];
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

    if (!!this._model.schema.paths.organization && req.organizationId) {
      params.conditions.organization = req.organizationId;
    }

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
        condition[key] = utils.filterToRegExp(params.filter);
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

    var func = single && 'findOne' || 'find';
    this._model[func](params.conditions, params.fields, params, function (err, data) {
      if (err || !data) {
        return fn && fn(err);
      }
      var parse = '_parseOutput'.concat(single ? 'Single' : '');
      self[parse](data, req, function (data) {
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
    });
  },

  // Update a foreign key collection using push or pull
  _pushToSet: function _pushToSet(req, key, model, ids, fn) {
    model[key] = _.uniq(utils.getId((model[key] || []).concat(ids)));
    model.save(req, fn);
  },

  _pullFromSet: function _pullFromSet(req, key, model, ids, fn) {
    model[key] = _.without.apply([], utils.getId([model[key] || []].concat(ids)));
    model.save(req, fn);
  }

};
