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

### Types and Setters


### Schema Structures


Where `schema` might contains:

- validator: 
	- `RegExp` The regular exp that input must matches against
	- `Function` Validation function. If `arguments.length === 3`, it will be considered as an async methods
	- `Array.<RegExp|Function>` Group of validations
	- See sections above for details
- type:
	- `'string'`(default) 
	- `'number'` The result will be converted to a number
	- `'boolean'` If user input matches `/^yt1/i` (such as `'y'`, `'Yes'`, `'true'`), it will be converted to `true`, otherwise `false`; 
- setter: `Function|Array` See sections above for details
- message: `String`
- required: `Boolean=`
- hidden: `Boolean=`
- default: `String`
- description: `String` Description displayed to the user. If not specified name will be used.
- retry: `Number` 
	- `> 0` extra change(s) before 'error' event fires. 
	- `0` means if you make a mistake, you fail; 
	- `-1`(default) makes it no limit.
