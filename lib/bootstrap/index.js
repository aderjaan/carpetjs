const fs = require('fs');
const path = require('path');
const callsite = require('callsite');
const inherits = require('util').inherits;

const CACHE = {
  BOOTSTRAP: {},
  LOADED: {}
};

module.exports = {


  /*
    The require function the bootstrapper uses to load files
    Falls back to default require but may be overridden
    Useful for authorization/logging purposes
  */
  require (lookup) {
    return require(lookup);
  },

  /*
    Convert any string into camelCase format
  */
  camelize (name, capitalize) {
    if (capitalize) {
      name = `-${name}`;
    }
    return name.replace(/[_-]([a-z])/g, (a, key) => key.toUpperCase());
  },

  /*
    Convert any string into hyphenized-format
  */
  hyphenize (name) {
    return name.replace(/([a-z])([A-Z])/g, (a, key1, key2) => `${key1}-${key2}`).toLowerCase();
  },

  /*
    Normalize a path and make it relative to the app root
  */
  normalize (lookup) {
    return path.normalize(lookup).replace(`${process.cwd()}/`, '');
  },

  /*
    Return the path of a certain specification
   */
  getPath (appName, type, name) {
    appName = appName || this.appName();
    const ext = (name && `/${name}`) || '';

    return `${process.cwd()}/apps/${appName}/${type}${ext}`;
  },

  /*
    Return all available apps
  */
  getApps () {
    const dir = `${process.cwd()}/apps`;
    const apps = [];

    fs.readdirSync(dir).forEach(app => {
      const stats = fs.statSync(`${dir}/${app}`);
      if (stats && stats.isDirectory()) {
        apps.push(app);
      }
    });

    return apps;
  },

  /*
    Return the current appName based on where carpet.appName() is being called from.
   */
  appName () {
    const call = callsite();

    for (let i = 0; i < call.length; i += 1) {
      const dir = path.dirname(call[i].getFileName());
      if (/[/\\]apps[/\\]([^/\\]*)([/\\]([^/\\]*))?/.test(dir)) {
        return RegExp.$1;
      }
    }

    throw new Error('Can not derive appName!');
  },

  /*
    Generate api root url
   */
  apiRoot (url) {
    url = (url || '').replace(/^\/+/g, '');

    const app = this.appName();
    const call = callsite();
    const rx = new RegExp(`[/\\\\]apps[/\\\\]${app}[/\\\\]api[/\\\\]([^/\\\\]*)`);

    for (let i = 0; i < call.length; i += 1) {
      const dir = path.dirname(call[i].getFileName());

      if (rx.test(dir)) {
        const api = require(this.getPath(app, 'api', RegExp.$1));

        if (api.version) {
          const version = api.version.replace(/^(\d\.\d).*?$/, '$1');
          return `/api/${app}/${version}/${url}`;
        }
      }
    }

    throw new Error('Can not derive api!');
  },

  /*
    Alternative to require by specifying
    appName, type or name, only type is required
   */
  load (appName, type, name) {
    const lookup = this.getPath(appName, type, this.hyphenize(name));

    if (CACHE.LOADED[lookup]) {
      return CACHE.LOADED[lookup];
    }
    else if (fs.existsSync(`${lookup}.js`) || fs.existsSync(`${lookup}/index.js`)) {
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
  bootstrap (dir) {
    if (CACHE.BOOTSTRAP[dir]) {
      return CACHE.BOOTSTRAP[dir];
    }

    CACHE.BOOTSTRAP[dir] = {};

    if (dir === 'base' || !fs.existsSync(dir)) {
      return CACHE.BOOTSTRAP[dir];
    }

    fs.readdirSync(dir).forEach(file => {
      const lookup = `${dir}/${file}`;
      const stats = fs.statSync(lookup);

      if (stats && stats.isDirectory()) {
        if (file === 'tests') {
          return;
        }

        file = this.camelize(file);
        const sub = this.bootstrap(lookup);

        Object.keys(sub).forEach(key => {
          CACHE.BOOTSTRAP[dir][file] = CACHE.BOOTSTRAP[dir][file] || {};
          CACHE.BOOTSTRAP[dir][file][key] = sub[key];
        });
      }
      else if (/^(.*?)\.js$/.test(file)) {
        if (RegExp.$1 === 'index') {
          Object.assign(CACHE.BOOTSTRAP[dir], this.require(lookup));
        }
        else {
          file = this.camelize(RegExp.$1);
          CACHE.BOOTSTRAP[dir][file] = this.require(lookup);
        }
      }
    });

    return CACHE.BOOTSTRAP[dir];
  },

  /*
    Creates a base service based on a given model
   */
  baseService (model, prototype, Base) {
    if (typeof model === 'string') {
      model = module.exports.model(model);
    }

    Base = Base || require('../service');
    const Service = function (Model) {
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
  baseApi (serviceName, serviceApp, prototype, Base) {
    if (typeof serviceApp !== 'string') {
      prototype = serviceApp;
      serviceApp = module.exports.appName();
    }

    Base = Base || require('../api');
    const Api = function (serviceName, serviceApp) {
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
['api', 'service', 'worker', 'helper', 'view', 'model'].forEach(key => {
  const keys = `${key}s`;
  const folder = keys.replace(/(api)s/, '$1');

  module.exports[key] = (name, appName) => module.exports.load(appName, folder, name);
  module.exports[keys] = appName => {
    if (keys === 'models' && !appName) {
      const appsPath = `${process.cwd()}/apps`;

      return fs.readdirSync(appsPath).map(appName => {
        const stats = fs.statSync(`${appsPath}/${appName}`);

        if (!stats || !stats.isDirectory()) {
          return null;
        }

        return module.exports.models(appName);
      });
    }

    return module.exports.bootstrap(module.exports.getPath(appName, folder));
  };
});
