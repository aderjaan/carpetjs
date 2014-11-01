'use strict';

module.exports = {

  config: {
    unversioned: '1.0',
    public: true,
    namespace: '/'.concat($.appName())
  },

  routes: {
    'GET /heartbeat': 'heartbeat.respond'
  }

};
