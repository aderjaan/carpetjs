'use strict';

// TODO: this could be model specific
var SKIP_HISTORY = 'last_updated'.split(' ');

var saveHistory = function saveHistory(schema, model, req) {

  if (!schema.paths.history) {
    return;
  }

  if (!model.collection) {
    // This should never occur...
    logging.warn(req, 'Can not set history entity because collection name cannot be derived!');
    return;
  }

  var changes = [];

  var modified = model.isNew ? Object.keys(model.toObject()) : model.modifiedPaths();

  modified.forEach(function (key) {
    if (SKIP_HISTORY.indexOf(key) >= 0) {
      return;
    }

    // Skip modifications to not own properties
    if (!model.schema.tree[key]) {
      return;
    }

    var to = model[key] || null;
    to = to && to.toObject ? to.toObject() : to;

    var from = model._original && model._original[key] || null;
    from = from && from.toObject ? from.toObject() : from;

    var prop = model.schema.tree[key];
    if (prop.length && prop[0].ref || prop.ref) {
      from = utils.flatten(from);
      to = utils.flatten(to);
    }
    else {
      from = utils.stripIds(from);
      to = utils.stripIds(to);
    }

    if (_.isEqual(to, from) || utils.idEquals(to, from)) {
      return;
    }

    changes.push({
      to: to,
      from: from,
      key: key
    });

  });

  if (!changes.length) {
    return;
  }

  // Probably a worker request, so don't record
  // TODO: do we need history written by workers?
  if (!req || !req.userId) {
    return;
  }

  var history = new $.model('history', 'shared')({
    organization: req.organizationId,
    user: req.userId,
    changes: changes,
    entity: {
      $ref: model.collection.name,
      $id: model.id
    }
  });

  history.save(function (err) {
    if (err || !history._id) {
      logging.error('Can not save history item', err);
      return;
    }
    /* This fires an extra update query which is inefficient but currently due a limitation
    *  in mongoose
    *  https://github.com/LearnBoost/mongoose/issues/2230
    *
    *  Ideally we would want to use model.$push = { history: history._id } */
    model.collection.update({ _id: model._id }, {
      $push: { history: history._id }
    }, function () {});
  });

};

module.exports = {

  /*
   * Inject the mongoose save method and save an entry to the History collection where needed
   */
  save: function (mongoose) {
    var _save = mongoose.Model.prototype.save;
    mongoose.Model.prototype.save = function (req) {

      // If 'req' object was passed, slice it off
      var args = Array.prototype.slice.call(arguments, 0);
      if (req && (!!req.organizationId || !!req.userId || !!req.res)) {
        args = Array.prototype.slice.call(arguments, 1);
        saveHistory(this.schema, this, req);
      }

      return _save.apply(this, args);
    };
  },

  /*
   * Parse history data and enrich it with data from other collections
   */
  parse: function (req, data, appName, model, cb) {
    var contains = function (list, o) {
      if (utils.isObjectId(o._id || o)) {
        return utils.getId(list).indexOf(utils.getId(o)) === -1;
      }
      else {
        return _.any(list, function (oo) {
          return _.isEqual(oo, o);
        });
      }
    };

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
        var serviceName = key;
        var thisAppName = appName;

        // Try to derive the serviceName
        var path = model.schema && model.schema.paths && model.schema.paths[key];
        if (path && path.options && path.options.ref) {
          var split = path.options.ref.split('.');
          serviceName = split[0];
          if (split.length === 2) {
            thisAppName = split[0];
            serviceName = split[1];
          }
        }

        // Camelize and pluralize serviceName
        serviceName = $.camelize(serviceName.toLowerCase());
        if (!/s$/.test(serviceName)) {
          serviceName += 's';
        }

        var service = $.service(serviceName, thisAppName) || $.service(serviceName, 'shared');
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
          });
          fn();
        });
      };
    }), function () {
      // In case of arrays, give more friendly response (added/remove iso from/to)
      changes.forEach(function (change) {
        if (!change.from && Array.isArray(change.to)) {
          change.from = [];
        }
        if (Array.isArray(change.from) && Array.isArray(change.to)) {
          change.added = change.to.filter(function (o) {
            return !contains(change.from, o);
          });
          change.removed = change.from.filter(function (o) {
            return !contains(change.to, o);
          });
          delete change.from;
          delete change.to;
        }
      });
      utils.api.setPaginationHeaders(data, req.res);
      cb(data);
    });
  }

};
