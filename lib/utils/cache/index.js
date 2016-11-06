'use strict';

const cache = new (require('node-cache'))({ stdTTL: 300, useClones: false });

cache.wrap = (key, fn, fetch) => {
  cache.get(key, (err, data) => {
    if (data) {
      return fn(err, data);
    }

    fetch((err, data) => {
      if (data) {
        cache.set(key, data);
      }

      return fn(err, data);
    })
  })
};

module.exports = cache;
