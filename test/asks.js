'use strict';

var expect = require('chai').expect;
var asks = require('../');

var schema = {
    c: {
        description: '>1, start with a',
        // default: 'abcdef',
        validator: [
            function (v, is_default) {
                return v.length > 1 ? true : 'should longer than 1'
            },

            function (v, is_default, done) {
                done( v.indexOf('a') === 0 ? null : 'should start with a' )
            }
        ],

        required: true
    },

    d: {
        // skipped
    },

    e: {
        hidden: true,
        default: 'defaulte'
    },

    f: {
        // normal
        default: 'defaultf'
    },

    g: {
        hidden: true
    }
};

asks({
    skip: {
        d: true
    }
})
// .on('retry', function () {
//     console.log('retry');
    
// }).on('error', function (err) {
//     console.log('error', err)
    
// }).on('cancel', function () {
//     console.log('cancel')

// })
.on('skip', function (name, value) {
    console.log(name, 'skipped');
})
.get(schema, function (err, result) {
    console.log('result', arguments)
});
