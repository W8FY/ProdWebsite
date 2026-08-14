(function () {
  "use strict";

  var menuToggle = document.querySelector(".site-menu-toggle");
  var menu = document.getElementById("site-menu");
  var dropdownToggle = document.querySelector(".site-menu-dropdown-toggle");
  var dropdown = document.querySelector(".site-menu-dropdown");

  if (!menuToggle || !menu || !dropdownToggle || !dropdown) {
    return;
  }

  function setMenu(open) {
    menu.classList.toggle("open", open);
    menuToggle.setAttribute("aria-expanded", String(open));
  }

  function setDropdown(open) {
    dropdown.classList.toggle("open", open);
    dropdownToggle.setAttribute("aria-expanded", String(open));
  }

  menuToggle.addEventListener("click", function () {
    setMenu(menuToggle.getAttribute("aria-expanded") !== "true");
  });

  dropdownToggle.addEventListener("click", function () {
    setDropdown(dropdownToggle.getAttribute("aria-expanded") !== "true");
  });

  document.addEventListener("click", function (event) {
    if (!dropdown.contains(event.target)) {
      setDropdown(false);
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      setDropdown(false);
      if (window.innerWidth < 992) {
        setMenu(false);
        menuToggle.focus();
      } else {
        dropdownToggle.focus();
      }
    }
  });

  window.addEventListener("resize", function () {
    if (window.innerWidth >= 992) {
      setMenu(false);
    }
  });
}());
