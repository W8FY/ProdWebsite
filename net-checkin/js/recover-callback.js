/* Remove OAuth's one-use authorization code before loading anything else.
 * No Google access token or administrator session is ever placed in a URL.
 */
(function () {
  "use strict";
  var query = new URLSearchParams(window.location.search);
  window.W8FY_ADMIN_CALLBACK = {code: query.get("code"), state: query.get("state"), error: query.get("error")};
  if (window.location.search) window.history.replaceState(null, "", window.location.pathname);
}());
