# Asks

Asks is a wrapper for node.js read(1).

## Installation

	
	
## Usage

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
```
asks(options).get({
	username: {
		validator: /^[a-z0-9_]+$/,
		// if stdin doesn't match `validator`, `message` will be displayed.
		message: 'Username can only contains lowercase letters, numbers and underscore.'
	},
	password: {
		validator: //
	}
}, function(err, result){
	console.log('The name is', result.username);
	console.log('The password is', result.password)
});
```

#### Custom validation function

```
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

```
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

```
username: {
	validator: [/^[a-z0-9_]+$/, validate_name, async_validate]
}
```

### Types and Setters


### Schema structure


Where `schema` could be:

```js
<name>: {
	validator: `RegExp|Function|Array`
	type: `String|Object`
	setter: `Function|Array`
	message: `String`
	required: `Boolean=`
	hidden: `Boolean=`
	default: `String`
	description: 
	retry: `Number`
}
```
