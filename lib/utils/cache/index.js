'use strict';

module.exports = new (require('node-cache'))({ stdTTL: 120, useClones: false });
