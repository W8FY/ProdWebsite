(function () {
  var form = document.getElementById("membershipApplicationForm");
  var status = document.getElementById("membershipApplicationStatus");
  var captchaContainer = document.getElementById("turnstileContainer");
  var widgetId = null;

  if (!form) {
    return;
  }

  function setStatus(message, type) {
    status.textContent = message;
    status.className = "application-status " + (type || "");
  }

  function resetCaptcha() {
    if (window.turnstile && widgetId !== null) {
      window.turnstile.reset(widgetId);
    }
  }

  function renderCaptcha() {
    var siteKey = form.getAttribute("data-turnstile-site-key");
    if (!siteKey || !captchaContainer || !window.turnstile) {
      return;
    }

    widgetId = window.turnstile.render(captchaContainer, {
      sitekey: siteKey
    });
  }

  function firstError(payload) {
    if (payload.error) {
      return payload.error;
    }

    if (payload.errors) {
      var keys = Object.keys(payload.errors);
      if (keys.length) {
        var fieldError = payload.errors[keys[0]][0];
        return fieldError.message || fieldError;
      }
    }

    return "The application could not be submitted. Please check the form and try again.";
  }

  window.addEventListener("load", renderCaptcha);

  form.addEventListener("submit", function (event) {
    event.preventDefault();

    var apiUrl = form.getAttribute("data-api-url");
    var submitButton = form.querySelector("button[type='submit']");

    if (!apiUrl) {
      setStatus("Membership application API is not configured yet.", "error");
      return;
    }

    submitButton.disabled = true;
    setStatus("Submitting application...", "");

    fetch(apiUrl, {
      method: "POST",
      body: new FormData(form)
    })
      .then(function (response) {
        return response.json().then(function (payload) {
          if (!response.ok || !payload.ok) {
            throw payload;
          }
          return payload;
        });
      })
      .then(function () {
        form.reset();
        resetCaptcha();
        setStatus("Application received. Please continue to the roster page to pay dues.", "success");
      })
      .catch(function (payload) {
        resetCaptcha();
        setStatus(firstError(payload), "error");
      })
      .finally(function () {
        submitButton.disabled = false;
      });
  });
})();
