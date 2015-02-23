'use strict';

var $ = require('../../');

module.exports = function (app) {

  app.engine('html', require('swig').renderFile);
  app.set('view engine', 'html');
  app.set('views', require('path').join(process.cwd().concat('/templates')));

  app.use(function (req, res, next) {
    res.locals.req = req;
    res.locals.config = $.config;
    next();
  });

};
