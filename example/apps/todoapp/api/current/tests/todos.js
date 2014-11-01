'use strict';

var should = require('should');
var request = require('supertest');

var baseUrl = $.apiRoot('actions');

describe('Todo App API', function () {

  describe('GET /api/todoapp/todos', function () {
    describe('list todos', function () {
      it('should list all todos', function (done) {
        request(app)
          .get(baseUrl)
          .expect(200)
          .expect('Content-Type', /json/)
          .end(function (err, res) {
            should.not.exist(err);
            res.body.should.not.be.empty;
            res.body.length.should.be.greaterThan(0);
            done();
          });
      });
    });
  });

});
