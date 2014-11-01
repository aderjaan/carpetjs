'use strict';

var carpet = require('../');
var should = require('should');
var request = require('supertest');

describe('carpet.all', function () {
  it('should work', function (done) {
    should.exist(carpet.bootstrap);
    should.exist(carpet.router);
    if (false) {
      request();
    }
    done();
  });
});
