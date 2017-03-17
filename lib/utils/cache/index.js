const $ = require('../../../');
const manager = require('cache-manager');

const getTTL = (name, def) => typeof process.env[name] !== 'undefined' ? process.env[name] : def;

const TTL = getTTL('CACHE_EXPIRY', 5 * 60);
const TTL_MEMORY = getTTL('CACHE_EXPIRY_MEMORY', 10);

const stores = $.config.cache.map(store => {
  if (store === 'redis') {
    return manager.caching({
      store: require('cache-manager-redis'),
      url: process.env.REDISCLOUD_URL,
      compress: true,
      ttl: TTL
    });
  }

  return manager.caching({ ttl: TTL_MEMORY, store });
});

if (stores.length === 1) {
  module.exports = stores[0];
}
else {
  module.exports = manager.multiCaching(stores);

  // Workaround for https://github.com/BryanDonovan/node-cache-manager/issues/89
  module.exports._wrap = module.exports.wrap;
  module.exports.wrap = function (key, work, options, cb) {
    const _work = fn => work((err, data) => fn(err, data || null));
    return module.exports._wrap.call(this, key, _work, options, cb);
  };
}
