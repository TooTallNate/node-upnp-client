var upnp = require('../lib/upnp');
var util = require('util');
var log = function(event) {
  return function(device) {
    console.log('UPNP Event %s: %s, %s', event, device.nt || device.st, device.usn);
  };
};

cp = new upnp.ControlPoint();
cp.on('DeviceAvailable', log('DeviceAvailable'));
cp.on('DeviceUpdated', log('DeviceUpdated'));
cp.on('DeviceUnavailable', log('DeviceUnavailable'));
cp.on('DeviceFound', log('DeviceFound'));
cp.search();