const $ = module.exports = {
  require (module) {
    return require('./lib/'.concat(module));
  },
  extendLocal (module) {
    try {
      Object.assign($[module], $.bootstrap.bootstrap(process.cwd().concat('/', module)));
    }
    catch (ex) {
      global.console.trace(ex);
    }
  },
  loadConfig () {
    delete require.cache[require.resolve('./lib/config')];
    delete require.cache[require.resolve(process.cwd().concat('/config'))];
    $.config = $.require('config');
    $.utils = $.bootstrap.bootstrap(__dirname.concat('/lib/utils'));
    $.mongoose = $.require('mongoose');
    $.extendLocal('config');
    $.extendLocal('utils');
  },
  server () {
    const run = () => $.require('server');

    // Inject sentry
    if ($.config.sentry_dsn) {
      $.sentry = require('raven');
      $.sentry.config($.config.sentry_dsn, $.config.sentry_config).install();
      return $.sentry.context(run);
    }

    process.on('uncaughtException', err => {
      global.console.error('Uncaught exception', err);
      global.console.trace(err.stack);
    });

    return run();
  }
};

$.bootstrap = $.require('bootstrap');

$.loadConfig();

$.logging = $.require('logging');

$.bootstrap.models();
