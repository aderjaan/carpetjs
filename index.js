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
    $.mongoose = $.require('mongoose');
    $.extendLocal('config');
  },
  server: function () {
    return $.require('server');
  }
};

$.bootstrap = $.require('bootstrap');
$.utils = $.bootstrap.bootstrap(__dirname.concat('/lib/utils'));

$.loadConfig();
$.extendLocal('utils');

$.logging = $.require('logging');

$.bootstrap.models();
