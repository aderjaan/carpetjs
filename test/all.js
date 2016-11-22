const $ = require('../');
const should = require('should');
const request = require('supertest');

describe('carpet.all', () => {
  it('should work', done => {
    should.exist($.bootstrap);
    should.exist($.router);

    if ($ === false) {
      request();
    }

    done();
  });
});
