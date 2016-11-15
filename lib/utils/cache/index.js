'use strict';

var $ = require('../../../');

if (!$.config.cache.store && process.env.REDISCLOUD_URL) {
  $.config.cache = Object.assign($.config.cache, {
    store: require('cache-manager-redis'),
    url: process.env.REDISCLOUD_URL,
    compress: true
  });
}

module.exports = require('cache-manager').caching($.config.cache);
