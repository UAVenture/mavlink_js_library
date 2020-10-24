#!/bin/bash

cat mavlink.js \
 | sed 's/this\.id = /this._id = /g' \
 | sed 's/mavlink.header(this.id/mavlink.header(this._id/' \
 | sed "s/'BBBBBB', \[253,/'BBBBBB', [254,/" \
 | sed 's/this\.payload =/this._payload =/g' \
 | sed 's/this\.payload\./this._payload./g' \
 | sed 's/this\.payload\[plen-1\]/this._payload[plen-1]/g' \
 | sed 's/concat(this\.payload/concat(this._payload/g' \
 | sed 's/m\.payload/m._payload/g' \
 | sed "s/'<fHH16sB'/'<4BHH16sB'/g" \
 | sed "s/'<fBB16sB'/'<4BBB16sB'/g" \
 > mavlink.patched.js
