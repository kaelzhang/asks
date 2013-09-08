'use strict';

var asks = module.exports = function(options) {
    return new Asks(options); 
};

asks.Asks = Asks;

var async       = require('async');
var read        = require('read');
var loggie      = require('loggie');

var node_util   = require('util');
var node_path   = require('path');
var node_url    = require('url');
var EE          = require('events').EventEmitter;

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
    prompt_template : '[{{green ?}}] {{gray description}}',
    default_message : 'Invalid input', 
    required_message: 'This field is required',

    // by default, if error, have only one change to recorrect
    retry           : -1
};

// 'yes', 'Y', 'true', '1' -> true
var REGEX_YES = /^[yt]|1/i;

var REGEX_CONTAINS_NO = /[nf0]/i;
var REGEX_CONTAINS_YES = /[yt1]/i;
var REGEX_EMPHASIZE_YES = /[YT]/;
var REGEX_EMPHASIZE_NO = /[NF]/;

function measure_boolean (v) {
    var emphasize_yes = REGEX_EMPHASIZE_YES.test(v);
    var emphasize_no = REGEX_EMPHASIZE_NO.test(v);
    
    if ( emphasize_yes ^ emphasize_no ) {
        // 'y/N' -> false
        // 'Y/n' -> true
        return emphasize_yes;
    } else {
        // Contains neither 'Y' nor 'N' or
        // contains 'Y' and 'N' simultaneously
        return order_boolean(v);
    }
}

function order_boolean (v) {
    var exec_yes = REGEX_CONTAINS_YES.exec(v);
    var exec_no = REGEX_CONTAINS_NO.exec(v);

    // If 'y' comes first -> true
    return exec_yes.index < exec_no.index;
}

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
            // true -> true
            // 'y' -> true
            if ( v !== !!v ) {
                v = REGEX_YES.test(v);
            }

            done(null, v);
        },

        __default: function (v) {
            // undefined -> false
            // true -> true
            // false -> false
            if ( typeof v !== 'string' ) {
                return !!v;
            }

            var contains_yes = REGEX_CONTAINS_YES.test(v);
            var contains_no = REGEX_CONTAINS_NO.test(v);

            if ( contains_yes & contains_no ) {
                return measure_boolean(v);

            // 'abcd' -> true
            // '' -> false
            } else if ( !contains_yes & !contains_no ) {
                return !!v;

            } else {
                // 'yes' -> true
                // 'no' -> false
                return contains_yes;
            }
        }
    },

    'path': {
        setter: function (v, is_default, done) {
            done(null, node_path.resolve(v));
        }
    },

    'url': {
        validator: function (v, is_default, done) {
            var valid = !!node_url.parse(v).host;
            done(valid ? null : true);
        }
    },

    _default: {}
};


// @param {Object} options
// - input: 
// - output:
// - context: `Object` the context of the helper functions
// - 
function Asks(options){
    this.options = options = mix(options || {}, DEFAULT_OPTIONS, false);
    this._types = {};
    this._context = options.context || this;
    this.logger = options.logger || loggie();
};

node_util.inherits(Asks, EE);

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

    schema = this.parseSchema(schema);

    async.series(
        Object.keys(schema).filter(function (key) {
            return key !== '_asks';

        }).map(function(key) {
            var rule = schema[key];

            return function(done) {
                self._get(rule, rule.retry, done);
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


Asks.prototype.parseSchema = function(schema) {
    // if the current schema is the parsed schema
    if ( schema._asks ) {
        return schema; 
    }

    if ( schema._asksSchema ) {
        return schema._asksSchema;
    }

    var parsed = {
            _asks: true
        };
    var name;

    for(name in schema){
        parsed[name] = this._parseRule(name, schema[name]);
    }

    // parse each rule and cache it
    schema._asksSchema = parsed;

    return parsed;
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
    this._types[type] = setting;
    return this;
};


// Private methods
//////////////////////////////////////////////////////////////////////

// Get a single value
Asks.prototype._get = function(rule, retry, callback) {
    var self = this;

    read(rule._read, function(err, result, is_default) {
        if(err){
            var cancel = err.message === 'canceled';

            if ( cancel ) {
                return self._emit('cancel');
            }else{
                return self._retry(err, rule, retry, callback);
            }
        }

        self._validate(result, is_default, rule, function (err) {
            if ( err ) {
                return self._retry(err, rule, retry, callback);
            }

            self._set(result, is_default, rule, function (err, value) {
                if ( err ) {
                    return self._retry(err, rule, retry, callback);
                }
                // actual callback
                callback(null, {
                    rule: rule,
                    value: value
                });
            });
        });
    });
};


Asks.prototype._validate = function(value, is_default, rule, callback) {
    var validators = rule.validator;
    var self = this;

    if(validators.length === 0){
        return callback(null);
    }

    async.series(
        validators.map(function (validator) {
            return function (done) {
                validator.call(self._context, value, is_default, done);
            };
        }),
        callback
    );
};


Asks.prototype._set = function(value, is_default, rule, callback) {
    var setters = rule.setter;
    var self = this;

    if(setters.length === 0){
        return callback(null, value);
    }

    async.waterfall(
        setters.map(function (setter) {
            return function(v, done){
                // the first function of `async.waterfall` series
                if(arguments.length === 1){
                    done = v;
                    v = value;
                }
                setter.call(self._context, v, is_default, done);
            }
        }),
        callback
    );
};


Asks.prototype._retry = function(err, rule, retry, callback) {
    var self = this;
    var data = {
        err: err === true ?
            this.logger.template(this.options.default_message, rule._ruin) :
            err,
        name: rule._name
    };

    if ( retry -- ) {
        self._emit('retry', data);
        // give it another chance
        process.nextTick(function () {
            self._get(rule, retry, callback);
        });

    }else{
        self._emit('error', data);

        // TODO: default error message
        return callback(err);
    }
};


Asks.prototype._parseRule = function(name, rule) {
    rule._name = name;
    rule.description = rule.description || name;

    // undefined -> []
    rule.validator = this._parseValidators(rule.validator);
    rule.setter = this._parseSetters(rule.setter);

    // type
    if ( typeof rule.type === 'string' ) {
        rule._type = rule.type;
        rule.type = this._getType(rule.type);

    }else if( Object(rule.type) !== rule.type ){
        rule.type = {};
    }

    if ( rule.type.validator ) {
        rule.validator.push(rule.type.validator);
    }

    if ( rule.type.setter ) {
        rule.setter.push(rule.type.setter);
    }

    if ( 'default' in rule ) {
        if ( rule.type.__default ) {
            rule.default = rule.type.__default(rule.default);
        }
        
    } else if (rule.required) {
        rule.validator.unshift(required_validator);
    }

    rule.retry = rule.retry || this.options.retry;

    this._generateStringMembers(rule);
    this._generateReadOptions(rule);

    return rule;
};


Asks.prototype._generateStringMembers = function(rule) {
    rule._ruin = {
        description: rule.description,
        default: rule.default,
        name: rule._name,
    };
};

// Create options for module `read`
Asks.prototype._generateReadOptions = function (rule) {
    rule._read = {
        prompt: this.logger.template(this.options.prompt_template, rule._ruin),
        silent: !!rule.hidden,
        default: rule.default,

        // TODO
        input: process.stdin,
        output: process.stdout
    };
};


Asks.prototype._getType = function(type) {
    return this._types[type] || TYPES[type] || TYPES._default;
};


function required_validator (v, is_default, done){
    done(v === '' ? this.options.required_message : null);
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


Asks.prototype._parseSetters = function(setters) {
    return makeArray(setters).map(function (setter) {
        return this._wrapSetter(setter);

    }, this).filter(Boolean);
};


Asks.prototype._wrapSetter = function(setter) {
    if ( typeof setter === 'function' ) {
        if ( setter.length === 3 ) {
            return setter;
        }else{
            return function (v, is_default, done) {
                done(null, setter.call(this, v, is_default));
            };
        }
    }
};


Asks.prototype._result = function(result_array) {
    var ret = {};

    result_array.forEach(function(result) {
        ret[result.rule._name] = result.value;
    });

    return ret;
};


var DEFAULT_EVENTS = {
    error: function (data) {
        this.logger.error(data.err);
    },

    retry: function (data) {
        this.logger.warn(data.err);
    },

    cancel: function () {
        this.logger.info('\n');
        this.logger.warn('Canceled by user.');
    }
};


Asks.prototype._emit = function (type) {
    if ( EE.listenerCount(this, type) === 0 ) {
        var handler = DEFAULT_EVENTS[type];
        var args;

        if ( handler ) {
            args = Array.prototype.slice.call(arguments);
            args.shift();
            handler.apply(this, args);
        }
    }else{
        this.emit.apply(this, arguments);
    }
};



