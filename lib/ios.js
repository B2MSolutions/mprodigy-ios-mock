var async = require('async'),
    crypto = require('crypto'),
    cheerio = require('cheerio'),
    exec = require('child_process').exec,
    fs = require('fs'),
    plist = require('plist'),
    request = require('request'),
    uuid = require('node-uuid');

var ios = { };

ios.extractPlist = function(data, done) {

  var filename = './' + uuid.v4() + '.p7s';
  fs.writeFileSync(filename, data, 'binary');
  var output = filename + '.plist';
  var command = 'openssl cms -in ' + filename + ' -inform der -noverify -verify -out ' + output;
  console.log(command);
  exec(command, function (e, stdin, stdout) {
    if(e) {
      console.error(stdout);
      return done(e);
    }

    fs.unlinkSync(filename);
    var payload = plist.parseFileSync(output);
    fs.unlinkSync(output);

    done(null, payload);  
  }); 

};

ios.signPlist = function(content, done) {
  var filename = './' + uuid.v4() + '.payload';
  fs.writeFileSync(filename, plist.build(content));

  var outfile = filename + '.p7s';
  var command = 'openssl smime -sign -in ' + filename + ' -out ' + outfile + ' -signer keys/apple.crt -inkey keys/apple.key -outform der -nodetach';
  console.log(command);
  exec(command, function (e, stdin, stdout) {
    if(e) {
      console.error(stdout);
      return done(e);
    }

    fs.unlinkSync(filename);
    return done(null, outfile);  
  });  
};

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
  console.log('downloading profile payload:' + details.enrolUrl);
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

    return ios.extractPlist(data, done);
  }); 
}

ios.createPayloadResponse = function(payload, done) {
  console.log('creating payload response: ' + JSON.stringify(payload));

  var url = payload.PayloadContent.URL;
  ios.UDID = uuid.v4();

  var response = {
    UDID: ios.UDID,
    PRODUCT: 'IPHONE',
    CHALLENGE: payload.PayloadContent.Challenge
  };

  ios.signPlist(response, function(e, filename) {
    return done(e, filename, url);
  });
};

ios.sendPayloadResponse = function(filename, url, done) {
  console.log('sending payload response: ');
  fs.createReadStream(filename).pipe(request.post(url, { encoding: null }, function(e, r, d) {
    fs.unlinkSync(filename);
    return done(e, r, d);
  }));
};

ios.extractSCEPPayload = function(response, data, done) {
  console.log('handle scep payload: ');
  if(response.statusCode != 200) {
    return done('bad status code' + response.statusCode);
  }

  ios.extractPlist(data, function(e, scepPayload) {
    if(e) {
      return done(e);
    }

    return done(null, scepPayload);
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
    function(payload, cb) {
      ios.createPayloadResponse(payload, cb);
    },
    function(filename, url, cb) {
      ios.sendPayloadResponse(filename, url, cb);
    },
    function(response, data, cb) {
      ios.extractSCEPPayload(response, data, cb);
    },
    function(scepPayload, cb) {
      console.log(scepPayload);
      cb();
    },
  ], done);
};

module.exports = ios;