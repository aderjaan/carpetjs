'use strict';

/*
 * Set of helper functions that can be used in migrations
 */
module.exports = {
  DELAY: 100,
  collection: function (collection) {
    if (typeof collection === 'string') {
      return mongoose.connections[0].collection(collection);
    }
    return collection;
  },
  iterate: function (collectionName, query, done, handler) {
    var collection = this.collection(collectionName);
    if (typeof query === 'function') {
      handler = done;
      done = query;
      query = {};
    }
    var cursor = collection.find(query);
    var count = 0;
    var doNext = function () {
      cursor.nextObject(function (err, doc) {
        if (err || !doc) {
          if (err) {
            logging.error(err);
          }
          else {
            // If there is no error and no document, we've reached the last iteration
            logging.info('Updated %d documents in %s', count, collectionName);
          }
          // Timeout so that logging is visible
          return setTimeout(function () {
            done(err);
          }, module.exports.DELAY);
        }
        var update = typeof handler === 'function' ? handler(doc) : handler;
        if (!update) {
          return doNext();
        }
        collection.update({ _id: doc._id }, update, function (err) {
          if (err) {
            logging.error(err);
            return done(err);
          }
          count++;
          doNext();
        });
      });
    };
    doNext();
  },
  renameFieldsInArrays: function (collectionName, query, done, map) {
    if (typeof query === 'function') {
      map = done;
      done = query;
      query = {};
    }
    this.iterate(collectionName, query, done, function (doc) {
      var set = {}, unset = {}, changes = false;

      Object.keys(map).forEach(function (key) {
        Object.keys(map[key]).forEach(function (property) {
          if (Array.isArray(doc[key])) {
            doc[key].forEach(function (value, i) {
              unset[key.concat('.', i, '.', property)] = 1;
              set[key.concat('.', i, '.', map[key][property])] = value[property];
              changes = true;
            });
          }
        });
      });
      return changes ? { $unset: unset, $set: set } : null;

    });
  },
  update: function (collectionName, query, done, update) {
    var collection = this.collection(collectionName);
    if (typeof query === 'function') {
      update = done;
      done = query;
      query = {};
    }
    collection.update(query, update, { multi: true }, function (err, count) {
      if (err) {
        logging.error(err);
      }
      else {
        logging.info('Updated %d documents in %s (at once)', count, collectionName);
      }
      // Timeout so that logging is visible
      return setTimeout(function () {
        done(err);
      }, module.exports.DELAY);
    });
  },
  insert: function (collectionName, doc, handler) {
    var collection = this.collection(collectionName);

    collection.insert(doc, function (err, newdoc) {
      if (err) {
        logging.error(err);
      }
      else {
        logging.info('Inserted %d documents in %s', newdoc.length, collectionName);
      }

      handler(err, newdoc);
    });
  },
  remove: function (collectionName, query, handler) {
    if (typeof query === 'function') {
      handler = query;
      query = {};
    }
    var collection = this.collection(collectionName);
    collection.remove(query, function (err, count) {
      if (err) {
        logging.error(err);
      }
      else {
        logging.info('Removed %d documents in %s (at once)', count, collectionName);
      }

      handler(err, count);
    });
  }
};
