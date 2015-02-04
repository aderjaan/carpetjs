'use strict';

var util = require('util');
var mongoose = require('mongoose');

mongoose.ChangerSchema = function ChangerSchema() {
  mongoose.Schema.apply(this, arguments);
  this.add({
    modified_by: {
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

util.inherits(mongoose.ChangerSchema, mongoose.Schema);

mongoose.TenantSchema = function TenantSchema() {
  mongoose.ChangerSchema.apply(this, arguments);
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

utils.inherits(mongoose.TenantSchema, mongoose.ChangerSchema);
