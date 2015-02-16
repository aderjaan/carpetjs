'use strict';

var $ = require('../../');

var fs = require('fs');
var express = require('express');

/*
  Dynamically load every app's index.js as routes
 */
module.exports = function (app) {

  // Prevent from running twice
  module.exports = function () {};

  var appsPath = process.cwd().concat('/apps');

  fs.readdirSync(appsPath).forEach(function (appName) {

    var lookup = appsPath.concat('/', appName);

    var stats = fs.statSync(lookup);
    if (!stats || !stats.isDirectory()) {
      return;
    }

    var apis = $.bootstrap.apis(appName);

    // Make sure all models are loaded
    $.bootstrap.models(appName);

    var handler = require(lookup) || {};
    handler.namespace = handler.namespace || '/api/'.concat(appName);

    var router = new express.Router();

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
      var api = apis[version];
      api.routeMap = Object.keys(api.routes).reduce(function (map, route) {
        if (!/^([A-Z]+)\s(.*?)$/.test(route)) {
          return;
        }
        var method = RegExp.$1.toLowerCase();
        var uri = RegExp.$2;
        var url = '/'.concat(version, uri);

        try {
          if (!/^(.*?)\.([^\.]+)$/.test(api.routes[route])) {
            return;
          }

          var apiModule = eval('apis[version].'.concat(RegExp.$1)), // jshint ignore:line
              functionName = RegExp.$2;

          map[method] = map[method] || {};
          map[method][uri] = {
            uri: uri,
            url: url,
            api: apiModule,
            functionName: functionName,
            function: function (req) {
              req.appName = appName;
              apiModule[functionName].apply(apiModule, arguments);
            }
          };
        }
        catch (ex) {}
        return map;
      }, {});
    });

    /*
      If the :id param was used in a route, automatically store
      the result of 'findByIdParam' on the matching service into the request
    */
    router.param('id', function (req, res, next, id) {
      if (new RegExp('/([A-Za-z-]+)/'.concat(id, '($|\/.*?$)')).test(req.path)) {
        if (!/^\/(\d\.\d)(\/.*?)$/.test(req.route.path)) {
          return next(new Error('No valid route for \''.concat(req.route.path, '\'')));
        }
        var version = RegExp.$1;
        req.uri = RegExp.$2;
        var versioned = apis[version];
        if (!versioned) {
          return next(new Error('No api version for \''.concat(req.route.path, '\'')));
        }
        var entry = versioned.routeMap[req.method.toLowerCase()];
        if (!entry) {
          return next(new Error('No api method entry for \''.concat(req.route.path, '\'')));
        }
        entry = entry[req.uri];
        if (!entry) {
          return next(new Error('No api uri entry for \''.concat(req.route.path, '\'')));
        }
        return entry.api.getByIdParam(req, req.uri, req.method, id, function (err, model) {
          if (!err && !model) {
            err = new Error('Requested object does not exist');
            err.status = 404;
          }
          req.model = model;
          next(err);
        });
      }
      next();
    });

    Object.keys(apis).forEach(function (version) {
      Object.keys(apis[version].routeMap).forEach(function (method) {
        Object.keys(apis[version].routeMap[method]).forEach(function (key) {
          var entry = apis[version].routeMap[method][key];
          router[method](entry.url, entry.function);
          if (handler.unversioned && handler.unversioned === version) {
            router[method](entry.uri, entry.function);
          }
        });
      });
    });

    app.use(handler.namespace, router);

  });
};
