(function () {
  function setupGalleryFilters() {
    var filterButtons = document.querySelectorAll("[data-gallery-filter]");
    var cards = document.querySelectorAll("[data-gallery-year]");
    var emptyState = document.querySelector(".gallery-empty");

    if (!filterButtons.length || !cards.length) {
      return;
    }

    filterButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        var selectedYear = button.getAttribute("data-gallery-filter");
        var visibleCount = 0;

        filterButtons.forEach(function (item) {
          item.classList.toggle("active", item === button);
        });

        cards.forEach(function (card) {
          var isVisible = selectedYear === "all" || card.getAttribute("data-gallery-year") === selectedYear;
          card.hidden = !isVisible;
          if (isVisible) {
            visibleCount += 1;
          }
        });

        if (emptyState) {
          emptyState.hidden = visibleCount > 0;
        }
      });
    });
  }

  function setupLightbox() {
    var links = Array.prototype.slice.call(document.querySelectorAll(".lightbox-image"));

    if (!links.length) {
      return;
    }

    var currentIndex = 0;
    var lightbox = document.createElement("div");
    lightbox.className = "gallery-lightbox";
    lightbox.setAttribute("role", "dialog");
    lightbox.setAttribute("aria-modal", "true");
    lightbox.setAttribute("aria-label", "Photo viewer");
    lightbox.innerHTML = [
      '<button class="gallery-lightbox-close" type="button" aria-label="Close photo viewer">&times;</button>',
      '<button class="gallery-lightbox-nav gallery-lightbox-prev" type="button" aria-label="Previous photo">&#8249;</button>',
      '<figure class="gallery-lightbox-frame">',
      '<img alt="">',
      '<figcaption></figcaption>',
      '</figure>',
      '<button class="gallery-lightbox-nav gallery-lightbox-next" type="button" aria-label="Next photo">&#8250;</button>'
    ].join("");

    document.body.appendChild(lightbox);

    var image = lightbox.querySelector("img");
    var caption = lightbox.querySelector("figcaption");
    var closeButton = lightbox.querySelector(".gallery-lightbox-close");
    var previousButton = lightbox.querySelector(".gallery-lightbox-prev");
    var nextButton = lightbox.querySelector(".gallery-lightbox-next");

    function showImage(index) {
      currentIndex = (index + links.length) % links.length;
      var activeLink = links[currentIndex];
      var title = activeLink.getAttribute("data-title") || activeLink.querySelector("img").alt || "";

      image.src = activeLink.href;
      image.alt = title;
      caption.textContent = title;
    }

    function openLightbox(index) {
      showImage(index);
      lightbox.classList.add("active");
      document.body.classList.add("gallery-lightbox-open");
      closeButton.focus();
    }

    function closeLightbox() {
      lightbox.classList.remove("active");
      document.body.classList.remove("gallery-lightbox-open");
      image.removeAttribute("src");
    }

    links.forEach(function (link, index) {
      link.addEventListener("click", function (event) {
        event.preventDefault();
        openLightbox(index);
      });
    });

    closeButton.addEventListener("click", closeLightbox);
    previousButton.addEventListener("click", function () {
      showImage(currentIndex - 1);
    });
    nextButton.addEventListener("click", function () {
      showImage(currentIndex + 1);
    });

    lightbox.addEventListener("click", function (event) {
      if (event.target === lightbox) {
        closeLightbox();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (!lightbox.classList.contains("active")) {
        return;
      }

      if (event.key === "Escape") {
        closeLightbox();
      } else if (event.key === "ArrowLeft") {
        showImage(currentIndex - 1);
      } else if (event.key === "ArrowRight") {
        showImage(currentIndex + 1);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    setupGalleryFilters();
    setupLightbox();
  });
})();
