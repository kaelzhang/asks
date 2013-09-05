'use strict';

var asks = module.exports = function(options) {
    return new Asks(options); 
};

asks.Asks = Asks;


var async = require('async');
var read = require('read');
var typo = require('typo');
var node_util = require('util');

function mix (receiver, supplier, override){
    var key;

    if(arguments.length === 2){
        override = true;
    }

    for(key in supplier){
        if(override || !(key in receiver)){
            receiver[key] = supplier[key]
        }
    }

    return receiver;
}


var DEFAULT_OPTIONS = {
    prompt_template : '{{gray description}}',
    default_message : '{{name}}: invalid input', 
    required_message: 'This field is required',

    // by default, if error, have only one change to recorrect
    retry           : 1
};


function Asks(options){
    this.options = mix(options || {}, DEFAULT_OPTIONS, false);
};


Asks.prototype.get = function(schema, callback) {
    var self = this;

    async.series(
        Object.keys(schema).map(function(key) {

            // create shadow copy
            var rules = Object.create( schema[key] );
            rules._name = key;

            rules = self._parseRules(rules);

            return function(done) {
                self._get(rules, done);
            }; 
        }),

        function(err, result_array) {
            if(err){
                callback(err);
            
            }else{
                callback(null, self._result(result_array));
            }
        }
    );
};

Asks.prototype._get = function(rules, callback) {
    var self = this;

    read(rules, function(err, result, is_default) {
        if(!err){
            err = !self._validate(result, rules.validator);

            if(rules.required && !result){
                err = {
                    message: self.options.required_message
                };
            }
        }

        if(err){
            var not_canceled = err.message !== 'canceled';

            if(not_canceled){
                typo.log( typo.template(err.message || rules.message || self.options.default_message, rules) );
            }else{
                typo.log('{{gray canceled...}}');
            }

            if(not_canceled && rules.retry --){
                return self._get(rules, callback);
            }

            return callback(err);
        }

        rules.value = result;
        rules.is_default = is_default;

        callback(null, rules);
    });
};


Asks.prototype._validate = function(value, validator) {
    if(node_util.isRegExp(validator)){
        return validator.test(value);
    }else if(typeof validator === 'function'){
        return validator(value);
    }else{
        return true;
    }
};


Asks.prototype._parseRules = function(rules) {
    rules.description = rules.description || '';

    if(!rules.prompt){
        rules.prompt = typo.template(this.options.prompt_template, rules);
    }

    rules.retry = rules.retry || this.options.retry;

    return rules;
};

Asks.prototype._result = function(result_array) {
    var ret = {};

    result_array.forEach(function(result) {
        ret[result._name] = {
            value: result.value,
            is_default: result.is_default
        };
    });

    return ret;
};


