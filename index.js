'use strict';

var requireNoCache = function (module) {
  delete require.cache[require.resolve(module)];
  return require(module);
};

module.exports = {
  bootstrap: require('./lib/bootstrap'),
  router: require('./lib/router'),
  migrations: require('./lib/migrations'),
  config: function () {
    requireNoCache('./lib/config');
  },
  express: function () {
    return requireNoCache('./lib/express');
  }
};
