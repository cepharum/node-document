require('sugar');
var url = require('url'),
    helpers = require('../helpers'),
    inspect = helpers.inspect,
    debug = console.log,

    elastical = require('elastical');

// == DOCS:
//  - https://github.com/rgrove/node-elastical

// -----------------------
//  Constructor
// --------------------

function ElasticSearchStorage (options) {
  var endpoint_url = process.env.ELASTICSEARCH_INDEX_URL || ElasticSearchStorage.url,
      endpoint = url.parse(endpoint_url);

  var defaults = Object.extended({
    hostname: endpoint.hostname,
    port: endpoint.port,
    // auth: endpoint.authendpoint.auth,
    // protocol: endpoint.protocol,
    index: endpoint.pathname.replace(/^\//, '')
  });
  options = defaults.merge(options);

  this.client = new elastical.Client(endpoint.hostname, options);
  this.options = options;

  if (process.env.NODE_ENV !== 'test')
    console.log("ElasticSearch.INIT: %s", endpoint_url);

  this.klass = this.constructor;
  this.type = 'storage';
}

// -----------------------
//  Class
// --------------------

ElasticSearchStorage.url = 'http://localhost:9200/{db}.{env}'.assign({db: 'default', env: (process.env.NODE_ENV || 'development')});

// -----------------------
//  Instance
// --------------------

// WARN: Assumes the key format: ":type" or ":type/:id".
ElasticSearchStorage.prototype.key = function(key) {
  var key_args = key.split('/').map(function(_key) { return Object.isNumber(_key) ? ('' + _key) : _key; });
  return {type: key_args[0], id: key_args[1]};
};

// set(key, value, callback)
// set(key, value, options, callback)
ElasticSearchStorage.prototype.set = function(key, value) {
  var self = this, options, callback;

  if (Object.isObject(arguments[2])) {
    options = Object.extended(arguments[2]);
    callback = arguments[3];
  } else {
    options = Object.extended({});
    callback = arguments[2];
  }

  var key_was_collection = Object.isArray(key);
  var keys = key_was_collection ? key : [key];

  var value_was_collection = Object.isArray(value),
      values = value_was_collection ? value : [value];

  var key_values = Object.extended({});

  if (keys.length !== values.length)
    throw new Error("Key/Value sizes must match.");

  keys.each(function(key, i) {
    key_values[key] = values[i];
  });

  if (Object.isEmpty(options.id))
    delete options.id;

  var commands = keys.map(function(_key, i) {
    var resource = self.key(_key);
    options = Object.extended({
      create: false, // => "create OR update"
      // refresh: true
    }).merge(options || {});
    return {'index': options.merge({index: self.client.options.index, type: resource.type, id: resource.id, data: key_values[_key]})};
  });

  self.client.bulk(commands, function(err, response) {
    var responses = Object.isArray(response.items) ? response.items : [];
    var results = responses.map(function(response) {
      var result = ((err || !(response['index'] || response['create']) || !(response['index'] || response['create']).ok) ? false : true);
      return result;
    });

    if (Object.isFunction(callback)) callback(err, results, responses);
  });
};

// get(key, callback)
// get(key, options, callback)
ElasticSearchStorage.prototype.get = function(key) {
  var self = this, options, callback;

  if (Object.isObject(arguments[1])) {
    options = Object.extended(arguments[1]);
    callback = arguments[2];
  } else {
    options = Object.extended({});
    callback = arguments[1];
  }

  var key_was_collection = Object.isArray(key);
  var keys = key_was_collection ? key : [key];

  // TODO: Add "_mget" support to "node-elastical" - now not using bulk command because of this.
  //    - http://www.elasticsearch.org/guide/reference/api/multi-get.html

  var responses = [],
      results = [],
      results_by_id = Object.extended({}),
      ids = keys.map(function(_key) { return self.key(_key).id; });

  // REFACTOR: See MemoryStorage.get

  keys.each(function(_key) {
    var resource = self.key(_key);

    options = options.merge({type: resource.type || '_all', ignoreMissing: true});

    self.client.get(self.client.options.index, resource.id, options, function(err, data, response) {
      var result = data;

      results_by_id[resource.id] = {err: err, result: result, response: response};

      if (results_by_id.keys().length === keys.length) {
        // NOTE: To get responses in requested order.
        ids.each(function(id) {
          results.push(results_by_id[id].result);
          responses.push(results_by_id[id].response);
        });

        if (Object.isFunction(callback)) callback(err, results, responses);
      }
    });
  });
};

// del(key, value, callback)
// del(key, value, options, callback)
ElasticSearchStorage.prototype.del = function(key) {
  var self = this, options, callback;

  if (Object.isObject(arguments[1])) {
    options = Object.extended(arguments[1]);
    callback = arguments[2];
  } else {
    options = Object.extended({});
    callback = arguments[1];
  }

  var key_was_collection = Object.isArray(key);
  var keys = key_was_collection ? key : [key];

  var responses = [],
      results = [],
      results_by_id = Object.extended({});

  // REFACTOR: See MemoryStorage.del

  try {
    var ids = keys.map(function(_key) {
      var id = self.key(_key).id;
      if (Object.isEmpty(id)) throw new Error("Invalid ID: " + id);
      return id;
    });

    // TODO: Figure out how to get status for bulk deletes, i.e. "response.found" - now not using bulk command because of this.

    keys.each(function(_key) {
      var resource = self.key(_key);

      options = options.merge({ignoreMissing: true});

      self.client.delete(self.client.options.index, (resource.type || '_all'), resource.id, options, function(err, response) {
        var result = ((err || !response.found) ? false : true);

        results_by_id[resource.id] = {err: err, result: result, response: response};

        if (results_by_id.keys().length === keys.length) {
          // NOTE: To get responses in requested order.
          ids.each(function(id) {
            results.push(results_by_id[id].result);
            responses.push(results_by_id[id].response);
          });

          if (Object.isFunction(callback)) callback(err, results, responses);
        }
      });
    });

  } catch (err) {
    results = keys.map(function() { return false; });
    if (Object.isFunction(callback)) callback(err, results, responses);
  }
};

// delete(key, value, callback)
// delete(key, value, options, callback)
ElasticSearchStorage.prototype.delete = ElasticSearchStorage.prototype.del;

// end()
ElasticSearchStorage.prototype.end = function() {
  // (nothing)
};

module.exports = ElasticSearchStorage;