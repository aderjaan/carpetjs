'use strict';

module.exports = function (app) {

  var unwanted = ['id', '__v'];
  app.set('json replacer', function (key, value) {
    return unwanted.indexOf(key) === -1 ? value : undefined;
  });

  // TODO: this is a non desired override because it might not survive express updates
  // Hopefully https://github.com/strongloop/express/pull/2422 works out
  app.response.__proto__.json = function (obj) { // jshint ignore:line
    var replacer = typeof this.jsonReplacer !== 'undefined' ?
      this.jsonReplacer : this.app.get('json replacer');
    var spaces = typeof this.jsonSpaces !== 'undefined' ?
      this.jsonSpaces : this.app.get('json spaces');
    var body = JSON.stringify(obj, replacer, spaces);
    if (!this.get('Content-Type')) {
      this.set('Content-Type', 'application/json');
    }
    return this.send(body);
  };

};
