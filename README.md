# MAVLink Library Wrapper

This is a small MAVLink JS library wrapper that provides a more streamlined access to it, patches the original MAVLink library to prevent certain bugs and also adds tests for some particularly touchy functions.

## General Usage

### For most Integrations (Broker)

```javascript
var mavjs = require('mavlink-js');

// Prepare your connection stream (serial, UDP, etc.):
const systemConn = new mavjs.UdpConnection("0.0.0.0", 14550);

// Get broker object
const broker = new mavjs.MavlinkSystemBroker(systemConn);

// Access all available systems
let systems = broker.getSystems();

systems.forEach((system, index) => {
    console.log(`Got system ${system.sysId}`);
});

// OR: Get notified when a system connects
broker.on('newSystem', function(system) {
    console.log(`Got system ${system.sysId}`);
});

// OR: Get the universal system to access all data if you don't worry about multiple different systems
system = broker.getUniversalSystem();
console.log(`Got universal system ${system.sysId}`); // is ID 0

```

### For Low Level Handling (Direct)

```javascript
var mavjs = require('mavlink-js');

// Prepare your connection stream (serial, UDP, etc.):
var connection = mavjs.SerialConnection("/dev/tty.usbmodem01", 57600);

// The connection needs to define a "send" function to allow writing of data to the connection
// and emit a "data" event when receiving data.
// mavlink-js provides 2 simple implementations: mavjs.SerialConnection and mavjs.UdpConnection

// Create the Mavlink wrapper object providing at least:
// system ID, component ID, send data callback
var mavlib = new mavjs.MavlinkLib(255, 0, (buffer) => {
    connection.send(buffer);
});

// Forward data for parsing when it comes in:
connection.on('data', function(data) {
	mavlib.parseData(data);
});

// Receive successfully parsed messages:
mavlib.on('message', function(msg) {
	console.log(msg);
});

// Receive specific successfully parsed messages:
mavlib.on('HEARTBEAT', function(msg) {
	console.log(msg);
});

// Send a message:
var msg = new mavjs.messages.heartbeat(
    mavjs.mavlink.MAV_TYPE_GCS, // type
    mavjs.mavlink.MAV_AUTOPILOT_INVALID, // autopilot
    0, // base mode
    0, // custom mode
    mavjs.mavlink.MAV_STATE_ACTIVE, // system status
    mavjs.mavlink.WIRE_PROTOCOL_VERSION
);

mavlib.sendMessage(msg);
```

## MAVLink Parameter Helpers

```javascript
var mavlib = mavjs.MavlnkLib(...);

// Read parameter value from received MAVLink message
var value = mavlib.readParamValue(msg);

// Create int param_set message
var msg = mavlib.createParamSetMessage("MAV_TEST_PAR", 123, false);

// Create float param_set message
var msg = mavlib.createParamSetMessage("MAV_HUD_FREQ", 5.354, true);
````

## Update from MAVLink Definitions

```sh
# Generate from definitions:
cd mavlink
./pymavlink/tools/mavgen.py --lang JavaScript_Stable --wire-protocol 2.0 -o ../mavlink_js_library_v2_private/src/mavlink/mavlink.js message_definitions/v1.0/standard.xml
cd ../mavlink_js_library_v2_private

# Execute patch script and run tests:
npm test

# If tests were successful commit update:
git commit -a
git push
```
