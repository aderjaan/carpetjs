'use strict';

/*
 * Expose aws configuration and helper functions
 */
module.exports = {
  prefix: config.identifier,
  accessKeyId: process.env.AWS_KEY,
  secretAccessKey: process.env.AWS_SECRET,
  region: process.env.AWS_REGION,
  sqsId: process.env.AWS_SQS_ID,
  urlExpiry: parseInt(process.env.AWS_URL_EXPIRY, 10),
  env: function () {
    return config.env.replace(/^(development|test|docs)$/, 'develop');
  },
  bucket: function (key, appName) {
    return config.aws.prefix.concat('-', appName || $.appName(), '-', key, '-', this.env());
  },
  path: function (key, appName) {
    return '/'.concat(appName || $.appName(), '/', key);
  },
  queue: function (key, appName, bare) {
    var name = config.aws.prefix.concat('-', appName || $.appName(), '-', key, '-', this.env());
    return bare ?
      name :
      'https://sqs.'.concat(config.aws.region, '.amazonaws.com/', config.aws.sqsId, '/', name);
  }
};
