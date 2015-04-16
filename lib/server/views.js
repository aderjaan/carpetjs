'use strict';

var $ = require('../../');
var swig = require('swig');

module.exports = function (app) {

  if ($.config.env === 'development') {
    swig.setDefaults({ cache: false });
  }

  app.engine('html', swig.renderFile);
  app.set('view engine', 'html');
  app.set('views', $.config.template_path);
  app.set('view cache', false);

  app.use(function (req, res, next) {
    res.locals.req = req;
    res.locals.config = $.config;
    next();
  });

};
