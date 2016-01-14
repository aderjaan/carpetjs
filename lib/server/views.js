'use strict';

var $ = require('../../');

module.exports = function (app) {

  app.set('views', $.config.template_path);

  $.config.templates.express = app;

  require('nunjucks').configure($.config.templates.path, $.config.templates);

  app.set('view engine', 'html');

  app.use(function (req, res, next) {
    res.locals.req = req;
    res.locals.config = $.config;
    next();
  });

};
