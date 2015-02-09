'use strict';

var $ = require('../../');

var winston = require('winston');

var LOGLEVEL_DEFAULT = process.env.LOGLEVEL_DEFAULT || 'info';

exports.logtypes = {
  default: {
    transports: [
      new winston.transports.Console({
        colorize: true,
        timestamp: true,
        label: 'main',
        level: LOGLEVEL_DEFAULT
      })
    ]
  },
  http: {
    transports: [
      new winston.transports.Console({
        colorize: true,
        timestamp: true,
        label: 'http',
        level: process.env.LOGLEVEL_HTTP || LOGLEVEL_DEFAULT
      })
    ]
  },
  api: {
    transports: [
      new winston.transports.Console({
        colorize: true,
        timestamp: true,
        label: 'apis',
        level: process.env.LOGLEVEL_API || LOGLEVEL_DEFAULT
      })
    ]
  },
  service: {
    transports: [
      new winston.transports.Console({
        colorize: true,
        timestamp: true,
        label: 'srvc',
        level: process.env.LOGLEVEL_SERVICE || LOGLEVEL_DEFAULT
      })
    ]
  },
  model: {
    transports: [
      new winston.transports.Console({
        colorize: true,
        timestamp: true,
        label: 'modl',
        level: process.env.LOGLEVEL_MODEL || LOGLEVEL_DEFAULT
      })
    ]
  },
  worker: {
    transports: [
      new winston.transports.Console({
        colorize: true,
        timestamp: true,
        label: 'wrkr',
        level: process.env.LOGLEVEL_WORKER || LOGLEVEL_DEFAULT
      })
    ]
  }
};

Object.keys(exports.logtypes).forEach(function (key) {
  winston.loggers.add(key, exports.logtypes[key]);
});

exports.loggers = winston.loggers;

exports.cap = function (s, max, type, pad) {
  pad = pad || ' ';
  s = (s || '').toString();
  if (s.length > max) {
    s = s.substring(0, max);
  }
  var i = 0;
  while (s.length < max) {
    if (type === 1 || (type === 2 && i % 2 === 0)) {
      s = pad.concat(s);
    }
    else {
      s = s.concat(pad);
    }
    i++;
  }
  return s;
};

exports.format = function (args, key) {
  var req = {};

  // Check if the first argument is a 'req' object
  if (typeof args[0] === 'object' && (args[0].res || args[0].organizationId || args[0].userId)) {
    req = args[0];
    args = args.slice(1);
  }
  return new Array(8 - key.length).join(' ').concat([
    exports.cap(req.organizationId, 24, 0, '-'),
    exports.cap(req.user && req.user.username, 10, 0, '-'),
    '\x1b[90m',
    $.utils.format.apply(null, args),
    '\x1b[0m'
  ].join(' '));
};

exports.http = function (method, status, time, url) {
  return [
    exports.cap(method, 7),
    exports.cap(status, 3, 1),
    exports.cap(time, 4, 1).concat(time ? 'ms' : '  '),
    url
  ];
};

['silly', 'verbose', 'debug', 'info', 'warn', 'error'].forEach(function (key) {
  exports[key] = function (transport) {
    var args = Array.prototype.slice.call(arguments, 1);
    if (!exports.logtypes[transport]) {
      transport = 'default';
      args = Array.prototype.slice.call(arguments, 0);
    }
    args = [key, exports.format(args, key)];
    var logger = winston.loggers.get(transport);
    return logger.log.apply(logger, args);
  };
});
