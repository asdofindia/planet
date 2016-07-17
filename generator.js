var fs = require('fs')
, readline = require('readline')
, util = require('util');

var request = require('request')
  , FeedParser = require('feedparser')
  , Iconv = require('iconv').Iconv
  , zlib = require('zlib');

var RSS = require('rss');

var posts = new Array;
var feedsFetched = 0;
var totalFeeds;
var feedList = new Array;
var RSSfeed = new RSS({
  title: "Planet",
  description: "One planet!",
  feed_url: "index.xml"
});

function fetch(feed) {
  // Define our streams
  var req = request(feed, {timeout: 10000, pool: false});
  req.setMaxListeners(50);
  // Some feeds do not respond without user-agent and accept headers.
  req.setHeader('user-agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_8_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/31.0.1650.63 Safari/537.36');
  req.setHeader('accept', 'text/html,application/xhtml+xml');

  var feedparser = new FeedParser();


  // Define our handlers
  req.on('error', done);
  req.on('response', function(res) {
    if (res.statusCode != 200) return this.emit('error', new Error('Bad status code'));
    var encoding = res.headers['content-encoding'] || 'identity'
    , charset = getParams(res.headers['content-type'] || '').charset;
    res = maybeDecompress(res, encoding);
    res = maybeTranslate(res, charset);
    res.pipe(feedparser);
  });

  feedparser.on('error', done);
  feedparser.on('end', done);
  feedparser.on('readable', function() {
    var post;
    while (post = this.read()) {
	    posts.push(post);
    }
  });
}

function maybeDecompress (res, encoding) {
  var decompress;
  if (encoding.match(/\bdeflate\b/)) {
    decompress = zlib.createInflate();
  } else if (encoding.match(/\bgzip\b/)) {
    decompress = zlib.createGunzip();
  }
  return decompress ? res.pipe(decompress) : res;
}

function maybeTranslate (res, charset) {
  var iconv;
  // Use iconv if its not utf8 already.
  if (!iconv && charset && !/utf-*8/i.test(charset)) {
    try {
      iconv = new Iconv(charset, 'utf-8');
      console.log('Converting from charset %s to utf-8', charset);
      iconv.on('error', done);
      // If we're using iconv, stream will be the output of iconv
      // otherwise it will remain the output of request
      res = res.pipe(iconv);
    } catch(err) {
      res.emit('error', err);
    }
  }
  return res;
}

function getParams(str) {
  var params = str.split(';').reduce(function (params, param) {
    var parts = param.split('=').map(function (part) { return part.trim(); });
    if (parts.length === 2) {
      params[parts[0]] = parts[1];
    }
    return params;
  }, {});
  return params;
}

function done(err) {
  if (err) {
    console.log(err, err.stack);
    feedsFetched += 1;
    if(feedsFetched == totalFeeds){
    	complete();
    }
    return;
  }
  feedsFetched += 1;
  if (feedsFetched == totalFeeds){
    complete();
  }
  //  process.exit();
}

function complete(){
  console.log('finished fetching feeds');
  var htmldata = ''
      + htmlHeader()
      + htmlSidebar()
      + '<div class="entries">';
  posts = posts.sort(function(a,b) {
    	return new Date(b.pubdate) - new Date(a.pubdate);
  });
  posts = posts.slice(0,20);
  posts.forEach(function(post) {
    htmldata += htmlPosts(post);
    RSSfeed.item({
      title: post.title,
      description: post.description,
      url: post.url,
      guid: post.guid,
      author: post.author,
      date: post.date
    });
  });
  htmldata = htmldata
    + '</div> <!-- close entries -->'
    + htmlFooter();
  fs.writeFileSync('index.html', htmldata);
  fs.writeFileSync('index.xml', RSSfeed.xml({indent: true}));
  process.exit();
}

function htmlHeader(){
  var htmlheader = ''
      + '<!doctype html>'
      + '<html>'
      + '<head>'
      + '<meta name="viewport" content="width=device-width, initial-scale=1">'
      + '<title>Planet</title>'
      + '<link href="style.css" rel="stylesheet" />'
      + '</head>'
      + '<body>'
      + '<h1 class="planetHeader">Planet</h1>';
  return htmlheader;
}

function htmlPosts(post) {
  var posthtml = '';
  posthtml = posthtml
    + util.format('<div class="entry">')
    + util.format('<div class="entryTitle"><a href="%s"><h2>%s</h2></a></div>', post.link, post.title);
  if (post.author != null) {
    posthtml = posthtml
      + util.format('<div class="entryMeta">posted on %s by %s</div>', post.date, post.author)
  } else {
    posthtml = posthtml
      + util.format('<div class="entryMeta">posted on %s</div>', post.date);
  }
  posthtml = posthtml
    + util.format('<div class="entryDescription">%s</div>', post.description)
    + util.format('</div>');
  return posthtml;
}

function htmlSidebar(){
  var sidebarhtml = ''
      + '<div class="sidebar">'
      + 'Subscribe to planet: <a href="index.xml">RSS</a><br/>'
      + '<a href="https://github.com/asdofindia/planet">View code</a><br/>'
      + '<div class="sidebarLinks">Links:<br/>';
  feedList.forEach(function(feed) {
    sidebarhtml = sidebarhtml
      + util.format('<a href="%s">%s</a><br/>', feed.url, feed.title);
  });
  sidebarhtml = sidebarhtml
    + '</div> <!-- close sidebarLinks -->'
    + '</div>';
  return sidebarhtml;
}

function htmlFooter(){
  var htmlfooter = ''
      + '<footer class="footer">'
      + '<hr>That is all folks. Write some post, maybe</hr>'
      + '</footer>'
      + '</body>'
      + '</html>';
  return htmlfooter;
}

function readlist(list){
  var lineReader = readline.createInterface({
    input: fs.createReadStream(list)
  });

  lineReader.on('line', function(line){
    var feed = {}
    feed.url = line.split(' ', 1).pop();
    feed.title = line.split(' ').slice(1).join(' ');
    feedList.push(feed);
  });

  lineReader.on('close', function(){
    totalFeeds = feedList.length;
    // We can sort if we want, but it is better to sort manually
    // feedList = feedList.sort(function(a,b) {
    //  return a.title > b.title
    // });
    feedList.forEach(function(feed){
      fetch(feed.url)
    });
  });
}

readlist('list');
