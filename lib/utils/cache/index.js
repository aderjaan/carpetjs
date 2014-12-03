'use strict';

var Cache = require('node-cache');

module.exports = new Cache({ stdTTL: 120 });
