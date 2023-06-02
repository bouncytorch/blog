let b = require('highlight.js').default, a = require('markdown-it')({
		html: true,
		typographer:  true,
		highlight: (e, f) => {
			if (b.getLanguage(f)) return b.highlight(e, { language: f, ignoreIllegals: true }).value;
			else return e;
		}
	}).use(require('markdown-it-abbr'))
		.use(require('markdown-it-attrs'))
		.use(require('markdown-it-emoji'))
		.use(require('markdown-it-footnote'))
		.use(require('markdown-it-ins'))
		.use(require('markdown-it-katex'))
		.use(require('markdown-it-mark'))
		.use(require('markdown-it-sub'))
		.use(require('markdown-it-sup')),
	c = require('yaml');
a.renderer.rules.footnote_block_open = () => (
	'<section class="footnotes">\n' +
		'<ol class="footnotes-list">\n'
);
require('highlight.js/lib/languages/gdscript')(b);
module.exports = (d) => {
	return {
		html: a.render(d.replace(/(<!--).*(-->)/gms, '')),
		meta: c.parse(d.match(/(?<=<!--).*(?=-->)/gms)[0])
	};
};
