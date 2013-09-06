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


function makeArray (subject) {
    return Array.isArray(subject) ? 
        subject :
        subject === undefined || subject === null ?
            [] :
            [subject];
}


var DEFAULT_OPTIONS = {
    prompt_template : '{{gray description}}',
    default_message : '{{name}}: invalid input', 
    required_message: 'This field is required',

    // by default, if error, have only one change to recorrect
    retry           : 1
};


var TYPES = {
    'string': {
        setter: function (v, is_default, done) {
            done(null, String(v));
        }
    },

    'number': {
        setter: function (v, is_default, done) {
            done(null, Number(v));
        }
    },

    'boolean': {
        setter: function (v, is_default, done) {
            done(null, !!v);
        }
    }
};


// @param {Object} options
// - input: 
// - output:
// - context: `Object` the context of the helper functions
// - 
function Asks(options){
    this.options = mix(options || {}, DEFAULT_OPTIONS, false);
    this._types = {};
};

// ## Schema Design

// ```
// name: {
//     validator: 
//         `Function`: function (v, is_default, /*, done*/) {
//             return 
//                 'error message to display' -> override `schema.message`
//                 true -> passed
//                 false -> fail, use message

//             if arguments.length === 2
//                 -> async method
//                 -> treated by async.series
        
//         }, -> convert to `Array`

//         `RegExp`: Regular expression that input must be valid against.
//             -> convert to `Array.<Function>`

//         `Array.<Function|RegExp>`

//     setter: function (v, is_default,/*, done*/) {
//         return value

//         if arguments.length === 2
//             -> done(err, value)
//     },

//     message: 'error message to display',
//     required: true,
//         -> pushed to `schema.validator`

//     hidden: true,
//     default: 'default value',
//         -> if `schema.default` is specified, `schema.required` will be ignored

//     type: 'string',
//         -> `type.validator` will be chained after `schema.validator`
//         -> `type.setter` will be chained after `schema.setter`

//     description: 'Prompt displayed to the user. If not supplied name will be used.',

//     retry:
//         1: if error, have only one change to recorrect, or will be considered as a failure
//         0 or not true: no limit
// }
// ```
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


// string: {
//     validator: function () {
//         return true;
//     },

//     setter: function (v) {
//         return String(v);
//     }
// }
Asks.prototype.registerType = function (type, setting) {

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


Asks.prototype._parseRule = function(rule) {
    rule.description = rule.description || rule._name;

    if(!rule.prompt){
        rule.prompt = typo.template(this.options.prompt_template, rule);
    }

    // undefined -> []
    rule.validator = this._parseValidators(rule.validator);

    if ( rule.required ) {
        rule.validator.push(required_validator);
    }




    rule.retry = rule.retry || this.options.retry;

    return rule;
};


function required_validator (v, is_default, done){
    done(is_default ? true : null);
};


// See "schema design"
Asks.prototype._parseValidators = function(validators) {
    return makeArray(validators).map(function (validator) {
        return this._wrapValidator(validator);

    }, this).filter(Boolean);
};


Asks.prototype._wrapValidator = function(validator) {
    if(typeof validator === 'function'){
        // function (value, done){}
        if(validator.length === 3){
            return validator;
        }else{
            // function (value){} -> function(value, done){}
            return this._asynchronizeValidator(validator);
        }
    
    }else if(node_util.isRegExp(validator)){
        return function (v, is_default, done) {
            done( validator.test(v) ? null : true );
        };

    }else{
        return false;
    }
};


// Convert sync validator to async
Asks.prototype._asynchronizeValidator = function(fn) {
    return function(v, is_default, done){
        var result = fn.call(this, v, is_default);

        if(result === true){
            // no error
            done(null);
        }else if(result === false){
            // unknown error
            done(true);
        }else{
            // a specific error
            done(result);
        }
    };
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


