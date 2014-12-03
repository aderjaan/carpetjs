'use strict';

var dbname = process.env.DB_NAME || config.identifier;

var build = function (host, db) {
  host = host || 'localhost';
  db = db || dbname;

  return 'mongodb://'.concat(host, '/', db);
};

/*
 * Expose the correct mongodb connection string in every case
 */
if (process.env.WERCKER_MONGODB_HOST) {
  module.exports = build(process.env.WERCKER_MONGODB_HOST);
}
else if (process.env.NODE_ENV === 'test') {
  module.exports = build(null, dbname.concat('_test'));
}
else if (process.env.NODE_ENV === 'docs') {
  module.exports = build(null, dbname.concat('_docs'));
}
else if (process.env.MONGOHQ_URL) {
  module.exports = process.env.MONGOHQ_URL;
}
else {
  module.exports = build();
}
