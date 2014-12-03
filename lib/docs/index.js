'use strict';

var dox = require('dox');
var fs = require('fs.extra');
var request = require('request');

process.env.NODE_ENV = 'docs';
process.env.PAUSE_NOTIFICATIONS = 'true';

var DUMMY_ID = '5eeded5eeded5eeded5eeded';

var root = require('../config/root');
var seed = require(root.concat('seed/seed'));

// Boot the web server
require('../express');

var host = 'http://localhost:'.concat(config.port);

// Run the seed script
var initialize = function (cb) {
  seed.seed(function () {
    config.STATIC_USER = utils.getId(seed.seeds.shared.users.items[0]._id);
    config.authorizations_disabled = true;
    cb();
  });
};

// - Walk over all api files and keep it in an array
// - Remove documents that are not matching the api files anymore
// - Remove any empty sub directory
var getFiles = function (cb) {
  var files = [];
  fs.walk('./apps').on('file', function (rt, stat, next) {
    var file = rt.concat('/', stat.name);

    // Determine the exact output file name
    if (/\/([^\/]+)\/api\/(current|[0-9\.]+)\/([^\/]+)\.js$/.test(file)) {
      var app = RegExp.$1;
      var version = RegExp.$2;
      var name = RegExp.$3;

      if (name === 'index') {
        return next();
      }

      // Read the exact api version (folder name might be 'current')
      var api = $.api(version, app);
      if (api) {
        version = api.version.replace(/^([0-9]\.[0-9]).*$/, '$1');
      }

      // Push a hash with input, output and version
      files.push({
        input: file,
        output: './docs/api/'.concat(app, '/', version, '/', name, '.md'),
        version: version
      });
    }
    next();
  }).on('end', function () {
    // Iterate all files and see if it should stay or not
    fs.walk('./docs/api').on('file', function (rt, stat, next) {
      var file = rt.concat('/', stat.name);

      // Trash if it's not in the files array as 'output'
      var trash = !files.filter(function (f) {
        return file === f.output;
      }).length;

      if (trash) {
        return fs.unlink(file, next);
      }
      next();
    }).on('end', function () {
      // Iterate all directories and see if it should stay or not
      fs.walk('./docs/api').on('directory', function (rt, stat, next) {
        // nlink is 2 if the directory is empty
        if (stat.nlink <= 2) {
          fs.rmdir(rt.concat('/', stat.name));
        }
        next();
      }).on('end', function () {
        cb(files);
      });
    });
  });
};

// Replace {{...}} with data from the seeds
// Replace /v/ with the actual version
var replaceBody = function (data) {
  data.body = data.body.replace(/(\/[a-z]+\/([^\/]+\/)?)v\//g, '$1'.concat(data.version, '/'));
  data.body = data.body.replace(/\{\{(.*?)\}\}/g, function (match, key) {
    try {
      return eval('seed.seeds.'.concat(key)); // jshint ignore:line
    }
    catch (ex) {
      return match;
    }
  });
};

// Generates a skeleton clone of an object
// Used to compare if two objects are equal in structure
var skeleton = function (object) {
  if (Array.isArray(object)) {
    // Since seed generates arrays of random length, compare only first
    return object.length ? [skeleton(object[0])] : object;
  }
  if (typeof object === 'object') {
    if (object === null) {
      return '';
    }
    object = _.clone(object);
    for (var key in object) {
      object[key] = skeleton(object[key]);
    }
    return object;
  }
  return typeof object === 'undefined' ? undefined : '';
};

// Compare the response with the original response and return original if nothing has changed
var compareResponse = function (response, original) {
  if (typeof response === 'string') {
    try {
      response = JSON.parse(response);
    }
    catch (ex) {
      return response;
    }
  }

  try {
    original = JSON.parse(original);
  }
  catch (ex) {
    original = null;
  }

  // Return only one element if the response is an array (to keep it short)
  if (Array.isArray(response) && response.length) {
    response = response.slice(-1);
  }

  if (original) {
    var a = Array.isArray(response) ? response[0] : response;
    var b = Array.isArray(original) ? original[0] : original;

    if (typeof a === 'object' && typeof b === 'object') {
      a = JSON.parse(JSON.stringify(a).replace(/[a-z0-9]{24}/g, DUMMY_ID));
      a = skeleton(a);
      b = skeleton(b);
      if (_.isEqual(a, b)) {
        response = original;
      }
    }
  }

  return response;
};

// Make a request to the server and return the response
var getResponse = function (methodString, data, original, cb) {
  var parsed = methodString.split(' ');
  var url = host.concat(parsed[1]);
  var method = parsed[0];

  if (!/^GET|POST|DELETE|UPDATE/i.test(method)) {
    return cb('');
  }

  var req = {
    method: method,
    url: url
  };

  if (data) {
    try {
      req.json = JSON.parse(data);
    }
    catch (ex) {
      return cb('');
    }
  }

  request(req, function (err, res, response) {
    if (err || res.statusCode !== 200) {
      logging.error('Documentation request failed for %s', methodString);
    }

    response = compareResponse(response || '{}', original);

    if (typeof response === 'object') {
      response = JSON.stringify(response, null, 2);
    }

    cb(response);
  });

};

// Inject the API response for each comment
var parseComment = function (data, comment, cb) {
  var method = comment.tags.filter(function (tag) {
    return tag.type === 'method';
  });
  method = method.length === 1 ? method[0] : null;

  var params = comment.tags.filter(function (tag) {
    return tag.type === 'param';
  });

  var requests = comment.tags.filter(function (tag) {
    return tag.type === 'request';
  });

  var output = '## '.concat(comment.description.summary.replace(/^#+/g, ''), '\n');
  if (comment.description.body) {
    output += '\n'.concat(comment.description.body, '\n');
  }

  if (method) {
    output += '### '.concat(method.string, '\n\n');
  }

  requests.forEach(function (request) {
    output += '#### Example Request:\n\n```json\n'.concat(request.string, '\n```\n\n');
  });

  var done = function () {
    if (params.length) {
      output += '#### Params:\n\n';
      params.forEach(function (param) {
        var types = param.types.length ? ' **'.concat(param.types.join('** **'), '**') : '';
        output += '*'.concat(types, ' *', param.name, '* ', param.description, '\n');
      });
    }

    output += '\n---\n\n';
    return cb(output);
  };

  if (!method) {
    return done();
  }

  // In case of get requests, still add a request object so that example response can be retrieved
  if (!requests.length) {
    requests.push({
      type: 'request',
      string: ''
    });
  }

  async.eachSeries(requests, function (request, fn) {
    var hasMethod = new RegExp(method.string.replace(/[a-z0-9]{24}/g, DUMMY_ID).concat('\\s'));
    var original = data.original.filter(function (original) {
      return hasMethod.test(original);
    });
    if (original.length && /#### Example Response:\n\n```json\n([\s\S]+)\n```/.test(original[0])) {
      original = RegExp.$1;
    }
    else {
      original = null;
    }
    getResponse(method.string, request.string, original, function (response) {
      output += '#### Example Response:\n\n```json\n'.concat(response, '\n```\n\n');
      fn();
    });
  }, done);

};

// Read the generated .md and parse it further
var parse = function (data, cb) {
  data.dox = dox.parseComments(data.body, { raw: true });

  var body = '';
  async.eachSeries(data.dox, function (comment, fn) {
    if (/^[\s]*jshint/.test(comment.description.summary)) {
      return fn();
    }
    parseComment(data, comment, function (output) {
      body += output;
      fn();
    });
  }, function () {
    body = body.replace(/[a-z0-9]{24}/g, DUMMY_ID);
    var header = data.output.replace(/^.*?([^\/]+)\.md/, '$1');
    var toc = '# '.concat(header[0].toUpperCase(), header.slice(1), '\n\n');
    (body.match(/^\## (.*?)$/mg) || []).forEach(function (match) {
      var title = match.replace(/^\## /, '');
      toc += '- '.concat('[', title, '](#', title.toLowerCase().replace(/[^\w\d]/g, '-'), ')\n');
    });
    body = toc.concat('\n---\n\n', body);
    fs.writeFile(data.output, body, cb);
  });
};

// Use dox to generate json from comments
var generate = function (data, done) {
  fs.readFile(data.input, 'utf8', function (err, body) {
    data.body = body;
    replaceBody(data);
    var dir = data.output.replace(/[^\/]+\.md$/, '');
    fs.mkdirp(dir, function () {
      fs.readFile(data.output, 'utf8', function (err, body) {
        data.original = (body || '').split('---');
        parse(data, function () {
          logging.info('Generated documentation: %s', data.output);
          done();
        });
      });
    });
  });
};

// Run the process
initialize(function () {
  getFiles(function (files) {
    var completed = 0;
    var done = function () {
      if (++completed === files.length) {
        process.exit();
      }
    };
    files.forEach(function (file) {
      generate(file, done);
    });
  });
});
