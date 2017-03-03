const $ = require('../../../');
const manager = require('cache-manager');

const EXPIRY = process.env.SERVICE_CACHE_EXPIRY;
const TTL = typeof EXPIRY !== 'undefined' ? parseInt(EXPIRY, 10) : 5 * 60;

// In case redis is used, memory ttl should be short
const MEMORY_TTL = TTL / ($.config.cache.includes('redis') ? 10 : 1);

const stores = $.config.cache.map(store => {
  if (store === 'redis') {
    return manager.caching({
      store: require('cache-manager-redis'),
      url: process.env.REDISCLOUD_URL,
      compress: true,
      ttl: TTL
    });
  }

  return manager.caching({ ttl: MEMORY_TTL, store });
});

stores.forEach(store => {
  if (!store.store || store.store.name !== 'memory') {
    return;
  }

  const _keys = store.keys;
  store.keys = (pattern, fn) => {
    if (typeof pattern === 'function') {
      fn = pattern;
      pattern = null;
    }

    _keys.call(store, (err, keys) => {
      if (pattern) {
        pattern = pattern.replace(/\*/g, '');
        keys = keys.filter(key => key.includes(pattern));
      }

      return fn(err, keys);
    });
  };
});

if (stores.length === 1) {
  module.exports = stores[0];
}
else {
  module.exports = require('cache-manager').multiCaching(stores);
}

const _del = module.exports.del;
const deleters = {};
module.exports.del = (keys, fn = () => {}) => {
  keys = [].concat(keys || []);

  if (!keys.length) {
    return fn();
  }

  let done = 0;

  const fn_ = () => {
    done += 1;

    if (done === keys.length) {
      return fn();
    }
  };

  keys.forEach(key => {
    if (deleters[key]) {
      return deleters[key].push(fn_);
    }

    deleters[key] = [fn_];
    return _del.call(module.exports, key, () => {
      deleters[key].forEach(fn => fn && fn());
      delete deleters[key];
    });
  });
};

module.exports.delMatch = (prefixes, fn = () => {}) => {
  prefixes = [].concat(prefixes || []);

  if (!prefixes.length) {
    return fn();
  }

  let done = 0;
  let queue = [];

  const fn_ = keys => {
    queue = [...queue, ...keys];
    done += 1;

    if (done !== prefixes.length) {
      return;
    }
    else if (!queue.length) {
      return fn();
    }

    return module.exports.del(queue, fn);
  };

  prefixes.forEach(prefix => module.exports.keys(`*${prefix}*`, (err, keys) => fn_(keys || [])));
};
