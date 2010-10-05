node-upnp-client
================
### [UPnP][] "Control Point" Library for [NodeJS][].

A module for NodeJS written in JavaScript to interface with UPnP compliant devices.

The entire range of UPnP devices aims to be supported through contributors.
Currently implemented specifications are:

  - InternetGatewayDevice:1
    - WANDevice:1
      - WANIPConnection:1

Usage
-----

This module is still ___alpha___ quality, and it's API is a work-in-progress and subject
to change!

#### Discovery

Discovering UPnP compliant devices on the network is usually the first step in anything
UPnP-related:

    var upnp = require("upnp");

    var controlPoint = new upnp.ControlPoint();
    controlPoint.on("deviceAdded", function(err, device) {
      console.log(device.deviceType);
        //-> "urn:schemas-upnp-org:device:InternetGatewayDevice:1"
      console.log(device.location);
        //-> "http://192.168.0.1/root.sxml"
    });

#### Description

Once a device is "discovered", there's still not very much known about the device other
than it's _root_ device type. The `loadDescription` function needs to be called on a
"device" object to determine which services, child devices, events, etc. the device
implements. The `prototype` of the device object gets extended to reflect the parsed
description of the device:

    device.loadDescription(function(err) {
      console.log(device);
      // 'device' is now populated with a lot more properties
    });

#### Control

Invoking the services that a device exposes is probably your primary concern with
interacting with a UPnP device. `GetExternalIPAddress` is an example of an _action_
exposed from a _WANIPConnection_ service:

    device.GetExternalIPAddress(function(err, ip) {
      console.log(ip);
        //-> "1.1.1.1"
    });

#### Event Notification

Individual device "service"s often emit their own events when certain properties
of the device change. Use the `notification` event of Device or Service
instances to invoke a callback whenever a notification is emitter from the device:

    device.on("notification", function(properties) {
      for (var i in properties) {
        console.log(i + ": " + properties[i]);
      }
    });


[UPnP]: http://upnp.org/
[NodeJS]: http://nodejs.org
[WikipediaUPnP]: http://wikipedia.org/wiki/Universal_Plug_and_Play
