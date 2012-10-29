
var es = require('elastical');

module.exports = {
  get: function(db, type, id, callback) {
    var client = new es.Client('localhost', {port: 9200});

    client.get(db, id, {type: type}, function(err, res) {
      callback(err, res);
    });
  },

  set: function(db, type, id, data, callback) {
    var client = new es.Client('localhost', {port: 9200});

    client.index(db, type, data, {id: id, create: false}, function(err, res) {
      callback(err, res);
    });
  },

  del: function(db, type, id, callback) {
    var client = new es.Client('localhost', {port: 9200});

    client.delete(db, type, id, {}, function(err, res) {
      callback(err, res);
    });
  }
};
