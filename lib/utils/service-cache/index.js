const $ = require('../../../');

const SERVICE_CACHE_DELETE_KEY = 'service_cache_delete_keys';
const getTTL = (name, def) => typeof process.env[name] !== 'undefined' ? process.env[name] : def;

const TTL = getTTL('CACHE_EXPIRY_SERVICE', 5 * 60);
const TTL_MEMORY = getTTL('CACHE_EXPIRY_SERVICE_MEMORY', 10);

const memory = require('cache-manager').caching({ store: 'memory', ttl: TTL_MEMORY });

$.mongoose.model('cache', new $.mongoose.BaseSchema({
  key: { type: String, required: true, unique: true },
  delete_key: { type: String, required: true, unique: true },
  data: {},
  date_expires: {
    type: Date,
    default: () => Date.now + TTL,
    expires: 0
  }
}));

const Collection = $.mongoose.connection.db.collection('caches');

module.exports = {
  wrap (key, work, options, fn) {
    if (typeof options === 'function') {
      fn = options;
      options = {};
    }

    const storeInMemory = data => {
      if (typeof options.delete_key === 'function') {
        options.delete_key = options.delete_key(options, data);
      }

      options.delete_key = options.delete_key || key;

      memory.set(key, data);
      memory.get(SERVICE_CACHE_DELETE_KEY, (err, keys = []) => {
        keys.push(options.delete_key);
        memory.set(SERVICE_CACHE_DELETE_KEY, keys);
      });
    };

    memory.get(key, (err, data) => {
      if (data) {
        $.logging.verbose('cache', `retrieved entry (memory): ${key}`);
        storeInMemory(data);
        return fn(null, data);
      }

      Collection.findOne({ key }, (err, data) => {
        data = data && data.data && JSON.parse(data.data);

        if (data) {
          $.logging.verbose('cache', `retrieved entry: ${key}`);
          storeInMemory(data);
          return fn(null, data);
        }

        return work((err, data) => {
          fn(err, data);

          if (!data) {
            return;
          }

          storeInMemory(data);

          Collection.insert({
            key,
            delete_key: options.delete_key,
            data: JSON.stringify(data),
            date_expires: Date.now() + (options.ttl || TTL)
          }, () => $.logging.verbose('cache', `created entry: ${key}`));
        });
      });
    });
  },

  clear (key, fn = () => {}) {
    const rx = new RegExp(key);

    return memory.get(SERVICE_CACHE_DELETE_KEY, (err, keys = []) => {
      const deletes = [];
      keys = keys.filter(key => {
        if (rx.test(key)) {
          deletes.push(key);
          return false;
        }

        return true;
      });

      deletes.forEach(key => memory.del(key));
      memory.set(SERVICE_CACHE_DELETE_KEY, keys);

      Collection.remove({ delete_key: rx }, err => {
        if (err) {
          $.logging.verbose('cache', `ERROR while deleting entries: ${key}`, err);
        }
        else {
          $.logging.verbose('cache', `deleted entries: ${key}`);
        }

        return fn(err);
      });
    });
  }
};
