'use strict';

var $ = require('../../');
var nunjucks = require('nunjucks');

module.exports = function (app) {

  app.set('views', $.config.template_path);

  nunjucks.configure(app.get('views'), {
    autoescape: true,
    trimBlocks: true,
    express: app,
    noCache: $.config.env === 'development'
  });

  app.set('view engine', 'html');

  app.use(function (req, res, next) {
    res.locals.req = req;
    res.locals.config = $.config;
    next();
  });

};
