var url     = require("url");
var http    = require("http");
var dgram   = require("dgram");

// some const strings - dont change
const SSDP_PORT = 1900;
const BROADCAST_ADDR = "239.255.255.250";
const ST    = "urn:schemas-upnp-org:device:InternetGatewayDevice:1";      
const req   = "M-SEARCH * HTTP/1.1\r\nHost:"+BROADCAST_ADDR+":"+SSDP_PORT+"\r\nST:"+ST+"\r\nMan:\"ssdp:discover\"\r\nMX:3\r\n\r\n";
const WANIP = "urn:schemas-upnp-org:service:WANIPConnection:1";
const OK    = "HTTP/1.1 200 OK";
const SOAP_ENV_PRE = "<?xml version=\"1.0\"?>\n<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\"><s:Body>";
const SOAP_ENV_POST = "</s:Body></s:Envelope>";

function searchGateway(timeout, callback) {
  
  var self    = this;
  var reqbuf  = new Buffer(req, "ascii");
  var socket  = new dgram.Socket("udp4");
  var clients = {};
  var t;
  
  if (timeout) {
    t = setTimeout(function() { 
      onerror(new Error("searchGateway() timed out"));
    }, timeout);
  }
  
  var onlistening = function() {
  
    process.binding('net').setBroadcast(socket.fd, true);
    // send a few packets just in case.
    for (var i = 0; i < 4; i++)
      socket.send(reqbuf, 0, reqbuf.length, SSDP_PORT, BROADCAST_ADDR);

  }
  
  var onmessage = function(message, rinfo) {
  
    message = message.toString();
    
    if (message.substr(0, OK.length) !== OK || 
       message.indexOf(ST) === -1 ||
       message.toLowerCase().indexOf("location:") === -1) return;
       
       
    console.error(message);
    
    
    var l = url.parse(message.match(/location:(.+?)\r\n/i)[1].trim());
    l.port = l.port || (l.protocol == "https:" ? 443:80);
    if (clients[l.href]) return;
    
    
    //console.error(l);
    
    
    var client = clients[l.href] = http.createClient(l.port, l.hostname);
    var request = client.request("GET", l.pathname, {
      "Host": l.hostname
    });
    request.addListener('response', function (response) {
      if (response.statusCode !== 200) {
        socket.emit(new Error("Unexpected response status code: " + response.statusCode));
      }
      var resbuf = "";
      response.setEncoding("utf8");
      response.addListener('data', function (chunk) { resbuf += chunk });
      response.addListener("end", function() {
        resbuf = resbuf.substr(resbuf.indexOf(WANIP) + WANIP.length);
        var ipurl = resbuf.match(/<controlURL>(.+?)<\/controlURL>/i)[1].trim()
        socket.close();
        clearTimeout(t);
        var controlUrl = url.parse(ipurl);
        controlUrl.__proto__ = l;
        console.log(controlUrl);
        callback(null, new Gateway(controlUrl.port, controlUrl.hostname, controlUrl.pathname));
      });
    });
    request.end();
  }
  
  var onerror = function(err) {
    socket.close() ;
    clearTimeout(t);
    callback(err);
  }
  
  var onclose = function() {
    socket.removeListener("listening", onlistening);
    socket.removeListener("message", onmessage);
    socket.removeListener("close", onclose);
    socket.removeListener("error", onerror);
  }
  
  socket.addListener("listening", onlistening);
  socket.addListener("message", onmessage);
  socket.addListener("close", onclose);
  socket.addListener("error", onerror);
  
  socket.bind(SSDP_PORT);
  
}
exports.searchGateway = searchGateway;

function Gateway(port, host, path) {
  this.port = port;
  this.host = host;
  this.path = path;
}

// Retrieves the values of the current connection type and allowable connection types.
Gateway.prototype.GetConnectionTypeInfo = function(callback) {
  this._getSOAPResponse(
    "<u:GetConnectionTypeInfo xmlns:u=\"" + WANIP + "\">\
    </u:GetConnectionTypeInfo>",
    "GetConnectionTypeInfo",
    function(err, response) {
      if (err) return callback(err);
      var rtn = {};
      try {
        rtn['NewConnectionType'] = this._getArgFromXml(response.body, "NewConnectionType", true);
        rtn['NewPossibleConnectionTypes'] = this._getArgFromXml(response.body, "NewPossibleConnectionTypes", true);
      } catch(e) {
        return callback(e);
      }
      callback.apply(null, this._objToArgs(rtn));
    }
  );
}

Gateway.prototype.GetExternalIPAddress = function(callback) {
  this._getSOAPResponse(
    "<u:GetExternalIPAddress xmlns:u=\"" + WANIP + "\">\
    </u:GetExternalIPAddress>",
    "GetExternalIPAddress",
    function(err, response) {
      if (err) return callback(err);
      var rtn = {};
      try {
        rtn['NewExternalIPAddress'] = this._getArgFromXml(response.body, "NewExternalIPAddress", true);
      } catch(e) {
        return callback(e);
      }
      callback.apply(null, this._objToArgs(rtn));
      /*callback.apply(null, this._objToArgs({
        "NewExternalIPAddress": response.body.match(/<NewExternalIPAddress>(.+?)<\/NewExternalIPAddress>/i)[1]
      }));*/
    }
  );
}

Gateway.prototype.AddPortMapping = function(protocol, extPort, intPort, host, description, callback) {
  this._getSOAPResponse(
    "<u:AddPortMapping \
    xmlns:u=\""+WANIP+"\">\
    <NewRemoteHost></NewRemoteHost>\
    <NewExternalPort>"+extPort+"</NewExternalPort>\
    <NewProtocol>"+protocol+"</NewProtocol>\
    <NewInternalPort>"+intPort+"</NewInternalPort>\
    <NewInternalClient>"+host+"</NewInternalClient>\
    <NewEnabled>1</NewEnabled>\
    <NewPortMappingDescription>"+description+"</NewPortMappingDescription>\
    <NewLeaseDuration>0</NewLeaseDuration>\
    </u:AddPortMapping>",
    "AddPortMapping",
    function(err, response) {
      if (err) return callback(err);
    }
  );
}

Gateway.prototype._getSOAPResponse = function(soap, func, callback) {
  var self = this;
  var s = new Buffer(SOAP_ENV_PRE+soap+SOAP_ENV_POST, "utf8");
  var client = http.createClient(this.port, this.host);
  var request = client.request("POST", this.path, {
    "Host"           : this.host + (this.port != 80 ? ":" + this.port : ""),
    "SOAPACTION"     : '"' + WANIP + '#' + func + '"',
    "Content-Type"   : "text/xml",
    "Content-Length" : s.length
  });
  request.addListener('error', function(error) {
    callback.call(self, error);
  });
  request.addListener('response', function(response) {
    if (response.statusCode === 402) {
      return callback.call(self, new Error("Invalid Args"));
    } else if (response.statusCode === 501) {
      return callback.call(self, new Error("Action Failed"));      
    }
    response.body = "";
    response.setEncoding("utf8");
    response.addListener('data', function(chunk) { response.body += chunk });
    response.addListener('end', function() {
      callback.call(self, null, response);
    });
  });
  request.end(s);
}

// Formats an Object of named arguments, and returns an Array of return
// values that can be used with "callback.apply()".
Gateway.prototype._objToArgs = function(obj) {
  var wrapper;
  var rtn = [null];
  for (var i in obj) {
    if (!wrapper) {
      wrapper = new (obj[i].constructor)(obj[i]);
      wrapper[i] = obj[i];
      rtn.push(wrapper);
    } else {
      wrapper[i] = obj[i];
      rtn.push(obj[i]);
    }
  }
  return rtn;
}

Gateway.prototype._getArgFromXml = function(xml, arg, required) {
  var match = xml.match(new RegExp("<"+arg+">(.+?)<\/"+arg+">"));
  if (match) {
    return match[1];
  } else if (required) {
    throw new Error("Invalid XML: Argument '"+arg+"' not given.");
  }
}
