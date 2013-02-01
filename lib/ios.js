var async = require('async'),
    crypto = require('crypto'),
    cheerio = require('cheerio'),
    exec = require('child_process').exec,
    fs = require('fs'),
    request = require('request'),
    uuid = require('node-uuid');

var ios = { };

ios.welcome = function(config, done) {    
  console.log('accessing welcome screen');
  var loginUrl = config.rootUrl + '/mprodigy/enrol/ota/' + config.group + '/'+ config.devicetype + '/welcome';
  request.post(loginUrl, { form: config }, done );
};

ios.parseWelcomeScreen = function(content, done) {
  console.log('parsing welcome screen');
  var html = cheerio.load(content);
  var details = {
    rootCAUrl : html('#installitemuri').attr('href'), 
    enrolUrl : html('#enroluri').attr('href'), 
  };

  if(!details.rootCAUrl) {
    return done('missing #installitemuri');
  }

  if(!details.enrolUrl) {
    return done('missing #enroluri');
  }

  done(null, details);
};

ios.verifyRootCA = function(details, done) {
  console.log('verifying root ca:' + details.rootCAUrl);
  request.get(details.rootCAUrl, function(e, response, data) {
    if(e) {
      return done(e);
    }
    if(response.statusCode != 200) {
      return done('bad status code' + response.statusCode);
    }

    if(!data) {
      return done('missing certificate');
    }

    return done(null, details);
  });  
};

ios.downloadProfilePayload = function(details, done) {
  console.log('verifying enrol url:' + details.enrolUrl);
  request.get(details.enrolUrl, { encoding: null }, function(e, response, data) {
  
    if(e) {
      return done(e);
    }
    if(response.statusCode != 200) {
      return done('bad status code' + response.statusCode);
    }

    if(!data) {
      return done('missing enrol data');
    }

    var filename = '/home/developer/Downloads/out2.p7s';// + uuid.v4();
    fs.writeFileSync(filename, data, 'binary');

    return done(null, filename);
  }); 
}

ios.extractProfilePayload = function(filename, done) {
  console.log('extracting ' + filename);
  var output = filename + '.payload';
  var command = 'openssl cms -in ' + filename + ' -inform der -noverify -verify -out ' + output;
  console.log(command);
  exec(command, function (e, stdin, stdout) {
    if(e) {
      console.error(stdout);
      return done(e);
    }

    fs.unlinkSync(filename);
    done(null, output);  
  });  
};

ios.commission = function(config, done) {
  async.waterfall([
    function(cb){
      return ios.welcome(config, cb);
    },
    function(response, content, cb) {
      return ios.parseWelcomeScreen(content, cb);
    },
    function(details, cb) {
      ios.verifyRootCA(details, cb);
    }, 
    function(details, cb) {
      ios.downloadProfilePayload(details, cb);
    }, 
    function(filename, cb) {
      ios.extractProfilePayload(filename, cb);
    },  
    function(filename, cb) {
      console.log(filename);
      cb();
    },
  ], done);
};

module.exports = ios;