const { setConfig } = require('dompurify');
const p = require('path');
module.exports = {
	discord: {
		commands: p.join(process.cwd() + '/modules/commands/')
	},
	express: {
		blog: p.join(process.cwd() + '/views/pages/blog_pages/'),
		views: p.join(process.cwd() + '/views/'),
		static: p.join(process.cwd() + '/static/'),
		seo: p.join(process.cwd(), '/static/images/seo/')
	}
};