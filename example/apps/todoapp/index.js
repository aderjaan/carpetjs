'use strict';

module.exports = {

  config: {},

  routes: {
    'GET /todos': 'todos.list',
    'POST /todos': 'todos.create',
    'GET /todos/:id': 'todos.get',
    'PUT /todos/:id': 'todos.update'
  }

};
