'use strict';

// Compatibility path retained for deployments that reference the old utility
// location. The command loader scans categories alphabetically, so exporting
// the same implementation prevents this file from overriding the persistent
// admin command with an in-memory toggle.
module.exports = require('../admin/stickerreact');
