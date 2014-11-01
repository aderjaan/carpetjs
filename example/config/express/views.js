'use strict';

module.exports = function (app) {

  app.engine('html', require('swig').renderFile);
  app.set('view engine', 'html');
  app.set('views', require('path').join(config.root.concat('apps/shared/templates')));

};
