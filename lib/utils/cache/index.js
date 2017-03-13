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

if (stores.length === 1) {
  module.exports = stores[0];
}
else {
  module.exports = require('cache-manager').multiCaching(stores);
}
