'use strict';

/*!
 * Health check
 *
 * Endpoint for health check monitoring on a regular interval (aka heartbeat)
 */
module.exports = $.baseApi('app', {

  respond: function (req, res) {
    utils.api.respond(res);
  }

});
