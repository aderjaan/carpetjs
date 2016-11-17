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

var _del = module.exports.del;
var deleters = {};
module.exports.del = function (key, fn) {
  if (deleters[key]) {
    return deleters[key].push(fn);
  }

  deleters[key] = [fn];
  return _del.call(module.exports, key, function (err) {
    deleters[key].forEach(function (fn) {
      return fn && fn(err);
    });

    delete deleters[key];
  });
};

module.exports.delMatch = function (prefixes, fn) {
  fn = fn || function () {};

  prefixes = [].concat(prefixes || []);

  if (!prefixes.length) {
    return fn();
  }

  var done = 0;
  var fn_ = function () {
    done++;
    if (done === prefixes.length) {
      return fn();
    }
  };

  prefixes.forEach(function (prefix) {
    prefix = '*'.concat(prefix, '*');
    module.exports.keys(prefix, function (err, keys) {
      if (!keys.length) {
        return fn_();
      }

      var done = 0;
      keys.forEach(function (key) {
        module.exports.del(key, function () {
          if (++done === keys.length) {
            return fn_();
          }
        });
      });
    });
  });
};
