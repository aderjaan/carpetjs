const LOGLEVEL_DEFAULT = process.env.LOGLEVEL_DEFAULT || 'info';

const $ = require('../../');
const winston = require('winston');

let winstonCommon;

try {
  winstonCommon = require(`${__dirname}/../../node_modules/winston/lib/winston/common`);
}
catch (ex) {}

if (!winstonCommon) {
  try {
    winstonCommon = require(`${__dirname}/../../../winston/lib/winston/common`);
  }
  catch (ex) {}
}

if (winstonCommon) {
  const _log = winstonCommon.log;
  winstonCommon.log = (options, ...args) => {
    const level = winston.config.colorize(options.level)
      .replace(/silly/, 'sily')
      .replace(/input/, 'inpt')
      .replace(/verbose/, 'vrbs')
      .replace(/prompt/, 'prmt')
      .replace(/debug/, 'debg')
      .replace(/error/, 'errr');

    options.formatter = () => {
      const date = new Date().toISOString();
      return `[${exports.cap(options.label, 4, 0, ' ')}:${level}] ${date} ${options.message}`;
    };

    return _log.call(winstonCommon, options, ...args);
  };
}

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

Object.keys(exports.logtypes).forEach(key => winston.loggers.add(key, exports.logtypes[key]));

exports.loggers = winston.loggers;

exports.cap = (s, max, type, pad) => {
  pad = pad || ' ';
  s = (s || '').toString();
  if (s.length > max) {
    s = s.substring(0, max);
  }

  let i = 0;
  while (s.length < max) {
    if (type === 1 || (type === 2 && i % 2 === 0)) {
      s = `${pad}${s}`;
    }
    else {
      s = `${s}${pad}`;
    }

    i += 1;
  }

  return s;
};

exports.format = args => {
  let req = {};

  // Check if the first argument is a 'req' object
  if (typeof args[0] === 'object' && (args[0].res || args[0].organizationId || args[0].userId)) {
    req = args[0];
    args = args.slice(1);
  }

  args = $.utils.format.apply(null, args);

  const spaces = ' '.repeat(12);
  const identify = [
    exports.cap(req.appName, 12, 0, '-'),
    exports.cap(req.organizationId, 24, 0, '-'),
    exports.cap(req.userId, 24, 0, '-')
  ].join(' ');

  return `\x1b[90m${identify}\x1b[0m\n${spaces}${args}`;
};

exports.http = (method, status, time, url, body) => {
  const result = [
    exports.cap(method, 3),
    exports.cap(status, 3, 1),
    exports.cap(time > 999 ? time / 1000 : time, 3, 1)
      .concat(time ? time > 999 ? 's ' : 'ms' : '  '),
    url
  ];

  if (body) {
    body = JSON.stringify(body, null, 2).replace(/^/mg, '            ');
    result.push(`\n${body}\n`);
  }

  return result;
};

['silly', 'verbose', 'debug', 'info', 'warn', 'error'].forEach(key => {
  exports[key] = (transport, ...args) => {
    if (!exports.logtypes[transport]) {
      transport = 'default';
      args = [transport, ...args];
    }

    args = [key, exports.format(args, key)];
    return winston.loggers.get(transport).log(key, exports.format(args, key));
  };
});
