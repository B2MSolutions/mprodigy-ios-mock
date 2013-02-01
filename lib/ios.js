var async = require('async'),
    cheerio = require('cheerio'),
    request = require('request');

var ios = { };

ios.welcome = function(config, done) {    
  console.log('accessing welcome screen');
  var loginUrl = config.rootUrl + '/mprodigy/enrol/ota/' + config.group + '/'+ config.devicetype + '/welcome';
  request.post(loginUrl, { form: config }, done );
}

ios.parseWelcomeScreen = function(content, done) {
  console.log('parsing welcome screen');
  var html = cheerio.load(content);
  var details = {
    installitemuri : html('#installitemuri').attr('href'), 
    enroluri : html('#enroluri').attr('href'), 
  };

  done(null, details);
}

ios.commission = function(config, done) {
  async.waterfall([
    function(cb){
      return ios.welcome(config, cb);
    },
    function(response, content, cb) {
      return ios.parseWelcomeScreen(content, cb);
    },
    function(details, cb) {
      console.log(details);
      return cb();
    },    
  ], done);
}


module.exports = ios;