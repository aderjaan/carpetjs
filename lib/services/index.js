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

  batchCreate: function batchCreate(req, docs, fn) {
    var self = this;
    var created = [];
    async.each(docs, function (doc, cb) {
      self.create(req, doc, function (err, model) {
        if (model) {
          created.push(model);
          model = model.toObject ? model.toObject() : model;
          for (var key in model) {
            doc[key] = model[key];
          }
        }
        cb(err);
      }, { mock: true });
    }, function (err) {
      if (err) {
        return fn(err);
      }
      created = created.map(function (model) {
        return model.toObject ? model.toObject() : model;
      });
      self._model.collection.insert(created, function (err) {
        if (!err) {
          return fn(null, docs);
        }
        self.remove({
          _id: { $in: utils.getId(created) }
        }, function (removeErr) {
          fn(removeErr || err);
        });
      });
    });
  },

  create: function create(req, doc, fn, options) {
    var self = this;

    options = options || {};

    doc = this._strip(doc, this.createOptions || this.updateOptions);

    if (!!this._model.schema.paths.organization) {
      doc.organization = mongoose.Types.ObjectId(req.organizationId);
    }

    this._validateCreate(req, doc, function (err) {
      if (err) {
        return fn(err);
      }

      var model = new self._model(self._parseInput(doc));

      if (options.mock) {
        return fn(null, model);
      }

      model.save(req, function (err, item) {
        if (err) {
          return fn(err);
        }
        return self.findOne(req, {
          conditions: {
            _id: item._id
          },
          lean: false
        }, fn);
      });
    });
  },

  find: function find(req, params, fn) {
    return this._find(req, params, fn);
  },

  findOne: function findOne(req, params, fn) {
    if (typeof params === 'function') {
      fn = params;
      params = {};
    }
    return this._find(req, params, fn, true);
  },

  findById: function findById(req, id, fn, options) {
    options = options || {};
    options.lean = options.lean !== undefined ? options.lean : true;
    return this._find(req, {
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

  _validateCreate: function _validateCreate(req, doc, fn) {
    return this._validateUnique(req, null, doc, fn);
  },

  _validateUpdate: function _validateUpdate(req, id, doc, fn) {
    return this._validateUnique(req, id, doc, fn);
  },

  _validateUnique: function _validateUnique(req, id, doc, fn) {

    var conditions = {
      $or: _.compact((this.uniqueFields || '').split(' ').map(function (key) {
        if (doc[key]) {
          var r = {};
          r[key] = mongoose.Types.ObjectId.isValid(doc[key].toString()) ?
            utils.getId(doc[key]) : doc[key];
          return r;
        }
        return undefined;
      }))
    };

    (this.uniqueFieldsContext || '').split(' ').forEach(function (key) {
      if (doc[key]) {
        conditions[key] = mongoose.Types.ObjectId.isValid(doc[key].toString()) ?
          utils.getId(doc[key]) : doc[key];
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
        return fn(new Error('duplicate_unique_fields'));
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
