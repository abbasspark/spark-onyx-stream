// SPDX-License-Identifier: AGPL-3.0-only
//
// Counts what the gateway itself sends to viewers, so the platform can say
// how much of the delivery the main server still carries.
//
// Nginx sends media files without telling anyone. Here every finished media
// request adds its bytes to a small table in shared memory, and the API reads
// that table now and then. The table starts empty when Nginx starts: "since"
// tells the API when, so it can tell a restart from a quiet hour.
import crypto from 'crypto';

var SUBJECT = 'gateway-stats';
var MIN_SECRET_LENGTH = 32;
var KINDS = ['video', 'live'];

function sameText(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  var difference = 0;
  for (var i = 0; i < a.length; i++) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return difference === 0;
}

/** Says whether a token of the form "<expiry>.<signature>" lets the API read the figures. */
function checkStatsToken(token, secret, nowSeconds) {
  if (
    typeof secret !== 'string' ||
    secret.length < MIN_SECRET_LENGTH ||
    typeof token !== 'string'
  ) {
    return false;
  }
  var separator = token.indexOf('.');
  if (separator <= 0) {
    return false;
  }
  var expiry = token.slice(0, separator);
  var signature = token.slice(separator + 1);
  if (!/^[0-9]{1,12}$/.test(expiry) || !/^[A-Za-z0-9_-]{43}$/.test(signature)) {
    return false;
  }
  var expected = crypto
    .createHmac('sha256', secret)
    .update(SUBJECT + ':' + expiry)
    .digest('base64url');
  return sameText(signature, expected) && Number(expiry) > nowSeconds;
}

/**
 * Value of $onyx_counted, which stands at the end of the log format. Nginx
 * works it out while it writes the log line, when what was sent is known.
 * It adds nothing to the line.
 */
function count(r) {
  var kind = r.variables.onyx_delivery_kind;
  if (kind && (r.status === 200 || r.status === 206)) {
    var table = ngx.shared.onyx_delivery;
    table.add('since', Date.now());
    table.incr(kind + ':bytes', Number(r.variables.body_bytes_sent) || 0, 0);
    table.incr(kind + ':requests', 1, 0);
  }
  return '';
}

/** GET /internal/delivery-stats: what was counted since Nginx started. */
function stats(r) {
  var header = r.headersIn.Authorization || '';
  var token = header.indexOf('Bearer ') === 0 ? header.slice(7) : '';
  if (!checkStatsToken(token, process.env.PLAYBACK_SIGNING_SECRET, Math.floor(Date.now() / 1000))) {
    r.return(404);
    return;
  }
  var table = ngx.shared.onyx_delivery;
  table.add('since', Date.now());
  var body = { since: table.get('since') };
  KINDS.forEach(function (kind) {
    body[kind] = {
      bytes: table.get(kind + ':bytes') || 0,
      requests: table.get(kind + ':requests') || 0,
    };
  });
  r.headersOut['Content-Type'] = 'application/json';
  r.headersOut['Cache-Control'] = 'no-store';
  r.return(200, JSON.stringify(body));
}

export default { checkStatsToken, count, stats };
