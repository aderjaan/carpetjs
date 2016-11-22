const $ = require('../../');
const fs = require('fs');
const express = require('express');

/*
  Dynamically load every app's index.js as routes
 */
module.exports = app => {

  // Prevent from running twice
  module.exports = () => {};

  const appsPath = `${process.cwd()}/apps`;

  fs.readdirSync(appsPath).forEach(appName => {

    const lookup = `${appsPath}/${appName}`;
    const stats = fs.statSync(lookup);
    if (!stats || !stats.isDirectory()) {
      return;
    }

    let apis = $.bootstrap.apis(appName);

    const handler = require(lookup) || {};
    handler.namespace = handler.namespace || `/api/${appName}`;

    const router = new express.Router();

    // The following code processes all versions of the API
    // And maps the routes to the respective endpoints
    const currentVersion = apis.current.version.replace(/^(\d\.\d).*?$/, '$1');
    apis[currentVersion] = apis.current;
    delete apis.current;

    apis = Object.keys(apis).reduce((map, version) => {
      if (/^\d\.\d$/.test(version)) {
        map[version] = apis[version];
      }

      return map;
    }, {});

    Object.keys(apis).forEach(version => {
      const api = apis[version];

      api.routeMap = Object.keys(api.routes).reduce((map, route) => {
        if (!/^([A-Z]+)\s(.*?)$/.test(route)) {
          return null;
        }

        const method = RegExp.$1.toLowerCase();
        const uri = RegExp.$2;
        const url = `/${version}${uri}`;

        try {
          if (!/^(.*?)\.([^.]+)$/.test(api.routes[route])) {
            return null;
          }

          const apiModule = eval(`apis[version].${RegExp.$1}`); // eslint-disable-line
          const functionName = RegExp.$2;

          map[method] = map[method] || {};
          map[method][uri] = {
            uri,
            url,
            api: apiModule,
            functionName,
            function: (req, ...args) => {
              req.appName = appName;
              return apiModule[functionName](req, ...args);
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
    router.param('id', (req, res, next, id) => {
      if (new RegExp(`/([A-Za-z-]+)/${id}($|/.*?$)`).test(req.path)) {
        if (!/^\/(\d\.\d)(\/.*?)$/.test(req.route.path)) {
          return next(new Error(`No valid route for '${req.route.path}'`));
        }

        const version = RegExp.$1;
        req.uri = RegExp.$2;

        const versioned = apis[version];
        if (!versioned) {
          return next(new Error(`No api version for '${req.route.path}'`));
        }

        let entry = versioned.routeMap[req.method.toLowerCase()];
        if (!entry) {
          return next(new Error(`No api method entry for '${req.route.path}'`));
        }

        entry = entry[req.uri];
        if (!entry) {
          return next(new Error(`No api uri entry for '${req.route.path}'`));
        }

        return entry.api.getByIdParam(req, req.uri, req.method, id, (err, model) => {
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

    Object.keys(apis).forEach(version =>
      Object.keys(apis[version].routeMap).forEach(method =>
        Object.keys(apis[version].routeMap[method]).forEach(key => {
          const entry = apis[version].routeMap[method][key];
          router[method](entry.url, entry.function);

          if (handler.unversioned && handler.unversioned === version) {
            router[method](entry.uri, entry.function);
          }
        })));

    app.use(handler.namespace, router);
  });
};
