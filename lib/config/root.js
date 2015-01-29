'use strict';

/* Exports actual root folder of the app
   which is either looked up from APP_ROOT environment variable
   or assumed from the current __dirname
*/
var root_path = process.env.APP_ROOT || __dirname.replace(/(node_modules\/carpetjs\/)?lib\/config$/, '');

if (root_path.slice(-1) != "/") {
  root_path += "/"
}

module.exports = root_path;
