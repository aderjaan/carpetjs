'use strict';

process.env.NODE_ENV = 'migrations';

require('../config');

/*
 * Expose a migrations object that is expected by mongoose-migrate
 */
module.exports[config.env] = {
  schema: {
    migration: {}
  },
  modelName: process.env.MIGRATION_MODEL_NAME || 'Migration',
  db: config.db
};
