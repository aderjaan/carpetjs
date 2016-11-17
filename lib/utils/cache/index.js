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

var _set = module.exports.store.set;
module.exports.store.set = function (key, value, fn) {
  arguments[1] = $.utils.api.toJSON(value);
  return _set.apply(module.exports.store, arguments);
};

module.exports.match = function (prefixes, fn) {
  prefixes = Array.isArray(prefixes) ? prefixes : prefixes && [prefixes];

  if (!prefixes || !prefixes.length) {
    return fn([]);
  }

  module.exports.keys(function (err, keys) {
    fn((keys || []).filter(function (key) {
      prefixes.forEach(function (prefix) {
        if (key.indexOf(prefix) >= 0) {
          return true;
        }
      });
    }));
  });
};

module.exports.delMatch = function (prefixes, fn) {
  fn = fn || function () {};
  module.exports.match(prefixes, function (keys) {
    var done = 0;
    keys.forEach(function (key) {
      module.exports.del(key, function () {
        if (++done === keys.length) {
          return fn();
        }
      });
    });
  });
};
