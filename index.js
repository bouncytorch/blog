const http = require('http'),
	https = require('https'),
	yaml = require('yaml');
const Cache = require('./modules/cache'),
	cache_blog = { meta: new Cache(), src: new Cache() };
const htmltoimg = require('node-html-to-image'),
	_ = require('lodash'),
	nodemailer = require('nodemailer'),
	chalk = require('chalk'),
	fs = require('fs'),
	chokidar = require('chokidar'),
	path = require('path'),
	ejs = require('ejs'),
	express = require('express'),
	moment = require('moment'),
	mime = require('mime');
const markdown = require('./modules/markdown');
let settings = {};
let log = {
	app: (...msg) => console.log(chalk`[{blueBright APP}] ${msg.join(' ')}`),
	blog: (...msg) => console.log(chalk`[{yellowBright BLOG}] ${msg.join(' ')}`)
};

// Checks for missing files and license agreement
const defaultSettings = `license: false                       # SET THIS TO TRUE AFTER READING THE LICENSE
logs:                               
  enabled: true                     # By default, the app comes with a logger function. 
  path: './logs'                    # Path at which log files are saved.
  format: 'DD.MM.YYYY'              # This controls how log files are named - 'log.<date format>.txt'. You can remove 'DD.' to group logs by months.
static: 
  path: './static'                  # Path to static files relative to the server.
  url: '/assets'                    # Path, at which static will be served to the user.
templater:                          # By default, this site is bundled with EJS.
  enabled: true                     # To serve static pages, toggle this off and store your pages in static folder.
  file: './views/template.ejs'       # Path to the template file.
  pages: './views/pages'            # Path to served pages.
blog:                               # This site also comes with a blog system.
  url: '/blog'                      # Url path to your blog's main page server to the user.
  seo: './static/images/seo/blog'   # Path to folder, in which to generate meta images for the blog. (SEO)
  pages: './views/pages/blog_pages' # Path to folder with all the blog pages in .md format.
  thumbnail: './views/thumbnail_blog.html'
ssl:                                # Toggle this to enable HTTPS support and disable browser warning. You don't need this if you're using some kind of proxy, like CloudFlare.
  enabled: true                     # WARNING: You must provide your own SSL certificate in order for this to work.
  paths:                            # WARNING: More on SSL here: https://en.wikipedia.org/wiki/SSL.
    ca: './ssl/ca.pem'              
    cert: './ssl/cert.pem'
    key: './ssl/key.pem'
mail:
  enabled: true
    user: 'lynch.madplay265@gmail.com'
    pass: 'tuyxnptqxddrjjid'
`;
if (fs.existsSync('./settings.yaml')) settings = yaml.parse(fs.readFileSync('./settings.yaml').toString());
else { settings = yaml.parse(defaultSettings); fs.writeFileSync('./settings.yaml', defaultSettings); }
if (!settings.license) return console.log(chalk`{bgRedBright ERROR}: Thank you for checking out the repo! To proceed, read the LICENSE. To acknowledge it, set "license: true" in settings.yaml`);
let icheckFailed = false;
const integrityCheck = (obj, ref, lpath) => Object.keys(ref).forEach((key, index, arr) => {
	if (!(key in obj)) { obj[key] = ref[key]; icheckFailed = true; }
	if (typeof obj[key] === 'object' && !Array.isArray(obj[key]) && obj[key] !== null) integrityCheck(obj[key], ref[key], `${lpath}.${key}`);
	else if (typeof obj[key] !== typeof ref[key]) { console.log(chalk`{bgRedBright ERROR}: Settings file is corrupted/incorrect at path ${lpath}.${key}`); process.exit(1); }
	if (index == arr.length - 1 && icheckFailed) fs.writeFileSync('./settings.yaml', yaml.stringify(settings));
});
integrityCheck(settings, yaml.parse(defaultSettings), 'settings');
if (settings.blog.enabled && !settings.templater.enabled) return log.app(chalk`{bgRedBright ERROR}: Templater must be enabled for the blog to work`);

// Recording bullshit
let record;
if (settings.logs.enabled) record = (...msg) => fs.appendFileSync(path.join(settings.logs.path, `log.${moment().format('DD.MM.YYYY')}.txt`), `\n[${moment().format('hh:mm:ss')}] ${msg.join(' ')}`);
else record = () => {};
record('Server started.');

// Blog page renderer.
const blogPageGen = async (n) => {
	const m = markdown(fs.readFileSync(path.join(settings.blog.pages, `${n}.md`)).toString());
	m.meta.id = n;
	const pathToThumbnail = path.join(settings.blog.seo, `${n}.png`);
	if (!fs.existsSync(pathToThumbnail) || !fs.lstatSync(path.join(pathToThumbnail)).isFile()) {
		const date = new Date(m.meta.date * 1000);
		const month = new Intl.DateTimeFormat('en-US', { month:'long' }).format(date);
		const number = date.getDate();
		const year = date.getFullYear();
		date.setSeconds(0);
		const time = date.toLocaleTimeString('en-US', { timeStyle: 'short' });
		htmltoimg({
			html: fs.readFileSync(settings.blog.thumbnail).toString(),
			output: pathToThumbnail,
			type: 'png',
			waitUntil: 'networkidle0',
			selector: 'body > div',
			content: {
				title: m.meta.title.toUpperCase(),
				description: m.meta.description,
				author: m.meta.author,
				month: month,
				number: number,
				year: year, 
				time: time
			},
			puppeteerArgs: {
				args: ['--no-sandbox']
			}
		}).then(() => { log.blog(chalk`Generated thumbnail image for {blueBright ${n}}.md`); record(`[BLOG] Generated thumbnail image for ${path.resolve(settings.blog.pages, n + '.md')} at ${path.resolve(settings.blog.seo, `${n}.png`)}`); });
	}
	return n, m;
};

if (settings.blog.enabled) chokidar.watch(path.join(settings.blog.pages, '*'))
	.on('add', (p, s) => {
		record(`[BLOG] New file at path ${p}. Cache regenerated for ${path.resolve(p)}`);
		log.blog(`New file at path ${p}. Cache regenerated for ${path.resolve(p)}`);
		const pp = path.parse(p).name.replace(path.extname(p));
		blogPageGen(pp).then(v => cache_blog.meta.set(pp, v.meta));
	})
	.on('change', (p, s) => {
		record(`[BLOG] File updated at path ${p}. Cache regenerated for ${path.resolve(p)}`);
		log.blog(`File updated at path ${p}. Cache regenerated for ${path.resolve(p)}`);
		const pp = path.parse(p).name.replace(path.extname(p));
		blogPageGen(pp).then(v => { cache_blog.meta.set(pp, v.meta); if (cache_blog.src.get(pp)) cache_blog.src.set(pp, v.html); });
	})
	.on('unlink', (p, s) => {
		record(`[BLOG] File removed at path ${p}. Cache deleted for ${path.resolve(p)}`);
		log.blog(`File remove at path ${p}. Cache regenerated for ${path.resolve(p)}`);
		const pp = path.parse(p).name.replace(path.extname(p));
		cache_blog.meta.set(pp, null);
		cache_blog.src.set(pp, null);
	});

// [BLOG]: Set metadata cache. (Without rendered pages)
if (settings.blog.enabled) cache_blog.meta.on('expire', (key, val, ttl) => {
	record(`[BLOG] Metadata cache regenerated for ${path.resolve(settings.blog.pages, key + '.md')}`);
	blogPageGen(key).then(v => cache_blog.meta.set(key, v.meta));
});

let transport;
if (settings.mail.enabled)  { transport = nodemailer.createTransport({
	host: 'smtp.gmail.com',
	port: 465,
	auth: {
		user: settings.mail.user,
		pass: settings.mail.pass
	}
});

transport.verify(); }

const server = express();
server.set('view engine', 'ejs')

	.use(require('express-slashes')())
	.use(require('cors')())
	.use(require('body-parser').urlencoded({ extended: false }))
	.use(require('body-parser').json())
	
	.use((req, res, next) => { res.rt = (name, vars, head) => res.render('template', {
		head: { 
			meta: { type: 'website', title: 'bouncytorch', description: 'bouncytorch - Electronic, Orchestral and World music, immature film, audio and sound design studies, web and game development discussions and updates.', image: '/assets/images/seo/default.webp', path: req.url },
			assets: settings.static.url,
			styles: [],
			scripts: ['https://kit.fontawesome.com/de3d0d4b48.js', 'https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.1/anime.min.js'],
			...head
		},
		content: name,
		variables: vars,
	}); next(); })
	
	.use(require('express-subdomain')('dupe', require('express-http-proxy')('192.168.0.114:2000')))
	.use(require('express-subdomain')('fl', require('express-http-proxy')('localhost:2023')))

	.use('/assets', express.static('./static'))

	.use('/api/mail', require('express-rate-limit').rateLimit({
		windowMs: 15 * 60 * 1000,
		max: 3,
		standardHeaders: true,
		legacyHeaders: true,
		message: (req, res) => res.rt('ratelimit')
	}))

	.get('/', (req, res) => res.rt('index'))
	.get('/mail', (req, res) => res.rt('mail'))
	.get('/blog', (req, res) => res.rt('blog', null, {
		meta: { type: 'website', title: 'bobsy blog', description: 'bouncytorch\'s blog', image: '/assets/images/seo/blog.png', path: req.url }
	}))

	.post('/api/mail', (req, res) => {
		const s = req.body;
		if (!s.email || !s.sbj || !s.message) res.sendStatus(400);
		else transport.sendMail({
			from: s.email,
			to: 'bouncytorch@gmail.com',
			subject: s.sbj,
			text: `from: ${s.email}\n\n${s.message}`
		}).then(() => res.rt('mail.sent'));
	})
	
	.use((req, res) => res.sendStatus(404));
// const server = async (req = new http.IncomingMessage, res = new http.ServerResponse) => {
// 	record(`[REQ] Method: ${req.method}, Address: ${req.headers.host + req.url}`);
// 	const parsedHost = req.headers.host.split('.').splice(-2, 2).join('.');
// 	const parsedSub = req.headers.host.split('.').slice(0, -2);
// 	const parsedUrl = require('url').parse(req.url);
// 	const parsedPath = parsedUrl.pathname.replace(/\//g, ' /').trim().split(' ');
// 	const parsedQuery = require('querystring').parse(parsedUrl.query);
// 	const pathToStatic = parsedPath.join('').replace(settings.static.url, settings.static.path);
// 	const pipe = (host, port) => req.pipe(http.request({
// 		hostname: host,
// 		port: port,
// 		path: req.url,
// 		method: req.method,
// 		headers: req.headers
// 	}, function (pres) {
// 		res.writeHead(pres.statusCode, pres.headers);
// 		pres.pipe(res, {
// 			end: true
// 		});
// 	}), { end: true });
// 	log.sus = () => log.app(chalk`{redBright [ALERT]} Unusual request. Info: ` + JSON.stringify({
// 		ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
// 		method: req.method,
// 		headers: req.headers,
// 		url: req.url,
// 	}, null, 2));
// 	record('[ALERT] Unusual request. Info: ' + JSON.stringify({
// 		ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
// 		method: req.method,
// 		headers: req.headers,
// 		url: req.url,
// 	}, null, 2));
// 	// if (parsedPath[0] !== '/' && req.url.endsWith('/')) res.writeHead(302, 'Found', { Location: req.url.slice(0, -1) }).end();
// 	let render = () => {};
// 	if (settings.templater.enabled) render = (name, vars, head, callback) => ejs.renderFile(path.join(process.cwd(), settings.templater.file), {
// 		head: { 
// 			meta: { type: 'website', title: 'bouncytorch', description: 'bouncytorch - Electronic, Orchestral and World music, immature film, audio and sound design studies, web and game development discussions and updates.', image: '/assets/images/seo/default.webp', path: req.url },
// 			assets: settings.static.url,
// 			styles: [],
// 			scripts: ['https://kit.fontawesome.com/de3d0d4b48.js', 'https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.1/anime.min.js'],
// 			...head
// 		},
// 		content: name,
// 		variables: vars,
// 	}).then(data => { res.writeHead(200, { 'Content-Type': mime.getType('html') }); if (callback) callback(data); else { res.write(data); return res.end(); } });
// 	if (parsedHost == 'bouncytorch.xyz') {
// 		if (!parsedSub[0]) {
// 			if (req.method == 'POST') {
// 				req.on
// 				req.on('end', () => {

// 				});
// 				switch (parsedPath[0]) {
// 					case '/mail': {
// 						if (!('f' in parsedQuery) || !('s' in parsedQuery) || !('t' in parsedQuery)) return res.writeHead(400).end();
// 						return transport.sendMail({
// 							from: parsedQuery.f,
// 							to: 'bouncytorch@gmail.com',
// 							subject: parsedQuery.s,
// 							text: parsedQuery.t
// 						}).then(() => res.writeHead(200).end());
// 					}
// 				}
// 			}
// 			else if (settings.templater.enabled && req.method == 'GET') {
// 				switch (parsedPath[0]) {
// 					case '/': return render('index');
// 					case '/mail': return render('mail');
// 					// case '/music': return res.writeHead(301, { 'Location': '/blog/0#music' }).end();
// 					// case '/test': return render('test');
// 					// case '/blog': {
// 					// 	if (settings.blog.enabled) {
// 					// 		if (parsedPath.length == 1 && req.method == 'GET') return await render('blog', null, {
// 					// 			meta: { type: 'website', title: 'bobsy blog', description: 'bouncytorch\'s blog', image: '/assets/images/seo/blog.png', path: req.url }
// 					// 		});
// 					// 		else if (req.method !== 'GET') return res.writeHead(405, 'Method Not Allowed').end();
// 					// 		const fullPath = parsedPath.slice(1).join();
// 					// 		const fileName = parsedPath[parsedPath.length - 1].replace('/', '');
// 					// 		if (fs.existsSync(path.join(settings.blog.pages, `${fullPath}.md`))) {
// 					// 			let processedMarkdown, meta, html;
// 					// 			if (!cache_blog.src.get(fileName)) {
// 					// 				processedMarkdown = await blogPageGen(fileName);
// 					// 				meta = processedMarkdown.meta;
// 					// 				html = processedMarkdown.html;
// 					// 				cache_blog.meta.set(fileName, meta);
// 					// 				cache_blog.src.set(fileName, html);
// 					// 			} else {
// 					// 				meta = await cache_blog.meta.get(fileName);
// 					// 				html = await cache_blog.src.get(fileName);
// 					// 			}
// 					// 			if (!meta.id || !meta.title || !meta.description || !meta.author || isNaN(meta.date)) {
// 					// 				log.blog(`Some of the metadata variables in the markdown file ${fileName}.md are not present. Page not displayed or listed.`);
// 					// 				return res.writeHead(500, 'Internal Server Error').end();
// 					// 			}
// 					// 			return await render('blog_page', {
// 					// 				title: meta.title,
// 					// 				date: meta.date,
// 					// 				author: meta.author, 
// 					// 				context: html
// 					// 			}, { meta: {
// 					// 				title: meta.title, 
// 					// 				description: meta.description, 
// 					// 				image: path.join(settings.blog.seo, `${fileName}.png`),
// 					// 				path: req.path
// 					// 			} });
// 					// 		}
// 					// 	}
// 					// 	break;
// 					// }
// 					// case '/api': {
// 					// 	switch (parsedPath[1]) {
// 					// 		case '/blog': {
// 					// 			if (req.method !== 'GET') return res.writeHead(405, 'Method Not Allowed').end();
// 					// 			if (parsedQuery.l <= 0) return res.writeHead(400, 'Bad Request: Request length can\'t be 0 or less.').end();
// 					// 			else if (parsedQuery.l > 40) res.writeHead(400, 'Bad Request: Request item count can\'t be more than 40.').end();
// 					// 			const start = parsedQuery.s && !isNaN(parsedQuery.s) ? Number(parsedQuery.s) : 0,
// 					// 				end = parsedQuery.l && !isNaN(parsedQuery.l) ? Number(parsedQuery.l) + start : 5 + start,
// 					// 				sort = parsedQuery.r ? parsedQuery.r : null,
// 					// 				dir = parsedQuery.d && !isNaN(parsedQuery.d) ? Number(parsedQuery.d) : 0;
// 					// 			res.writeHead(200, { 'Content-Type': mime.getType('json') });
// 					// 			res.write(JSON.stringify(cache_blog.meta.getValues(start, end, sort, dir).filter(a => !a['hide'])));
// 					// 			return res.end();
// 					// 		}
// 					// 	}
// 					// 	break;
// 					// }
// 				}
// 			}
// 			else if (req.method != 'GET') return res.writeHead(405, 'Method Not Allowed').end();
// 			if (fs.existsSync(pathToStatic) && fs.lstatSync(pathToStatic).isFile() && req.method == 'GET') {
// 				res.writeHead(200, { 'Content-Type': mime.getType(path.extname(pathToStatic)) ? mime.getType(path.extname(pathToStatic)) : 'application/octet-stream' });
// 				return fs.createReadStream(pathToStatic).pipe(res)
// 					.on('finish', () => res.end())
// 					.on('error', (err) => { res.writeHead(500, 'Internal Server Error').end(); log.app(err); });
// 			}
// 			else if (req.method !== 'GET') return res.writeHead(405, 'Method Not Allowed').end();
// 			else return res.writeHead(404, 'Not Found').end();
// 		}
// 		else if (parsedSub == 'mc') pipe('192.168.0.114', 2826);
// 		else if (parsedSub == 'dev') pipe('localhost', 2000);
// 		else log.sus();
// 	}
// 	else if (parsedHost == 'joystickjokers.lol') pipe('192.168.0.114', 6942);
// 	else log.sus();
// };

// [APP]: Create HTTP server. 
https.createServer({ 
	key: fs.readFileSync(settings.ssl.paths.key),
	cert: fs.readFileSync(settings.ssl.paths.cert),
	ca: fs.readFileSync(settings.ssl.paths.ca),
}, server).on('error', (err) => { record(`[HTTP_ERR] ${err.stack}`); log.app(chalk`{redBright [ERROR]} ${err.stack}`); }).listen(443, () => log.app('Listening on port 443'));
http.createServer(server).on('error', (err) => { record(`[HTTP_ERR] ${err.stack}`); log.app(chalk`{redBright [ERROR]} ${err.stack}`); }).listen(80, () => log.app('Listening on port 80'));

// [LOGS]: Record exit state.
process.on('exit', () => { record('Server exiting.'); process.exit(); });
process.on('uncaughtException', (err) => {
	log.app(chalk`{redBright [EXCEPTION]} ${err.stack}`);
	record(`[EXCEPTION] ${err.stack}`);
});
