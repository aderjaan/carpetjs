const $ = require('../../');

module.exports = app => {
  app.set('views', $.config.template_path);

  $.config.templates.express = app;

  require('nunjucks').configure($.config.templates.path, $.config.templates);

  app.set('view engine', 'html');

  app.use((req, res, next) => {
    res.locals.req = req;
    res.locals.config = $.config;
    next();
  });
};
