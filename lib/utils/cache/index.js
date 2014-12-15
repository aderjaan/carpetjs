'use strict';

var Cache = require('node-cache');

module.exports = new Cache({ stdTTL: 120 });

module.exports.getOne = function (key, cb) {
  if (cb) {
    return this.get(key, function (err, cache) {
      cb(cache && cache[key] || null);
    });
  }
  var cache = this.get(key);
  return cache && cache[key] || null;
};
