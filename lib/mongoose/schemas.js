'use strict';

var util = require('util');
var mongoose = require('mongoose');

mongoose.BaseSchema = function BaseSchema() {
  mongoose.Schema.apply(this, arguments);
  this.add({
    updated_by: {
      type: mongoose.Schema.ObjectId,
      ref: 'shared.User'
    },
    date_created: {
      type: Date,
      default: Date.now
    },
    date_updated: {
      type: Date
    }
  });
};

util.inherits(mongoose.BaseSchema, mongoose.Schema);

mongoose.MultiTenantSchema = function MultiTenantSchema() {
  mongoose.BaseSchema.apply(this, arguments);
  this.add({
    organization: {
      type: mongoose.Schema.ObjectId,
      ref: 'shared.Organization',
      index: true
    },
    app_name: {
      type: String,
      ref: 'shared.App'
    }
  });
};

utils.inherits(mongoose.MultiTenantSchema, mongoose.BaseSchema);
