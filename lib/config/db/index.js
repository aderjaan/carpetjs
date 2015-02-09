'use strict';

/*
 * Expose the correct mongodb connection string in every case
 */
module.exports = function (config) {

  var build = function (suffix) {
    var dbname = (process.env.DB_NAME || config.identifier).concat(suffix || '');
    var hostname = process.env.MONGODB_HOST || process.env.WERCKER_MONGODB_HOST || 'localhost';
    return 'mongodb://'.concat(hostname, '/', dbname);
  };

  if (process.env.WERCKER_MONGODB_HOST) {
    return build();
  }
  else if (process.env.NODE_ENV === 'test') {
    return build('_test');
  }
  else if (process.env.NODE_ENV === 'docs') {
    return build('_docs');
  }
  else if (process.env.MONGOHQ_URL || process.env.MONGODB_URL) {
    return process.env.MONGOHQ_URL || process.env.MONGODB_URL;
  }
  else {
    return build();
  }

};
