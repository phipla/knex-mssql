// MS SQL Grammar
// --------------


var _           = require('lodash');
var Helpers     = req('knex/lib/helpers').Helpers;
var baseGrammar = req('knex/clients/base/grammar').baseGrammar;

// The list of different components
var components = [
  'columns', 'aggregates', 'from',
  'joins', 'wheres', 'groups', 'havings',
  'orders', 'offset', 'unions'
];


// Extends the standard sql grammar.
exports.grammar = _.defaults({

  // Wrap keywords in single quotes
  wrapValue: function(value) {
    return (value !== '*' ? Helpers.format('"%s"', value) : "*");
  },

  // Ensures the response is returned in the same format as other clients.
  handleResponse: function(builder, response) {
    var returning = builder.flags.returning;

    if (builder.type === 'insert' && returning) {
      response = _.pluck(response, returning);
    }

    if (builder.type === 'delete' || builder.type === 'update') {
      return response.length;
    }

    return response;
  },

  compileSelect: function(qb) {
    var sql = [];

    if (_.isEmpty(qb.columns) && _.isEmpty(qb.aggregates)) qb.columns = ['*'];
    for (var i = 0, l = components.length; i < l; i++) {
      var component = components[i];
      var result = _.result(qb, component);
      if (result != null) {
        sql.push(this['compile' + Helpers.capitalize(component)](qb, result));
      }
    }
    // If there is a transaction, and we have either `forUpdate` or `forShare` specified,
    // call the appropriate additions to the select statement.
    if (qb.transaction && qb.flags.selectMode) {
      sql.push(this['compile' + qb.flags.selectMode](qb));
    }
    return _.compact(sql).join(' ');
  },

  // Compiles the columns in the query, specifying if an item was distinct.
  compileColumns: function(qb, columns) {
    var columnsIsArray = _.isArray(columns);
    var columnsEmpty = _.isEmpty(columns);
    var limit = _.result(qb, 'limit');

    var sql = 'select ' + 
      (limit != null ? 'top ' + limit : '') +
      (qb.flags.distinct ? ' distinct' : '') + 
      ((columnsIsArray && columnsEmpty) ? '' : ' '+this.columnize(columns));

    sql = qb.aggregates.length && !columnsEmpty ? sql + ',' : sql;
    return sql;
  },


  // Compiles a `delete` query.
  // Adds 'output @@ROWCOUNT' to return the number of affected rows
  compileDelete: function(qb) {
    var table = this.wrapTable(qb.table);
    var where = !_.isEmpty(qb.wheres) ? this.compileWheres(qb) : '';
    return 'delete from ' + table + ' output @@ROWCOUNT ' + where;
  },

  // Compiles an `update` query.
  // Adds 'output @@ROWCOUNT' to return the number of affected rows
  compileUpdate: function(qb) {
    var values = qb.values;
    var table = this.wrapTable(qb.table), columns = [];
    for (var i=0, l = values.length; i < l; i++) {
      var value = values[i];
      columns.push(this.wrap(value[0]) + ' = ' + this.parameter(value[1]));
    }
    return 'update ' + table + ' set ' + columns.join(', ') + ' output @@ROWCOUNT ' + this.compileWheres(qb);
  },

  // Compiles an `insert` query.
  // Adds 'this.compileReturning(qb)' to return insertId
  compileInsert: function (qb) {
    var values      = qb.values;
    var table       = this.wrapTable(qb.table);
    var columns     = _.pluck(values[0], 0);
    var paramBlocks = [];

    // If there are any "where" clauses, we need to omit
    // any bindings that may have been associated with them.
    if (qb.wheres.length > 0) this.clearWhereBindings(qb);

    for (var i = 0, l = values.length; i < l; ++i) {
      paramBlocks.push("(" + this.parameterize(_.pluck(values[i], 1)) + ")");
    }

    return "insert into " + table + " (" + this.columnize(columns) + ") " + this.compileReturning(qb) + " values " + paramBlocks.join(', ');
  },

  // Compiles code to return the insert value for a row
  compileReturning: function(qb) {
    var sql = '';
    if (qb.flags.returning) {
      sql = 'output inserted.' + qb.flags.returning;
    }
    return sql;
  }

}, baseGrammar);