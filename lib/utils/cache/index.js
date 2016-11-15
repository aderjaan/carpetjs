'use strict';

var $ = require('../../../');
var manager = require('cache-manager');
var config = { ttl: 300, max: 300 };
var stores = $.config.cache.map(function (store) {
  if (store === 'redis') {
    return manager.caching(Object.assign({}, config, {
      store: require('cache-manager-redis'),
      url: process.env.REDISCLOUD_URL,
      compress: true
    }));
  }

  return manager.caching(Object.assign({}, config, { store: store }));
});

if (stores.length === 1) {
  module.exports = stores[0];
}
else {
  module.exports = require('cache-manager').multiCaching(stores);
}
