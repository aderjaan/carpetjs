'use strict';

module.exports = exports = require('util');

var fs = require('fs');

/**
 * Render a template
 */
var swig = require('swig');
exports.template = function (template, options) {
  return swig.renderFile(template, options);
};

/**
 * Returns a string version of the object's id
 * Param can be either a string, ObjectId or Mongoose object
 */
exports.getId = function (obj) {
  if (Array.isArray(obj)) {
    return obj.map(exports.getId);
  }
  if (obj) {
    if (typeof obj === 'string') {
      return obj;
    }
    else if (obj._id) {
      return obj._id.toString();
    }
    else if (obj.toHexString) {
      return obj.toHexString();
    }
    else if (obj.id) {
      return obj.id.toString();
    }
    else if (obj.toString) {
      return obj.toString();
    }
  }
  return '';
};

/**
 * Check for equality of two id's
 * Params can be either strings, ObjectIds or Mongoose objects
 */
exports.idEquals = function (x, y) {
  return exports.getId(x) === exports.getId(y);
};

/**
 * Flattens an object or array of objects to only _ids
 */
exports.flatten = function (obj) {
  if (Array.isArray(obj)) {
    return obj.map(exports.flatten);
  }
  if (obj && obj._id) {
    return utils.getId(obj);
  }
  return obj;
};

/**
 * Strip _ids
 */
exports.stripIds = function (obj) {
  if (Array.isArray(obj)) {
    return obj.map(exports.stripIds);
  }
  obj = new Object(obj);
  if (obj && obj._id) {
    delete obj._id;
  }
  return obj;
};

/**
 * Changes the foreignkey value form an object to an id.
 * Param can be either a string, ObjectId or Mongoose object
 * This way we can change
 * {
 *   name: 'nice name',
 *   function: { _id: 1, name: 'nice function'},
 *   groups: [ {
 *     _id: 2,
 *     name: 'nice group'
 *   }
 *   ]
 * }
 * to
 * {
 *   name: 'nice name',
 *   function: 1,
 *   groups: [2]
 * }
 */
exports.foreignKeyToId = function (Model, doc, foreignKey) {
  var path = Model.schema.paths[foreignKey];
  if (path && doc[foreignKey]) {
    // if we have a ref object, get the id.
    if (path.instance === 'ObjectID' && path.options &&
        path.options.ref && path.instance.ref !== '' &&
        doc[foreignKey]._id) {

      doc[foreignKey] = doc[foreignKey]._id;
    }
    else if (path.caster) {
      // if we have an array with ref objects, get the ids.
      var caster = path.caster;
      if (caster.instance === 'ObjectID' && caster.options &&
          caster.options.ref && path.options.ref !== '' &&
          doc[foreignKey].length > 0 && doc[foreignKey][0]._id) {

        doc[foreignKey] = doc[foreignKey].map(function (item) {
          return item._id;
        });
      }
    }
  }
};

/**
 * Create valid regular expression from filter string
 */
exports.filterToRegExp = function (filter, exact, caseSensitive) {
  var string = filter.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&');
  if (exact) {
    string = '^'.concat(string, '$');
  }
  return new RegExp(string, caseSensitive ? '' : 'i');
};

/**
 * Shortcut to mongoose.Types.ObjectId.isValid
 */
exports.isObjectId = function (id) {
  return mongoose.Types.ObjectId.isValid(id);
};

/**
 * Check for valid email
 */
var validateEmailRx = new RegExp('^[a-z0-9!#$%&\'*+/=?^_`{|}~-]+'.concat(
  '(?:\\.[a-z0-9!#$%&\'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+',
  '[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$'));
exports.validateEmail = function (email) {
  return validateEmailRx.test(email.toLowerCase());
};

/**
 * Delete a local file
 * @param  {String} path Local path of the file
 */
exports.deleteFile = function (path) {
  fs.unlink(path, function (err) {
    if (err) {
      logging.error('Error in deleting file ', path, ' ', err);
    }
  });
};
