'use strict';

var fs = require('fs');
var path = require('path');
var callsite = require('callsite');
var inherits = require('util').inherits;

var CACHE = {
  BOOTSTRAP: {},
  LOADED: {}
};

module.exports = {

  /*
    The require function the bootstrapper uses to load files
    Falls back to default require but may be overridden
    Useful for authorization/logging purposes
  */
  require: function (lookup) {
    return require(lookup);
  },

  /*
    Convert any string into camelCase format
  */
  camelize: function (name, capitalize) {
    if (capitalize) {
      name = '-'.concat(name);
    }
    return name.replace(/[_-]([a-z])/g, function (a, key) { return key.toUpperCase(); });
  },

  /*
    Convert any string into hyphenized-format
  */
  hyphenize: function (name) {
    return name.replace(/([a-z])([A-Z])/g, function (a, key1, key2) {
      return key1.concat('-', key2);
    }).toLowerCase();
  },

  /*
    Normalize a path and make it relative to the app root
  */
  normalize: function (lookup) {
    return path.normalize(lookup).replace(process.cwd().concat('/'), '');
  },

  /*
    Return the path of a certain specification
   */
  getPath: function (appName, type, name) {
    appName = appName || this.appName();
    return process.cwd().concat('/apps/', appName, '/', type, name ? '/'.concat(name) : '');
  },

  /*
    Return all available apps
  */
  getApps: function () {
    var dir = process.cwd().concat('/apps');
    var apps = [];
    fs.readdirSync(dir).forEach(function (app) {
      var stats = fs.statSync(dir.concat('/', app));
      if (stats && stats.isDirectory()) {
        apps.push(app);
      }
    });
    return apps;
  },

  /*
    Return the current appName based on where carpet.appName() is being called from.
   */
  appName: function () {
    var call = callsite();
    for (var i = 0; i < call.length; i++) {
      var dir = path.dirname(call[i].getFileName());
      if (/[\/\\]apps[\/\\]([^\/\\]*)([\/\\]([^\/\\]*))?/.test(dir)) {
        var name = RegExp.$1;
        return name;
      }
    }
    throw new Error('Can not derive appName!');
  },

  /*
    Generate api root url
   */
  apiRoot: function (url) {
    url = (url || '').replace(/^\/+/g, '');
    var app = this.appName();
    var call = callsite();
    for (var i = 0; i < call.length; i++) {
      var dir = path.dirname(call[i].getFileName());
      var rx = new RegExp('[/\\\\]apps[/\\\\]'.concat(app, '[/\\\\]api[/\\\\]([^/\\\\]*)'));
      if (rx.test(dir)) {
        var api = require(this.getPath(app, 'api', RegExp.$1));
        if (api.version) {
          var version = api.version.replace(/^(\d\.\d).*?$/, '$1');
          return '/api/'.concat(app, '/', version, '/', url);
        }
      }
    }
    throw new Error('Can not derive api!');
  },

  /*
    Alternative to require by specifying
    appName, type or name, only type is required
   */
  load: function (appName, type, name) {
    var lookup = this.getPath(appName, type, this.hyphenize(name));
    if (CACHE.LOADED[lookup]) {
      return CACHE.LOADED[lookup];
    }
    if (fs.existsSync(lookup.concat('.js')) || fs.existsSync(lookup.concat('/index.js'))) {
      CACHE.LOADED[lookup] = this.require(lookup);
      if (CACHE.LOADED[lookup].__logged) {
        return CACHE.LOADED[lookup];
      }
      CACHE.LOADED[lookup].__logged = true;
      return CACHE.LOADED[lookup];
    }
    return undefined;
  },

  /*
    Traverses a directory and loads each .js file
    Result will be put in hash
   */
  bootstrap: function (dir) {
    var self = this;
    if (CACHE.BOOTSTRAP[dir]) {
      return CACHE.BOOTSTRAP[dir];
    }
    CACHE.BOOTSTRAP[dir] = {};
    if (dir === 'base' || !fs.existsSync(dir)) {
      return CACHE.BOOTSTRAP[dir];
    }
    fs.readdirSync(dir).forEach(function (file) {
      var lookup = dir.concat('/', file);
      var stats = fs.statSync(lookup);
      if (stats && stats.isDirectory()) {
        if (file === 'tests') {
          return;
        }
        file = self.camelize(file);
        var sub = self.bootstrap(lookup);
        Object.keys(sub).forEach(function (key) {
          CACHE.BOOTSTRAP[dir][file] = CACHE.BOOTSTRAP[dir][file] || {};
          CACHE.BOOTSTRAP[dir][file][key] = sub[key];
        });
      }
      else if (/^(.*?)\.js$/.test(file)) {
        if (RegExp.$1 === 'index') {
          Object.assign(CACHE.BOOTSTRAP[dir], self.require(lookup));
        }
        else {
          file = self.camelize(RegExp.$1);
          CACHE.BOOTSTRAP[dir][file] = self.require(lookup);
        }
      }
    });
    return CACHE.BOOTSTRAP[dir];
  },

  /*
    Creates a base service based on a given model
   */
  baseService: function (model, prototype, Base) {
    if (typeof model === 'string') {
      model = module.exports.model(model);
    }

    Base = Base || require('../service');
    var Service = function (Model) {
      this.super_ = Base.prototype;
      Base.call(this, Model);
    };
    inherits(Service, Base);
    Object.assign(Service.prototype, prototype);

    return new Service(model);
  },

  /*
    Creates a base api based on a given service
   */
  baseApi: function (serviceName, serviceApp, prototype, Base) {
    if (typeof serviceApp !== 'string') {
      prototype = serviceApp;
      serviceApp = module.exports.appName();
    }

    Base = Base || require('../api');
    var Api = function (serviceName, serviceApp) {
      this.super_ = Base.prototype;
      Base.call(this, serviceName, serviceApp);
    };
    inherits(Api, Base);
    Object.assign(Api.prototype, prototype);

    return new Api(serviceName, serviceApp);
  }

};

/*
  Bootstrap helper methods for loading all or a particular
  dependency
 */
'api service worker helper view model'.split(' ').forEach(function (key) {
  var keys = key.concat('s');
  var folder = keys.replace(/(api)s/, '$1');
  module.exports[key] = function (name, appName) {
    return module.exports.load(appName, folder, name);
  };
  module.exports[keys] = function (appName) {
    if (keys === 'models' && !appName) {
      var appsPath = process.cwd().concat('/apps');
      return fs.readdirSync(appsPath).map(function (appName) {
        var lookup = appsPath.concat('/', appName);
        var stats = fs.statSync(lookup);
        if (!stats || !stats.isDirectory()) {
          return;
        }
        return module.exports.models(appName);
      });
    }
    return module.exports.bootstrap(module.exports.getPath(appName, folder));
  };
});
