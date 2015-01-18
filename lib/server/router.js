'use strict';

var fs = require('fs');
var express = require('express');

var bootstrap = require('../bootstrap');
var root = require('../config/root');

/*
  Dynamically load every app's index.js as routes
 */
module.exports = function (app) {

  // Prevent from running twice
  module.exports = function () {};

  fs.readdirSync(root.concat('/apps')).forEach(function (appName) {

    var lookup = root.concat('/apps/', appName);

    var stats = fs.statSync(lookup);
    if (!stats || !stats.isDirectory()) {
      return;
    }

    var apis = bootstrap.apis(appName);

    // Make sure all models are loaded
    bootstrap.models(appName);

    var handler = require(lookup) || {};
    handler.namespace = handler.namespace || '/api/'.concat(appName);
    handler.loaders = handler.loaders || {};

    var router = new express.Router();

    /*
      If the :id param was used in a route, automatically store
      the result of 'findById' on the matching service into the request
    */
    router.param('id', function (req, res, next, id) {
      if (new RegExp('/([A-Za-z-]+)/'.concat(id, '($|\/.*?$)')).test(req.path)) {
        var name = RegExp.$1;
        var lookup = req.route.path.replace(/^\/\d\.\d/, '');
        var routeLoader = handler.loaders[lookup] || appName;
        var service = bootstrap.service(name, routeLoader) || bootstrap.service(name, 'shared');
        if (!service) {
          return next(new Error('No service for \''.concat(name, '\'')));
        }
        return service.findById(req, id, function (err, model) {
          if (!err && !model) {
            err = new Error('Requested object does not exist');
            err.status = 404;
          }
          req.model = model;
          next(err);
        }, { lean: false });
      }
      next();
    });

    // The following code processes all versions of the API
    // And maps the routes to the respective endpoints
    var currentVersion = apis.current.version.replace(/^(\d\.\d).*?$/, '$1');
    apis[currentVersion] = apis.current;
    delete apis.current;

    apis = Object.keys(apis).reduce(function (map, version) {
      if (/^\d\.\d$/.test(version)) {
        map[version] = apis[version];
      }
      return map;
    }, {});

    Object.keys(apis).forEach(function (version) {
      Object.keys(apis[version].routes).forEach(function (route) {
        if (!/^([A-Z]+)\s(.*?)$/.test(route)) {
          return;
        }
        var method = RegExp.$1.toLowerCase(),
            uri = RegExp.$2,
            url = '/'.concat(version, uri),
            endpoint = apis[version].routes[route];

        try {
          if (!/^(.*?)\.([^\.]+)$/.test(endpoint)) {
            return;
          }
          var func = RegExp.$2,
              api = eval('apis[version].'.concat(RegExp.$1)), // jshint ignore:line
              evaluated = function () {
                api[func].apply(api, arguments);
              };

          router[method](url, evaluated);
          if (handler.unversioned && handler.unversioned === version) {
            router[method](uri, evaluated);
          }
        }
        catch (ex) {}
      });
    });

    app.use(handler.namespace, router);

  });
};
