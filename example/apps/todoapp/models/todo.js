'use strict';

module.exports = mongoose.model('Todo', new mongoose.Schema({
  title: { type: String, default: '' },
  date_created: { type: Date, default: Date.now },
  date_due: { type: Date, required: true }
}));
