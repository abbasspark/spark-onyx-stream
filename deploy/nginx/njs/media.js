// SPDX-License-Identifier: AGPL-3.0-only
//
// Checks playback tokens inside Nginx, so media files are served without
// asking the API. It must accept exactly the tokens the API creates. See
// apps/api/src/playback/playback-token.ts for the format:
//
//   <expiry>.<signature>
//   expiry     Unix time in seconds after which the token is refused
//   signature  HMAC-SHA256 over "<assetId>:<expiry>", in base64url
//
// The file runs in njs and is also loaded by a unit test in Node, so it only
// uses what both have in common.
import crypto from 'crypto';

var ASSET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
var EXPIRY = /^[0-9]{1,12}$/;
var SIGNATURE = /^[A-Za-z0-9_-]{43}$/;
var MIN_SECRET_LENGTH = 32;

/** Compares two strings of equal length without stopping at the first difference. */
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

/**
 * Says whether a token opens the files of an asset right now.
 * A missing or short secret refuses everything, so a configuration mistake
 * never opens the files to everyone.
 */
function checkToken(assetId, token, secret, nowSeconds) {
  if (typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH) {
    return false;
  }
  if (typeof assetId !== 'string' || typeof token !== 'string' || !ASSET_ID.test(assetId)) {
    return false;
  }

  var separator = token.indexOf('.');
  if (separator <= 0) {
    return false;
  }
  var expiry = token.slice(0, separator);
  var signature = token.slice(separator + 1);
  if (!EXPIRY.test(expiry) || !SIGNATURE.test(signature)) {
    return false;
  }

  var expected = crypto
    .createHmac('sha256', secret)
    .update(assetId + ':' + expiry)
    .digest('base64url');
  if (!sameText(signature, expected)) {
    return false;
  }
  return Number(expiry) > nowSeconds;
}

/** Value of the Nginx variable $onyx_media_ok: "1" for a valid token, otherwise "0". */
function verify(r) {
  var valid = checkToken(
    r.variables.onyx_asset_id,
    r.variables.onyx_token,
    process.env.PLAYBACK_SIGNING_SECRET,
    Math.floor(Date.now() / 1000),
  );
  return valid ? '1' : '0';
}

export default { checkToken, verify };
