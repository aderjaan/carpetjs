'use strict';

require('../');

var express = require('express');
var app = module.exports = express();

app.enable('trust proxy');

// Handle view rendering
require('./views')(app);

// Setup logging
require('./logging')(app);

// Body parser
var body = require('body-parser');
app.use(body.json());
app.use(body.urlencoded({ extended: false }));
app.use(require('method-override')());

// Domain/origin configuration
app.use(require('./domains'));

// Setup passport.js
app.use(require('passport').initialize());

// Bootstrap routes
require('carpetjs').router(express, app);

// Handle errors
require('./errors')(app);

// Boot the server
app.listen(config.port, function () {
  logging.info(config.name.concat(' running on port ', config.port));
});
