const chalk = require('chalk'),
	Events = require('events');
module.exports = class Cache extends Events {
	#opts = {}; #cache = {}; defaultOptions = { ttl: 10800 };
	constructor(options) {
		super();
		Object.assign(this.#opts, this.defaultOptions, options);
	}
	async #live(key, val, ttl) {
		setTimeout(() => {
			this.emit('expire', key, val, ttl);
			delete this.#cache[key];
		}, ttl*1000);
	}
	set(key = 'default', val, ttl = 0) {
		this.#cache[key] = val;
		this.#live(key, val, ttl ? ttl : this.#opts.ttl);
		return this;
	}
	get(...args) {
		let a = [];
		args.forEach(e => a.push(this.#cache[e]));
		return a.length == 1 ? a[0] : a;
	}
	getValues(start = 0, num = 5, sort, dir = 0) {
		let val = Object.values(this.#cache).slice(start, num);
		if (sort) {
			val = Object.values(this.#cache).sort((a, b) => {
				const c = (q) => {
					if (typeof q === 'object' && !Array.isArray(q) && q !== null) return q[sort];
					else return q;
				};
				return dir ? (c(a) > c(b)) ? 1 : -1 : c(a) < c(b) ? 1 : -1;
			}).slice(start, num);
		}
		return val;
	}
	flush() {
		this.#cache = {};
	}
};