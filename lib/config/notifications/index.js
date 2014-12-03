'use strict';

/*
 * Expose configuration settings for notifications
 */

module.exports = {
  enabled: process.env.PAUSE_NOTIFICATIONS === 'true' ? false :
    !/^development|test$/.test(config.env),
  sendgrid: {
    username: process.env.SENDGRID_USERNAME,
    password: process.env.SENDGRID_PASSWORD
  }
};
