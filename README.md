# MAVLink Library Wrapper

This is a small MAVLink JS library wrapper that provides a more streamlined access to it, patches the original MAVLink library to prevent certain bugs and also adds tests for some particularly touchy functions.

## General Usage

```javascript
var lib = require('mavlink-lib.js');

// Prepare your connection stream (serial, UDP, etc.):
var connection = ...;

// Create callback function to send buffered data out:
var sendData = function(buffer) {
	connection.send(buffer);
}

// Create the Mavlink wrapper object providing at least:
// system ID, component ID, send data callback
var mav = new lib.MavlinkLib(255, 0, sendData);

// Forward data for parsing when it comes in:
connection.on('message', function(data) {
	mav.parseData(data);
})

// Receive successfully parsed messages:
mav.on('message', function(msg) {
	console.log(msg);
});

// Receive specific successfully parsed messages:
mav.on('HEARTBEAT', function(msg) {
	console.log(msg);
});

// Send a message:
var msg = new lib.messages.heartbeat(
    lib.mavlink.MAV_TYPE_GCS, // type
    lib.mavlink.MAV_AUTOPILOT_INVALID, // autopilot
    0, // base mode
    0, // custom mode
    lib.mavlink.MAV_STATE_ACTIVE, // system status
    lib.mavlink.WIRE_PROTOCOL_VERSION
);

mav.sendMessage(msg);
```

## MAVLink Parameter Helpers

```javascript
var mav = lib.MavlnkLib(...);

// Read parameter value from received MAVLink message
var value = mav.readParamValue(msg);

// Create int param_set message
var msg = mav.createParamSetMessage("MAV_TEST_PAR", 123, false);

// Create float param_set message
var msg = mav.createParamSetMessage("MAV_HUD_FREQ", 5.354, true);
````

## Update from MAVLink Definitions

```
# Generate from definitions:
cd mavlink
./pymavlink/tools/mavgen.py --lang JavaScript --wire-protocol 2.0 -o ../mavlink_js_library_v2_private/mavlink.js message_definitions/v1.0/common.xml
cd ../mavlink_js_library_v2_private

# Execute patch script and run tests:
npm test

# If tests were successful commit update:
git commit -a
git push
```
