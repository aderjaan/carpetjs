'use strict';

/*
 * Ensures that organizationId is compulsory while querying or updating
 */

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

  if (!schema || !schema.paths) {
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

module.exports = function (mongoose) {

  // Override query execution to check for organizationId
  ['find', 'findOne', 'count', 'exec'].forEach(function (key) {
    var original = mongoose.Query.prototype[key];
    mongoose.Query.prototype[key] = function (query) {
      if (key === 'exec' || (query && typeof query === 'object' && Object.keys(query).length > 0)) {
        var conditions = Object.keys(this._conditions).length ?
              this._conditions : (this._mongooseOptions.conditions || query.conditions || query);

        var schema = this.schema || this.model && this.model.schema;
        if (schema) {
          checkOrganizationId(schema, conditions);
        }
      }

      return original.apply(this, arguments);
    };
  });

  ['update', 'insert', 'remove'].forEach(function (key) {
    var original = mongoose.Collection.prototype[key];
    mongoose.Collection.prototype[key] = function (query, update) {
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

      checkOrganizationId(model.schema, query);

      return original.apply(this, arguments);
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

      if (!!this.schema.paths.organization) {
        var args = Array.prototype.slice.call(arguments, 1);
        args[0] = { _id: args[0], organization: req.organizationId };
        return this[key.replace('ById', 'One')].apply(this, args);
      }
      return original.apply(this, arguments);
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
