'use strict';

/*
 * Expose the correct mongodb connection string in every case
 */
module.exports = function (config) {

  var env = process.env.NODE_ENV;
  var test = ['docs', 'test'].indexOf(env) >= 0;
  var ci = process.env.CI === 'true';
  var url = process.env.MONGOHQ_URL || process.env.MONGODB_URL;

  if (url && ['testing', 'staging', 'production'].indexOf(env) < 0 && !/localhost/.test(url)) {
    global.console.error('Make sure you always use a local database for development purposes!');
    throw new Error('Refusing to connect to a non localhost database!');
  }

  if ((!test || ci) && url) {
    return url;
  }

  var dbname = process.env.DB_NAME || config.identifier;

  if (test) {
    dbname = dbname.concat('_', env);
  }

  return 'mongodb://'.concat('localhost/', dbname);

};
