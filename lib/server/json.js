const $ = require('../../');

const unwantedFields = ($.config.json && $.config.json.unwanted_fields) || ['id', '__v'];

module.exports = app => {

  app.set('json replacer', (key, value) => unwantedFields.indexOf(key) === -1 ? value : undefined);

  // TODO: this is a non desired override because it might not survive express updates
  // Hopefully https://github.com/strongloop/express/pull/2422 works out
  app.response.__proto__.json = function (obj) { // eslint-disable-line
    const replacer = typeof this.jsonReplacer !== 'undefined' ?
      this.jsonReplacer : this.app.get('json replacer');
    const spaces = typeof this.jsonSpaces !== 'undefined' ?
      this.jsonSpaces : this.app.get('json spaces');
    const body = JSON.stringify(obj, replacer, spaces);

    if (!this.get('Content-Type')) {
      this.set('Content-Type', 'application/json');
    }

    return this.send(body);
  };
};
