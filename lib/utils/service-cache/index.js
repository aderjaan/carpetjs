const $ = require('../../../');

const getTTL = (name, def) => typeof process.env[name] !== 'undefined' ? process.env[name] : def;

const TTL = getTTL('CACHE_EXPIRY_SERVICE', 5 * 60);

$.mongoose.model('cache', new $.mongoose.BaseSchema({
  key: { type: String, index: true, required: true, unique: true },
  delete_key: { type: String, index: true, required: true, unique: true },
  data: {},
  date_expires: {
    type: Date,
    default: () => {
      const date = new Date();
      date.setSeconds(date.getSeconds() + TTL);

      return date;
    },
    expires: 0
  }
}));

const Collection = $.mongoose.connection.db.collection('caches');

module.exports = {
  wrap (key, work, options, fn) {
    if (typeof options === 'function') {
      fn = options;
      options = {};
    }

    Collection.findOne({ key }, (err, data) => {
      data = data && data.data && JSON.parse(data.data);

      if (data) {
        $.logging.verbose('cache', `retrieved entry: ${key}`);
        return fn(null, data);
      }

      return work((err, data) => {
        fn(err, data);

        if (!data) {
          return;
        }

        const date = new Date();
        date.setSeconds(date.getSeconds() + (options.ttl || TTL));

        Collection.insert({
          key,
          delete_key: options.delete_key,
          data: JSON.stringify(data),
          date_expires: date
        }, () => $.logging.verbose('cache', `created entry: ${key}`));
      });
    });
  },

  clear (key, fn = () => {}) {
    const rx = new RegExp(key);

    Collection.remove({ delete_key: rx }, err => {
      if (err) {
        $.logging.verbose('cache', `ERROR while deleting entries: ${key}`, err);
      }
      else {
        $.logging.verbose('cache', `deleted entries: ${key}`);
      }

      return fn(err);
    });
  }
};
