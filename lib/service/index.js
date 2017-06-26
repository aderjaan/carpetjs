const $ = require('../../');

const cache = $.utils.serviceCache;

module.exports = function BaseService (Model) {
  this._model = Model;
};

const parseFields = fields => {
  if (Array.isArray(fields)) {
    return fields;
  }
  else if (typeof fields === 'string' && fields) {
    return fields.trim().split(/\s+/);
  }

  return [];
};

const evaluateSort = sort => {
  if (!sort || typeof sort === 'object') {
    return sort || {};
  }

  const output = {};
  sort.toString().split(',').forEach(key => {
    let type = 1;

    if (/^-(.*)$/.test(key)) {
      key = RegExp.$1;
      type = -1;
    }

    output[key] = type;
  });

  return output;
};

const evaluateFields = (fields, service, single) => {
  fields = parseFields(Array.isArray(fields) ? fields[0] : fields);

  let defaults = parseFields((single && service.defaultFieldsSingle) || service.defaultFields);

  if (fields.length) {
    defaults = defaults.concat(parseFields(service.allowedFields));
  }

  return defaults.filter(field => !fields.length || fields.indexOf(field) >= 0).join(' ') || '_id';
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
  cache: { ttl: 5 * 60 },

  create (req, doc, fn) {
    this._createModel(req, doc, (err, model) => {
      if (err) {
        return fn(err);
      }

      this._commit(model, req, 'save', err => fn(err, !err ? model : undefined));
    });
  },

  batchCreate (req, docs, fn, skipExisting) {
    if (!docs.length) {
      return fn(null, docs);
    }

    this._validateCreate(req, docs, err => {
      if (err) {
        if (skipExisting && err.name === 'duplicate_unique_fields' && err.duplicates) {
          const fields = parseFields(this.uniqueFields);
          const values = err.duplicates.reduce((values, duplicate) => {
            fields.forEach(field =>
              values[field] = (values[field] || []).concat(duplicate[field] || []));

            return values;
          }, {});

          docs = docs.filter(doc => {
            for (let i = 0; i < fields.length; i += 1) {
              if (values[fields[i]].includes(doc[fields[i]])) {
                return false;
              }
            }

            return true;
          });

          return this.batchCreate(req, docs, fn, skipExisting);
        }

        return fn(err);
      }

      docs = docs.map(doc => new this._model(doc).toObject());

      this._commit(this._model.collection, req, 'insert', docs, err => {
        if (err) {
          return this.remove({
            _id: { $in: $.utils.getId(docs) }
          }, removeErr => fn(removeErr || err));
        }

        fn(null, docs);
      });
    });
  },

  find (req, params, fn, single) {
    return this._find(req, params, fn, single);
  },

  findOne (req, params, fn) {
    if (typeof params === 'function') {
      fn = params;
      params = {};
    }
    return this.find(req, params, fn, true);
  },

  findById (req, id, fn, params) {
    params = params || {};
    params.conditions = { _id: id };

    return this.find(req, params, fn, true);
  },

  update (req, conditions, changes, fn) {
    const isModel = !!conditions.save;
    const id = $.utils.getId(conditions);
    const single = isModel || $.utils.isObjectId(id);

    const fn_ = (err, data) => {
      if (!err) {
        req.update_success = true;
      }
      return fn(err, data);
    };

    changes = this._strip(changes, this.updateFields);

    // In case of an individual model
    this._validateUpdate(req, id, changes, err => {
      if (err) {
        return fn(err);
      }

      if (isModel) {
        Object.keys(changes).forEach(key => {
          const path = this._model.schema.paths[key];
          const isEmbeddedDocument = path &&
            path.casterConstructor &&
            path.casterConstructor &&
            path.casterConstructor.name === 'EmbeddedDocument';

          // Fields or array that are the same should be skipped
          // Unless it's an embedded document
          const skip = key === '_id' ||
              conditions[key] === changes[key] ||
              (!isEmbeddedDocument && $.utils.idEquals(conditions[key], changes[key]));

          if (!skip) {
            conditions[key] = changes[key];
          }
        });

        return this._commit(conditions, req, 'save', fn_);
      }

      if (single) {
        conditions = { _id: $.utils.getId(conditions) };
        const keys = Object.keys(changes);
        changes = new this._model(changes).toObject({ getters: true });
        changes = keys.reduce((result, key) => Object.assign(result, { [key]: changes[key] }), {});
      }

      this._commit(req, 'update', conditions, {
        // Explicitly use $set to prevent accepting any other (unsafe) $operations
        // In case of need for e.g. $addToSet,
        // we have to expose that in an explicit service method
        $set: this._parseInput(changes)
      }, { multi: true }, fn_);
    });
  },

  remove (req, conditions, fn) {
    const dry = req.query && req.query.dry === '1';
    const confirmed = req.query && req.query.confirmed === '1';
    let dependencies = this.removeDependencies || [];

    const prevents = dependencies.filter(d => d.execute === 'prevent');

    dependencies = dependencies.filter(d => d.execute !== 'prevent');

    const execute = () => {
      if (!this._model.schema.paths.inactive) {
        if (dry) {
          return this._commit(req, 'find', conditions, fn);
        }

        return this._commit(req, 'remove', conditions, fn);
      }
      else if (!this.uniqueFields) {
        conditions.inactive = { $ne: true };

        if (dry) {
          return this._commit(req, 'find', conditions, fn);
        }

        return this._commit(req, 'update', conditions, {
          inactive: true,
          date_inactivated: new Date()
        }, {
          multi: true
        }, fn);
      }

      this.find(req, {
        conditions,
        fields: this.uniqueFields
      }, (err, items) => {
        if (err) {
          return fn(err);
        }
        else if (!items.length) {
          return fn();
        }

        items = items.filter(item => !item.inactive);

        if (!items.length) {
          return fn('item_non_removeable');
        }

        const fields = parseFields(this.uniqueFields);

        let error;
        let done = 0;
        let removed = 0;

        items.forEach(item => {
          const update = { inactive: true };

          fields.forEach(field => {
            if (this._model.schema.paths[field].options.type !== String) {
              return;
            }
            else if (typeof item[field] === 'undefined') {
              return;
            }

            update[field] = `${item[field].toString()}.deleted.${new Date().toISOString()}`;
          });

          const fn_ = err => {
            if (err) {
              error = err;
            }
            else {
              removed += 1;
            }

            done += 1;

            if (done === items.length) {
              fn(error, removed);
            }
          };

          const cond = { _id: $.utils.getId(item) };

          if (dry) {
            return this._commit(req, 'findOne', cond, fn_);
          }

          return this._commit(req, 'update', cond, update, fn_);
        });
      });
    };

    const checkDependencies = () => {
      if (!dependencies.length) {
        return execute();
      }

      const errors = {};

      let error;
      let done = 0;

      return dependencies.forEach(dependency => {
        if (error) {
          return;
        }
        else if (!confirmed) {
          return dependency.query(req, conditions, (err, data) => {
            data = err ? [err] : data;

            if (data && data.length) {
              errors[dependency.name] = data;
            }

            done += 1;

            if (done !== dependencies.length) {
              return;
            }

            return fn({
              name: 'remove_unconfirmed',
              errors
            });
          });
        }

        dependency.execute(req, conditions, err => {
          error = error || err;

          if (error) {
            return fn(error);
          }

          done += 1;

          if (done !== dependencies.length) {
            return;
          }

          return execute();
        });
      });
    };

    if (!prevents.length) {
      return checkDependencies();
    }

    const errors = {};

    let done = 0;

    return prevents.forEach(prevent =>
      prevent.query(req, conditions, (err, data) => {
        data = err ? [err] : data;

        if (data && data.length) {
          errors[prevent.name] = data;
        }

        done += 1;

        if (done !== prevents.length) {
          return;
        }

        if (Object.keys(errors).length) {
          return fn({
            name: 'remove_prevented',
            errors
          });
        }

        return checkDependencies();
      }));
  },

  count (req, conditions, fn) {
    if (!!this._model.schema.paths.inactive && typeof conditions.inactive === 'undefined') {
      conditions.inactive = { $ne: true };
    }

    this._commit(req, 'count', conditions, fn);
  },

  distinct (req, field, conditions, fn) {
    if (typeof conditions === 'function') {
      fn = conditions;
      conditions = {};
    }

    this._commit(req, 'distinct', field, conditions, fn);
  },

  aggregate (req, conditions, fn) {
    this._commit(req, 'aggregate', conditions, fn);
  },

  _commit (model, req, method, ...args) {
    args = [model, req, method, ...args];

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

    const start = new Date();
    const log = JSON.stringify(args.filter(arg => arg && arg.conditions)[0] || {}, null, 2);

    args = args.map(arg => {
      if (typeof arg !== 'function') {
        return arg;
      }

      return (...args) => {
        $.logging.debug('service', '%s: %dms:', method, new Date() - start, log);
        return arg.apply(this, args);
      };
    });

    const originalArgs = args;

    if (!['find', 'findOne', 'aggregate', 'count', 'distinct'].includes(method)) {
      const fn = originalArgs[originalArgs.length - 1];

      if (typeof fn === 'function') {
        originalArgs[originalArgs.length - 1] = (...args) => {
          cache.clear(this._cachePrefix(req, this.cache, 2), () => fn(...args));
        };
      }

      return model[method](...originalArgs);
    }

    const fn = args[args.length - 1];
    args = args.slice(0, args.length - 1);

    req = args[0] && {}.hasOwnProperty.call(args[0], 'originalMethod') && req;
    const cleanArgs = (req ? args.slice(1) : args);
    const params = cleanArgs[2];
    const lean = params && typeof params.lean !== 'undefined' ? params.lean : true;

    let options = params && params.cache;

    if ([false, 0].includes(options)) {
      return model[method](...originalArgs);
    }

    options = Object.assign({ ttl: 60 }, this.cache || {}, options || {});

    if (options.ttl <= 0) {
      return model[method](...originalArgs);
    }

    if (!options.key) {
      options.key = `${this._cachePrefix(req, options)}_${$.utils.hash([].concat(cleanArgs))}`;
    }

    $.logging.verbose('service', req, `QUERY: ${this._model.modelName} (${options.key})`);
    cache.wrap(options.key, fn => model[method](...args, fn), options, (err, data) => {
      if (!data) {
        return fn(err, data);
      }
      else if (!lean) {
        data = this._hydrate(data, params);
      }

      return fn(null, data);
    });
  },

  _strip (doc, whitelist) {
    const schema = this._model.schema;

    Object.keys(doc).forEach(key => {
      if (doc[key] && !!doc[key]._id) {
        doc[key] = $.utils.getId(doc[key]);
      }

      const enumValues = (schema.paths[key] && schema.paths[key].enumValues) || [];
      if (doc[key] === '' && enumValues.length && enumValues.indexOf(doc[key]) < 0) {
        doc[key] = undefined;
      }
    });

    if (!whitelist) {
      return doc;
    }

    return parseFields(whitelist).reduce((d, key) => {
      if ({}.hasOwnProperty.call(doc, key)) {
        d[key] = doc[key];
      }

      return d;
    }, {});
  },

  _parseInput (doc) {
    if (doc.toObject) {
      doc = JSON.parse(JSON.stringify(doc.toObject({ depopulate: true })));
    }

    delete doc._id;
    delete doc.id;
    delete doc.__v;
    return doc;
  },

  _createModel (req, doc, fn) {
    doc = this._strip(doc, this.createFields || this.updateFields);
    this._validateCreate(req, doc, err => {
      if (err) {
        return fn(err);
      }
      fn(null, new this._model(this._parseInput(doc)));
    });
  },

  _validateCreate (req, docs, fn) {
    docs = Array.isArray(docs) ? docs : [docs];
    return this._validateUnique(req, null, docs, fn);
  },

  _validateUpdate (req, id, docs, fn) {
    docs = Array.isArray(docs) ? docs : [docs];
    return this._validateUnique(req, id, docs, fn);
  },

  _validateUnique (req, id, docs, fn) {
    docs = Array.isArray(docs) ? docs : [docs];

    if (!docs.length) {
      return fn();
    }

    const lowerCase = !!this.uniqueFieldsLowerCase;
    const uniqueFields = parseFields(this.uniqueFields);
    const error = duplicates => {
      const values = uniqueFields.reduce((values, key) => [
        ...values,
        ...duplicates.map(d => d[key])
      ], []);

      return {
        name: 'duplicate_unique_fields',
        message: `The following items already exist: "${values.join('/')}"`,
        duplicates
      };
    };

    let conditions = [];

    for (let i = 0; i < uniqueFields.length; i += 1) {
      const keys = uniqueFields[i].replace(/&/g, '+').split('&');
      const values = docs
        .map(doc => keys.reduce((result, key) => {
          if (lowerCase && typeof doc[key] === 'string') {
            doc[key] = doc[key].toLowerCase();
          }

          const val = $.utils.tryGetId(doc[key], true);

          if (val) {
            result[key] = val;
          }

          return result;
        }, {}))
        .filter(value => !!Object.keys(value).length);

      if (values.length) {
        // Check if the list itself contains duplicates, otherwise return immediately
        const jvalues = values.map(value => JSON.stringify(value));
        const duplicates = values.filter(value => {
          value = JSON.stringify(value);
          return jvalues.indexOf(value) !== jvalues.lastIndexOf(value);
        });

        if (duplicates.length) {
          return fn(error(duplicates));
        }

        conditions = conditions.concat(values);
      }
    }

    if (!conditions.length) {
      return fn();
    }

    conditions.forEach(condition => Object.keys(condition).forEach(key => {
      if (key !== '$or' && Array.isArray(condition[key])) {
        condition.$or = condition.$or || [].concat(condition[key].map(sub => ({
          [key]: { $elemMatch: sub }
        })));

        delete condition[key];
      }
    }));

    conditions = { $or: conditions };

    if (id) {
      conditions._id = { $ne: id };
    }

    const uniqueFieldsContext = parseFields(this.uniqueFieldsContext);
    conditions = uniqueFieldsContext.reduce((conditions, key) => {
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

    return this.find(req, { conditions }, (err, existing) => {
      if (existing && existing.length) {
        return fn(error(existing));
      }

      fn();
    });
  },

  _find (req, params, fn, single) {
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

    params.fields = evaluateFields(params.fields, this, single);

    params.populate = typeof params.populate !== 'undefined' ? params.populate :
      (single && this.defaultPopulateSingle) || this.defaultPopulate;

    if (!params.populate || (Array.isArray(params.populate) && !params.populate.length)) {
      delete params.populate;
    }
    else if (Array.isArray(params.populate) && !!params.populate[0].path) {
      params.populate = [params.populate];
    }

    params.lean = typeof params.lean !== 'undefined' ? params.lean : true;

    const isApiCall = /\/api\//.test(req && req.originalUrl);

    params.limit = parseInt(params.limit !== undefined ? params.limit :
      (isApiCall ? this.defaultLimit : 0), 10);
    params.page = Math.max(1, parseInt(params.page || 1, 10));

    if (params.page > 1) {
      params.skip = params.limit * (params.page - 1);
    }

    params.sort = Object.assign({}, params.sort || {});

    if (params.sort_by) {
      const sortTypes = (params.sort_type && params.sort_type.toString().split(',')) || [];
      const sort = params.sort_by.toString().split(',').map((key, i) => {
        const path = this._model.schema.paths[key];
        if (path && path.options && path.options.shadow) {
          key = path.options.shadow;
        }

        return `${sortTypes[i] === '-1' ? '-' : ''}${key}`;
      }).join(',');

      params.sort = Object.assign(params.sort, evaluateSort(sort));

      delete params.sort_by;
      delete params.sort_type;
    }

    const defaultSort = evaluateSort(this.defaultSort);
    Object.keys(params.sort).forEach(key => delete defaultSort[key]);

    params.sort = Object.assign(params.sort, defaultSort);

    if (params.filter) {
      const searchFields = parseFields(params.searchFields || this.defaultSearchFields);

      delete params.searchFields;

      params.conditions.$or = searchFields.map(key => {
        const condition = {};
        const path = this._model.schema.paths[key];
        const number = parseFloat(params.filter);

        if (key === '$text') {
          condition[key] = { $search: params.filter };
        }
        else if (path && (path.instance === 'Number')) {
          if (isNaN(number)) {
            return undefined;
          }

          condition[key] = number;
        }
        else if (path && (path.instance === 'Date')) {
          const date = new Date(params.filter);

          if (isNaN(date)) {
            return undefined;
          }

          condition[key] = date;
        }
        else {
          const regex = $.utils.filterToRegExp(params.filter);

          if (!isNaN(number)) {
            condition.$or = [{
              [key]: number
            }, {
              [key]: regex
            }];
          }
          else {
            condition[key] = regex;
          }
        }

        return condition;
      }).filter(condition => condition);

      if (!params.conditions.$or.length) {
        // None of the searchFields could be evaluated, hence force no results
        params.conditions.$or.push({ __noop__: '__noop__' });
      }
    }

    const filterFields = parseFields(this.filterFields).reduce((fields, field) => {
      if (/^(.*?\.)\*$/.test(field)) {
        const prefix = RegExp.$1;
        Object.keys(params.query).forEach(key => {
          if (key.indexOf(prefix) === 0) {
            fields.push(key);
          }
        });
      }
      else {
        fields.push(field);
      }

      return fields;
    }, ['_id']);

    filterFields.forEach(key => {
      let filter = params.query[key];

      if (typeof filter === 'string') {
        filter = filter.split(',');
      }
      else if (filter && !Array.isArray(filter)) {
        filter = [filter];
      }

      // Check if the field is supplied with `_from` and/or `_until` keys
      if (/^date_/.test(key)) {
        const keyFrom = `${key}_from`;
        const keyUntil = `${key}_until`;

        let from = params.query[keyFrom];
        let until = params.query[keyUntil];

        if (from) {
          from = $.utils.parseRelativeDate(from) || from;
          filter = (filter || []).concat(`>=${from}`);
        }
        if (until) {
          until = $.utils.parseRelativeDate(until) || until;
          filter = (filter || []).concat(`<${until.length <= 10 ? '=' : ''}${until}`);
        }
      }

      if (!filter || !filter.length) {
        return;
      }

      const path = this._model.schema.paths[key];
      if (path && (path.instance === 'Number' || path.instance === 'Date')) {
        filter = filter.map(value => {
          let mod = '';

          if (/^([<>])(=?)(.*?)$/.test(value)) {
            mod = `$${RegExp.$1 === '<' ? 'lt' : 'gt'}${RegExp.$2 === '=' ? 'e' : ''}`;
            value = RegExp.$3;
          }

          if (path.instance === 'Number') {
            try {
              value = +value;
            }
            catch (ex) {}

            if (mod) {
              return { [mod]: value };
            }
          }
          else if (path.instance === 'Date') {
            const date = new Date(value);
            const dummy = '2016-01-01T00:00:00.000';

            let offset = req.headers['x-utc-offset'] || '+00:00';
            offset = (Date.parse(`${dummy}${offset}`) - Date.parse(dummy)) / 60000;

            if (!isNaN(offset)) {
              date.setMinutes(date.getMinutes() + offset);
            }

            if (!isNaN(date)) {
              const nextDay = new Date(date);
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

              return { [mod]: date };
            }
          }

          return value;
        });
      }

      const complex = filter.length > 1 && filter.some(value => typeof value === 'object');

      filter = filter.map(filter => {
        if (filter === '-') {
          return null;
        }
        else if (filter === 'false') {
          return false;
        }
        else if (filter === 'true') {
          return true;
        }
        return filter;
      });

      if (complex) {
        params.conditions.$and = (params.conditions.$and || [])
          .concat(filter.map(value => ({ [key]: value })));
      }
      else {
        params.conditions[key] = filter.length === 1 ? filter[0] : { $in: filter };
      }
    });

    const method = (single && 'findOne') || 'find';

    delete params.query;

    this._commit(req, method, params.conditions, params.fields, params, (err, data) => {
      if (err || !data) {
        return fn && fn(err);
      }
      else if (params.pagination_headers) {
        return this.count(req, params.conditions, (errCount, count) => {
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

  _cachePrefix (req, options, depth = 100) {
    const fields = (req && options && options.reqFields) || [];

    return fields.reduce((prefixes, key) => [
      ...prefixes,
      ...([].concat(req[key] || []))
    ], [this._model.modelName.toLowerCase()]).slice(0, depth).join('_');
  },

  // Hydrate an object to a mongoose model
  _hydrate (data, params = {}, Model = this._model) {
    if (Array.isArray(data)) {
      return data.map(data => this._hydrate(data, params, Model));
    }

    // Already a model
    if (data.save) {
      return data;
    }

    const fields = Object.keys(data);
    const model = new Model(data, data);

    model.$__reset();
    model.isNew = false;

    const isString = item => typeof item === 'string' || $.utils.isObjectId(item.toString());

    // TODO: Research on how to restore a model with populated data
    // https://github.com/Automattic/mongoose/issues/4727
    Object.keys(data).forEach(key => {

      const from = [].concat(data[key] || []);
      const to = [].concat(model[key] || []);

      if (!from.every(isString) && to.every(isString)) {
        const path = Model.schema.paths[key];
        let ref;

        if (path && path.options && path.options.ref) {
          ref = path.options.ref;
        }
        else if (path && path.caster && path.caster.options && path.caster.options.ref) {
          ref = path.caster.options.ref;
        }
        else {
          const populate = $.utils.flattenArray((params && params.populate) || []);
          ref = (populate.find(populate => populate.path === key) || {}).model;
        }

        const subModel = ref && $.mongoose.model(ref);

        if (subModel) {
          data[key] = this._hydrate(data[key], params, subModel);
        }

        model.setValue(key, data[key]);
      }
    });

    model._doc = Object.keys(model._doc).reduce((doc, key) => {
      if (fields.indexOf(key) >= 0) {
        doc[key] = model._doc[key];
      }

      return doc;
    }, {});

    // TODO: This should all happen with proper `hydrate`
    model.emit('init', model);
    model.$__.wasPopulated = true;
    model.__v = 0;

    return model;
  },

  // Update a foreign key collection using push or pull
  _pushToSet (req, key, data, ids, fn, model) {
    data[key] = [...new Set($.utils.getId([...data[key], ...ids]))];
    this._commit(model || data, req, 'save', fn);
  },

  _pullFromSet (req, key, data, ids, fn, model) {
    ids = $.utils.getId(ids);
    data[key] = data[key].filter(id => !ids.includes($.utils.getId(id)));
    this._commit(model || data, req, 'save', fn);
  }
};
