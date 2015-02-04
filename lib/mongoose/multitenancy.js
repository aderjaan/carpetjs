'use strict';

/*
 * Ensures that organizationId is compulsory while querying or updating
 */

var validRequest = function validRequest(req) {
  if (req && typeof req === 'object' && req.hasOwnProperty('originalMethod')) {
    return true;
  }
  else {
    return false;
  }
};

var sansRequestArguments = function sansRequestArguments(args) {
  var req = args[0];
  if (validRequest(req)) {
    args = Array.prototype.slice.call(args, 1);
  }
  return args;
};

var getModelForCollection = function getModelForCollection() {
  var self = this;
  return Object.keys(self.conn.base.models).map(function (m) {
    var mm = self.conn.base.models[m];
    return mm.collection === self && mm;
  }).filter(function (m) {
    return !!m;
  })[0];
};

var checkOrganizationId = function checkOrganizationId(schema, conditions) {

  if (Array.isArray(conditions)) {
    return conditions.forEach(function (c) {
      checkOrganizationId(schema, c);
    });
  }

  /*
    If organizationId is part of the model:
      - enforce organizationId to exist query conditions
      - enforce organizationId to be a scalar
        (to prevent hijacking with { $exists: true } etc.)
   */

  if ((!schema || !schema.paths)) {
    // TODO: find another way of checking if organizationId is necessary
    logging.error('Unsure if organizationId is required and was provided!', conditions);
    throw new Error('bad_request');
  }

  // Pass if only _id or only _id and organization are queried
  if (/(^|_id)(,inactive)?(,organization)?$/.test(Object.keys(conditions).sort().join())) {
    return;
  }

  // Exception for mongoose nested set who queries on only parentId
  if (/parentId$/.test(Object.keys(conditions).sort().join())) {
    return;
  }

  var requireOrganizationId = schema && schema.paths && !!schema.paths.organization;
  var organizationId = conditions.organization;
  if (requireOrganizationId &&
    (!organizationId || !mongoose.Types.ObjectId.isValid(utils.getId(organizationId)))) {
    logging.error('No organizationId provided where required!', conditions);
    throw new Error('bad_request');
  }
};

var attachOrganizationId = function attachOrganizationId(req, conditions) {
  var self = this;
  var schema = self.schema || (self.model && self.model.schema);

  if (schema && schema.paths && !!schema.paths.organization) {
    if (validRequest(req) && req.hasOwnProperty('organizationId')) {
      conditions.organization = mongoose.Types.ObjectId(req.organizationId);
    }
  }

  checkOrganizationId(schema, conditions);
};

module.exports = function (mongoose) {

  ['findOne', 'find'].forEach(function (key) {
    var original = mongoose.Model[key];
    mongoose.Model[key] = function (req) {
      var args = sansRequestArguments(arguments);

      var conditions = args[0];
      conditions = conditions || {};

      attachOrganizationId.call(this, req, conditions);

      args[0] = conditions;
      return original.apply(this, args);
    };
  });

  // Override query execution to check for organizationId
  ['findOne', 'find', 'exec'].forEach(function (key) {
    var original = mongoose.Query.prototype[key];
    mongoose.Query.prototype[key] = function () {
      var args = sansRequestArguments(arguments);
      var query = args[0];

      if (key === 'exec' || (query && typeof query === 'object' && Object.keys(query).length > 0)) {
        var conditions = Object.keys(this._conditions).length ?
              this._conditions : (this._mongooseOptions.conditions || query.conditions || query);

        var schema = this.schema || this.model && this.model.schema;
        if (schema) {
          checkOrganizationId(schema, conditions);
        }
      }

      args[0] = query;
      return original.apply(this, args);
    };
  });

  var _remove = mongoose.Collection.prototype.remove;
  mongoose.Collection.prototype.remove = function (req) {
    var args = sansRequestArguments(arguments);

    var query = args[0];
    var model = getModelForCollection.call(this);
    attachOrganizationId.call(model, req, query);

    args[0] = query;
    return _remove.apply(this, args);
  };

  var _update = mongoose.Model.update;
  mongoose.Model.update = function (req) {
    var args = sansRequestArguments(arguments);

    var query = args[0];
    var update = args[1];

    if (update && update.organization) {
      logging.error('Attempt to modify organizationId!');
      throw new Error('bad_request');
    }

    attachOrganizationId.call(this, req, query);

    if (validRequest(req)) {
      update.app_name = req.appName;
      update.date_updated = Date.now();
      update.modified_by = req.UserId;
    }

    args[0] = query;
    args[1] = update;

    return _update.apply(this, args);
  };

  // Override findById methods
  ['findById', 'findByIdAndRemove', 'findByIdAndUpdate'].forEach(function (key) {
    mongoose.Model[key] = function (req) {
      /*
        If organizationId is part of the model:
          - assume the first argument to be an organizationId
          - modify the arguments and use the matching findOne method
       */

      var args = sansRequestArguments(arguments);

      args[0] = { _id: args[0] };

      if (validRequest(req)) {
        attachOrganizationId.call(this, req, args[0]);
      }

      return this[key.replace('ById', 'One')].apply(this, args);
    };
  });

  var _save = mongoose.Model.prototype.save;
  mongoose.Model.prototype.save = function (req) {
    var args = sansRequestArguments(arguments);

    if (!this.isNew) {
      if (this.isModified('organization')) {
        logging.error('Attempt to modify organizationId!');
        throw new Error('bad_request');
      }
    }

    if (validRequest(req)) {
      this.modified_by = req.userId;
      this.app_name = req.appName;
    }

    return _save.apply(this, args);
  };

  // Override Count method
  var _count = mongoose.Model.count;
  mongoose.Model.count = function (req) {
    var args = sansRequestArguments(arguments);

    var conditions = args[0] || {};
    attachOrganizationId.call(this, req, conditions);

    args[0] = conditions;
    return _count.apply(this, args);

  };

  // Override distinct method
  var _distinct = mongoose.Model.distinct;
  mongoose.Model.distinct = function (req) {
    var args = sansRequestArguments(arguments);

    var conditions = args[1];
    var fn = args[2];

    if (typeof conditions === 'function') {
      conditions = [fn, fn = conditions][0];
    }

    conditions = conditions || {};

    attachOrganizationId.call(this, req, conditions);

    args[1] = conditions;
    args[2] = fn;

    return _distinct.apply(this, args);
  };

  // Override Aggregate method
  var _aggregate = mongoose.Model.aggregate;
  mongoose.Model.aggregate = function (req) {
    var args = sansRequestArguments(arguments);

    if (args.length) {
      var firstOp = args[0];

      if (Array.isArray(firstOp)) { // Is an array of Operations
        if (!firstOp.length || !firstOp[0].$match) {
          firstOp.unshift({ $match: {} });
        }

        attachOrganizationId.call(this, req, firstOp[0].$match);
        args[0] = firstOp;
      }
      else if (!firstOp.$match) {
        args.unshift({ $match: {} });
        attachOrganizationId.call(this, req, args[0].$match);
      }
    }
    else {
      args.unshift({ $match: {} });
      attachOrganizationId.call(this, req, args[0].$match);
    }

    return _aggregate.apply(this, args);
  };

  // Override Insert method
  var _insert = mongoose.Model.prototype.insert;
  mongoose.Model.prototype.insert = function (req) {
    var args = sansRequestArguments(arguments);

    var self = this;
    var docs = args[0];

    args[0] = docs.map(function (doc) {
      attachOrganizationId.call(self, req, docs);
      doc.app_name = req.appName;
      doc.modified_by = req.UserId;
      return doc;
    });

    return _insert.apply(this, args);
  };

  // Override Schema to check for organizationId while saving
  var _schema = mongoose.Schema;
  mongoose.Schema = function () {
    _schema.apply(this, arguments);
    this.post('init', function () {
      this._original = this.toObject();
    });
  };

  Object.keys(_schema).concat('prototype').forEach(function (key) {
    mongoose.Schema[key] = _schema[key];
  });

};
