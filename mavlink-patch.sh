#!/bin/bash

set -e

# Rename the message prototype id field because some messages are using it as a payload field.
# Affects all messages and should therefore be done with sed.
# Following patches depend on this change.
cat mavlink.js \
 | sed 's/this\.id = /this._id = /g' \
 | sed 's/mavlink.header(this.id/mavlink.header(this._id/' \
 > mavlink.patched.js

patch mavlink.patched.js patches/01-payload-field.patch
patch mavlink.patched.js patches/02-header-magic.patch
patch mavlink.patched.js patches/03-param-struct.patch
patch mavlink.patched.js patches/04-unpack.patch
patch mavlink.patched.js patches/05-version-auto-sense.patch
patch mavlink.patched.js patches/06-unpack-ext-fix.patch
