'use strict';

/*
 * Ensures that organizationId is compulsory while querying or updating
 */

var validRequest = function validRequest(req) {
  if (req && typeof(req) == "object" && req.hasOwnProperty("originalMethod")) {
    return true;
  } else {
    return false;
  }
}

var attachOrganizationId = function attachOrganizationId(req, conditions) {
  var schema = this.schema || this.model && this.model.schema;

  if (validRequest(req) && req.hasOwnProperty("organizationId")) {
    conditions["organization"] = mongoose.Types.ObjectId(req.organizationId);
  }
  checkOrganizationId(schema, conditions);
}

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
    console.trace('Unsure if organizationId is required and was provided!', conditions);
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
    console.trace('No organizationId provided where required!', conditions);
    throw new Error('bad_request');
  }
};

module.exports = function (mongoose) {

  ['findOne', 'find'].forEach(function (key) {
    var original = mongoose.Model[key];
    mongoose.Model[key] = function (req) {

      if (validRequest(req)) {
        var conditions = arguments[1];
        conditions = conditions || {};

        attachOrganizationId.call(this, req, conditions);

        var args = Array.prototype.slice.call(arguments, 1);
        return original.apply(this, args);
      }
      else {
        return original.apply(this, arguments);
      }
    };
  });

  //['findOne', 'find'].forEach(function (key) {
  //  var original = mongoose.Query.prototype[key];
  //  mongoose.Query.prototype[key] = function (req) {
  //    if (validRequest(req)) {
  //      conditions = arguments[1];
  //      conditions = conditions || {};
  //      conditions.organization = req.organizationId;

  //      var args = Array.prototype.slice.call(arguments, 1);
  //      return original.apply(this, args);
  //    }

  //    return original.apply(this, arguments);
  //  };
  //});

  // Override query execution to check for organizationId
  ['findOne', 'find', 'exec'].forEach(function (key) {
    var original = mongoose.Query.prototype[key];
    mongoose.Query.prototype[key] = function (req) {
      var args;
      var query;

      if (validRequest(req)) {
        query =  arguments[1];
        args = Array.prototype.slice.call(arguments, 1);
      }
      else {
        query = arguments[0];
        args = arguments;
      }

      if (key === 'exec' || (query && typeof query === 'object' && Object.keys(query).length > 0)) {
        var conditions = Object.keys(this._conditions).length ?
              this._conditions : (this._mongooseOptions.conditions || query.conditions || query);

        var schema = this.schema || this.model && this.model.schema;
        if (schema) {
          checkOrganizationId(schema, conditions);
        }
      }

      return original.apply(this, args);
    };
  });

  ['update', 'remove'].forEach(function (key) {
    var original = mongoose.Collection.prototype[key];
    mongoose.Collection.prototype[key] = function (req, query, update) {
      var self = this;
      var model = Object.keys(this.conn.base.models).map(function (m) {
        var mm = self.conn.base.models[m];
        return mm.collection === self && mm;
      }).filter(function (m) {
        return !!m;
      })[0];

      if (key === 'update' && update && update.organization) {
        logging.error('Attempt to modify organizationId!');
        throw new Error('bad_request');
      }

      query.organizationId = req.organizationId;
      update.modified_by = req.UserId;

      var args = Array.prototype.slice.call(arguments, 1);
      return original.apply(this, args);
    };
  });

  // Override findById methods
  ['findById', 'findByIdAndRemove', 'findByIdAndUpdate'].forEach(function (key) {
    var original = mongoose.Model[key];
    mongoose.Model[key] = function (req) {
      /*
        If organizationId is part of the model:
          - assume the first argument to be an organizationId
          - modify the arguments and use the matching findOne method
       */

      var args;
      if (validRequest(req)) {
        args = Array.prototype.slice.call(arguments, 1);
      }
      else {
        args = arguments;
      }

      args[0] = { _id: args[0]};

      if (validRequest(req)) {
        attachOrganizationId.call(this, req, args[0]);
      }

      return this[key.replace('ById', 'One')].apply(this, args);
    };
  });

  var _save = mongoose.Model.prototype.save;
  mongoose.Model.prototype.save = function () {

    if (!this.isNew) {
      if (this.isModified('organization')) {
        logging.error('Attempt to modify organizationId!');
        throw new Error('bad_request');
      }
    }

    return _save.apply(this, arguments);
  };

  //Override Count method
  var _count = mongoose.Model.count;
  mongoose.Model.count = function(req) {
    var args;
    if (validRequest(req)) {
      args = Array.prototype.slice.call(arguments, 1);
    }
    else {
      args = arguments;
    }

    var conditions = args[0] || {};

    attachOrganizationId.call(this, req, conditions);

    return _count.apply(this, args);

  };

  //Override distinct method
  var _distinct = mongoose.Model.distinct;
  mongoose.Model.distinct = function(req) {
    var args;
    if (validRequest(req)) {
      args = Array.prototype.slice.call(arguments, 1);
    }
    else {
      args = arguments;
    }

    var conditions = args[1];
    var fn = args[2];

    if (typeof conditions === 'function') {
      fn = conditions;
      conditions = {};
    }

    conditions = conditions || {};

    attachOrganizationId.call(this, req, conditions);

    return _distinct.apply(this, args);
  };

  //Override Aggregate method
  var _aggregate = mongoose.Model.aggregate;
  mongoose.Model.aggregate = function(req) {
    var args;
    if (validRequest(req)) {
      args = Array.prototype.slice.call(arguments, 1);
    }
    else {
      args = arguments;
    }

    var ops = args[0], fn = ops[1];

    if (typeof ops === 'function') {
      var temp = ops;
      ops = fn;
      fn = temp;
    }

    ops = ops || [];
    if (!ops.length || !ops[0].$match) {
      ops.unshift({ $match: {} });
    }

    attachOrganizationId.call(this, req, ops[0].$match);

    return _aggregate.apply(this, args);
  };

  //Override Insert method
  var _insert = mongoose.Model.prototype.insert;
  mongoose.Model.prototype.insert = function(req) {
    var args;
    if (validRequest(req)) {
      args = Array.prototype.slice.call(arguments, 1);
    }
    else {
      args = arguments;
    }

    var self = this;
    var docs = args[0];

    docs = docs.map(function (doc) {
      attachOrganizationId.call(self, req, docs);
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
