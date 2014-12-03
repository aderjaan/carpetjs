'use strict';

/*
 * Inject the mongoose save method and save an entry to the History collection where needed
 */

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
  model.modifiedPaths().forEach(function (key) {
    if (SKIP_HISTORY.indexOf(key) >= 0) {
      return;
    }

    // Skip modifications to not own properties
    if (!model.schema.tree[key]) {
      return;
    }

    var to = model[key] || null;
    to = to && to.toObject ? to.toObject() : to;

    var from = model._original[key] || null;
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

    if (_.isEqual(to, from) || utils.idEquals(to, from, true)) {
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

  if (!req || !req.userId || !req.organizationId) {
    logging.error(req, 'No userId and/or organizationId provided where required!');
    throw new Error('invalid_request');
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

module.exports = function (mongoose) {

  var _save = mongoose.Model.prototype.save;
  mongoose.Model.prototype.save = function (req) {

    // If 'req' object was passed, slice it off
    var args = Array.prototype.slice.call(arguments, 0);
    if (req && (!!req.organizationId || !!req.userId)) {
      args = Array.prototype.slice.call(arguments, 1);
    }

    if (!this.isNew) {
      saveHistory(this.schema, this, req);
    }

    return _save.apply(this, args);
  };

};
