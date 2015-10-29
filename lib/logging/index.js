'use strict';

var $ = require('../../');

var winston = require('winston');
var winstonCommon;

try {
  winstonCommon = require(__dirname.concat('/../../node_modules/winston/lib/winston/common'));
}
catch (ex) {}

if (!winstonCommon) {
  try {
    winstonCommon = require(__dirname.concat('/../../../winston/lib/winston/common'));
  }
  catch (ex) {}
}

console.log(winstonCommon);

if (winstonCommon) {
  winstonCommon._log = winstonCommon.log;
  winstonCommon.log = function (options) {
    var level = winston.config.colorize(options.level)
      .replace(/silly/, 'sily').replace(/input/, 'inpt').replace(/verbose/, 'vrbs')
      .replace(/prompt/, 'prmt').replace(/debug/, 'debg').replace(/error/, 'errr');

    options.formatter = function () {
      return '['.concat(
        exports.cap(options.label, 4, 0, ' '), ':',
        level, '] ',
        new Date().toISOString(), ' ', options.message);
    };
    return this._log.apply(this, arguments);
  };
}

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

exports.format = function (args) {
  var req = {};

  // Check if the first argument is a 'req' object
  if (typeof args[0] === 'object' && (args[0].res || args[0].organizationId || args[0].userId)) {
    req = args[0];
    args = args.slice(1);
  }

  return ''.concat(
    '\x1b[90m',
    [
      exports.cap(req.appName, 12, 0, '-'),
      exports.cap(req.organizationId, 24, 0, '-'),
      exports.cap(req.userId, 24, 0, '-')
    ].join(' '),
    '\x1b[0m\n',
    new Array(13).join(' '),
    $.utils.format.apply(null, args)
  );
};

exports.http = function (method, status, time, url, body) {
  var result = [
    exports.cap(method, 3),
    exports.cap(status, 3, 1),
    exports.cap(time > 999 ? time / 1000 : time, 3, 1)
      .concat(time ? time > 999 ? 's ' : 'ms' : '  '),
    url
  ];

  if (body) {
    body = JSON.stringify(body, null, 2).replace(/^/mg, '            ');
    result.push('\n'.concat(body, '\n'));
  }

  return result;
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
