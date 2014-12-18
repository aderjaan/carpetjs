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
  sslEnabled: process.env.AWS_SSL_ENABLED ? process.env.AWS_SSL_ENABLED === 'true' : true,
  env: function () {
    return config.env.replace(/^(development|test|docs)$/, 'develop');
  },
  bucket: function (key, appName) {
    return this.prefix.concat('-', appName || $.appName(), '-', key, '-', this.env());
  },
  path: function (key, appName) {
    return '/'.concat(appName || $.appName(), '/', key);
  },
  queue: function (key, appName, bare) {
    var name = this.prefix.concat('-', appName || $.appName(), '-', key, '-', this.env());
    return bare ?
      name :
      'https://sqs.'.concat(this.region, '.amazonaws.com/', this.sqsId, '/', name);
  },
  config: function () {
    return {
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
      region: this.region,
      sslEnabled: this.sslEnabled
    };
  }
};
