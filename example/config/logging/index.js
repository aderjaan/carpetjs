'use strict';

var winston = require('winston');

exports.logtypes = {
  default: {
    transports: [
      new winston.transports.Console({
        colorize: true,
        timestamp: true,
        label: 'main',
        level: process.env.LOGLEVEL_DEFAULT || 'info'
      })
    ]
  },
  http: {
    transports: [
      //s3(),
      new winston.transports.Console({
        colorize: true,
        timestamp: true,
        label: 'http',
        level: process.env.LOGLEVEL_HTTP || 'info'
      })
    ]
  },
  api: {
    transports: [
      //s3(),
      new winston.transports.Console({
        colorize: true,
        timestamp: true,
        label: 'apis',
        level: process.env.LOGLEVEL_API || 'info'
      })
    ]
  },
  service: {
    transports: [
      //s3(),
      new winston.transports.Console({
        colorize: true,
        timestamp: true,
        label: 'srvc',
        level: process.env.LOGLEVEL_SERVICE || 'info'
      })
    ]
  },
  model: {
    transports: [
      //s3(),
      new winston.transports.Console({
        colorize: true,
        timestamp: true,
        label: 'modl',
        level: process.env.LOGLEVEL_MODEL || 'info'
      })
    ]
  },
  worker: {
    transports: [
      //s3(),
      new winston.transports.Console({
        colorize: true,
        timestamp: true,
        label: 'wrkr',
        level: process.env.LOGLEVEL_WORKER || 'info'
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
  if (typeof args[0] === 'object') {
    req = args[0];
    args = args.slice(1);
  }
  return new Array(8 - key.length).join(' ').concat([
    exports.cap(req.organizationId, 24, 0, '-'),
    exports.cap(req.user && req.user.username, 10, 0, '-'),
    '\x1b[90m',
    utils.format.apply(null, args),
    '\x1b[0m'
  ].join(' '));
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
