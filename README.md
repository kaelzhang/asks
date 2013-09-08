# Asks

Asks is a node.js wrapper for read(1).
	
## Usage
```sh
npm install asks --save
```

```js
var asks = require('asks');
```

### Basic Prompt

```js
asks(options).get(schema, function(err, result){
	console.log(result);
});
```

### Validation, Error Messages

#### Simple regular expression

```js
asks(options).get({
	username: {
		validator: /^[a-z0-9_]+$/,
		// if stdin doesn't match `validator`, `message` will be displayed.
		message: 'Username can only contains lowercase letters, numbers and underscore.'
	},
	password: {
		validator: /^[a-z0-9]$/i
	}
}, function(err, result){
	console.log('The name is', result.username);
	console.log('The password is', result.password)
});
```

#### Custom validation function

```js
function validate_name (value, is_default){
	if(is_default){
		// If returns a string, the return value will be the error message.
		return 'You must specify a name';
	}
	if(/^[a-z0-9_]+$/.test(value)){
		// If returns false, `message` will be displayed
		return false;
	}
	// passes the validation
	return true;
}

asks(options).get({
	name: {
		validator: validate_name,
		message: 'Invalid name.'
	}
}, callback);
```

#### Asynchronous validation function

If the validation function has three parameters (i.e. `foo.length === 3`), it will be treated as an asynchronous validator.

```js
function async_validate (value, is_default, done){
	remote_check(value, function(err){
		done(err)
	});
}

asks(options).get({
	name: {
		validator: async_validate
	}
}, callback);
```

#### Complex and multiple validations

You can use those tree kinds of validators above together! Just put them in an array!

```js
username: {
	validator: [/^[a-z0-9_]+$/, validate_name, async_validate]
}
```

### Customize Output with Events

There are 3 event types:

- `'retry'` If `asks` give you another chance
- `'error'` If the validation fails or any error occurs
- `'cancel'` If user press '^C'

`asks` gives these 3 events default behaviors.

To customize your own events, you need not to remove them, just add your own listeners.

```js
require('colors');
asks()
.on('error', function(data){
	console.log('Oooooops'.red + ': ' + data.err);
})
.get(schema, callback);
```


### Types and Setters

#### Smart "boolean" default value

```js
override: {
	type: 'boolean',
	default: 'Y(recommended)/n'
}
```
If user input nothing, the `result.override` will be `true`.

Default values below will be considered as `true`:

```js
// starts with 'y', 't' or '1' (case insensitive)
'y' 'Yes' 'true' '1'

// Contains uppercased 'Y' or 'T', but no uppercased 'N' nor 'F'
'Yn' 'nY' 'n/Y'

// The same case as 'N' or 'F', but 'Y' or 'T' comes ahead
'YN' 'yn' 'y/n'

// Otherwise `!!rule.default`
'abc'
```

I thought I need NOT to tell about `false`.

### Schema Structures, Programming Details

```js
{
	<name>: <rule>
}
```


Where `rule` might contains (all properties are optional):

##### validator 

- `RegExp` The regular exp that input must matches against
- `Function` Validation function. If `arguments.length === 3`, it will be considered as an async methods
- `Array.<RegExp|Function>` Group of validations. Asks will check each validator one by one. If validation fails, the rest validators will be skipped.
- See sections above for details
	
##### setter `Function|Array`

See sections above for details.

##### type `String|Object`

- `'string'`(default) 
- `'number'` The result will be converted to a number
- `'boolean'` If user input matches `/^yt1/i` (such as `'y'`, `'Yes'`, `'true'`), it will be converted to `true`, otherwise `false`;
- `'path'` will be `path.resolve()`d
- `'url'` If user input is not a valid absolute url, it fails.
- `Object` Custom type definition. `type.validator` will be pushed to the end of `validator`. `type.setter` will be pushed to the end of `setter`

##### message `String`

Default error message

##### required: `Boolean=`

##### hidden: `Boolean=`

##### default: `String`

##### description: `String`

Description displayed to the user. If not specified name will be used.

##### retry: `Number` 

- `> 0` extra change(s) before 'error' event fires. 
- `0` means if you make a mistake, you fail; 
- `-1`(default) makes it no limit.
	
## Flow

```
-> User input, and press enter
-> value || `rule.default` || ''
-> check `rule.required`
-> check `rule.validator`, `rule.type.validator`
-> run `rule.setter`, `rule.type.setter`
-> callback

```
