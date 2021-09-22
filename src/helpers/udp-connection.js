'use strict';
var events = require("events");
var util = require("util");
var dgram = require('dgram');
var loggingBase = require('../lib/logging-base.js')

var UdpConnection = function(localAddr, localPort, client) {
    var self = this;

    self.logger = new loggingBase.LoggingFactory().getLogger();

    self.config = {
        localPort: localPort,
        localAddr: localAddr,
        remotePort: undefined,
        remoteAddr: undefined
    };

    self.socket = dgram.createSocket('udp4');

    if (!client) {
        self.socket.bind(self.config.localPort, function(){
            self.logger.info(util.format("Bound local interface %s:%s", self.config.localAddr, self.config.localPort));
        });

    } else {
        self.config.remotePort = localPort;
        self.config.remoteAddr = localAddr;
    }

    self.socket.on("message", function(data, remote){
        self.emit("data", data);

        if (self.config.remoteAddr != remote.address || self.config.remoteAddr != remote.address) {
            self.logger.info(util.format("Switching to remote %s:%d", remote.address, remote.port));

            self.config.remotePort = remote.port;
            self.config.remoteAddr = remote.address;
        }
    });
}

UdpConnection.prototype.send = function(buffer){
    var self = this;

    if (self.socket && self.config.remoteAddr) {
        self.socket.send(buffer, 0, buffer.length
            , self.config.remotePort, self.config.remoteAddr);
    }
};

util.inherits(UdpConnection, events.EventEmitter);

module.exports.UdpConnection = UdpConnection;
