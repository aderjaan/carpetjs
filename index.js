'use strict';

var $ = module.exports = {
  require: function (module) {
    return require('./lib/'.concat(module));
  },
  extendLocal: function (module) {
    try {
      Object.assign($[module], $.bootstrap.bootstrap(process.cwd().concat('/', module)));
    } catch (ex) {
      global.console.trace(ex);
    }
  },
  loadConfig: function () {
    delete require.cache[require.resolve('./lib/config')];
    delete require.cache[require.resolve(process.cwd().concat('/config'))];
    $.config = $.require('config');
    $.utils = $.bootstrap.bootstrap(__dirname.concat('/lib/utils'));
    $.mongoose = $.require('mongoose');
    $.extendLocal('config');
    $.extendLocal('utils');
  },
  server: function () {
    return $.require('server');
  }
};

$.bootstrap = $.require('bootstrap');

$.loadConfig();

$.logging = $.require('logging');

$.bootstrap.models();
