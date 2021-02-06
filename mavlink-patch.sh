#!/bin/bash

cp mavlink.js temp.js

# Rename the message prototype id field because some messages are using it as a payload field
cat temp.js \
 | sed 's/this\.id = /this._id = /g' \
 | sed 's/mavlink.header(this.id/mavlink.header(this._id/' \
 > mavlink.patched.js

cp mavlink.patched.js temp.js

# Set correct magic value for MAVLink 1 header
cat temp.js \
 | sed "s/'BBBBBB', \[253,/'BBBBBB', [254,/" \
 > mavlink.patched.js

cp mavlink.patched.js temp.js

# Rename the message prototype payload field because some messages are using it as a payload field
cat temp.js \
 | sed 's/this\.payload =/this._payload =/g' \
 | sed 's/this\.payload\./this._payload./g' \
 | sed 's/this\.payload\[plen-1\]/this._payload[plen-1]/g' \
 | sed 's/concat(this\.payload/concat(this._payload/g' \
 | sed 's/m\.payload/m._payload/g' \
 > mavlink.patched.js

cp mavlink.patched.js temp.js

# Change value field from param structs to a byte array (4B),
# otherwise JS converts values that are invalid floats into NaN before we can read them.
cat temp.js \
 | sed "s/'<fHH16sB'/'<4BHH16sB'/g" \
 | sed "s/'<fBB16sB'/'<4BBB16sB'/g" \
 > mavlink.patched.js

cp mavlink.patched.js temp.js

# Allow unpack to ignore missing (extended) fields at the end for MAVLink 2
cat temp.js \
 | sed "s/jspack.Unpack(decoder.format, payload);/jspack.Unpack(decoder.format, payload, true);/g" \
 > mavlink.patched.js
