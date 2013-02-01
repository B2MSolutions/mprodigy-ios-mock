var ios = require('../lib/ios.js');

describe('with valid config', function() { 
  var config = JSON.parse(process.env.IOS_MOCK_CONFIG);
  this.timeout(200000);

  it('calling commission should not throw', function(done) {
    ios.commission(config, done);
  })
});