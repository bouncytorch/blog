require('dotenv').config();
const chalk = require('chalk');
const MySQL = require('mysql'),
	db = MySQL.createPool({ 
		host: process.env.MYSQL_HOST, 
		user: process.env.MYSQL_USER, 
		password: process.env.MYSQL_PASSWORD, 
		database: 'web_bouncytorch' 
	});

exports = db;