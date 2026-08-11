(function () {
  "use strict";

  // -------------------------------------------------------------------------
  // SUPABASE PUBLIC BROWSER CONFIGURATION
  // -------------------------------------------------------------------------
  // Replace only these placeholders with values from the Supabase project's
  // Connect dialog or Settings > API page. A Project URL and public
  // anon/publishable key are designed to be used in a browser when RLS is on.
  // NEVER place a service_role key or any other private key in this file.
  // -------------------------------------------------------------------------
  var runtimeConfig = window.W8FY_SUPABASE_CONFIG || {};
  var SUPABASE_URL = runtimeConfig.url || "https://etkhrvhuoaezilnnullu.supabase.co";
  var SUPABASE_ANON_KEY = runtimeConfig.anonKey || "sb_publishable_i4sBm4QRzIsVAia9xfmgrQ_hYf6QmRH";

  function hasRealValue(value, placeholder) {
    return typeof value === "string" && value.trim() !== "" && value !== placeholder;
  }

  var configured = hasRealValue(SUPABASE_URL, "YOUR_SUPABASE_URL")
    && hasRealValue(SUPABASE_ANON_KEY, "YOUR_SUPABASE_ANON_KEY");
  var client = null;

  if (configured && window.supabase && typeof window.supabase.createClient === "function") {
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      }
    });
  }

  window.W8FYSupabase = {
    isConfigured: function () {
      return configured;
    },
    getClient: function () {
      return client;
    }
  };
}());
