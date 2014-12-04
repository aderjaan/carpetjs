'use strict';

var requireNoCache = function (module) {
  delete require.cache[require.resolve(module)];
  return require(module);
};

module.exports = {
  bootstrap: require('./lib/bootstrap'),
  migrations: require('./lib/migrations'),
  config: function () {
    requireNoCache('./lib/config');
  },
  express: function () {
    return requireNoCache('./lib/express');
  }
};
