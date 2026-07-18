(() => {
  const menuButton = document.getElementById('homeMenuButton');
  const mobileMenu = document.getElementById('homeMobileMenu');
  const slides = [...document.querySelectorAll('[data-home-slide]')];
  const controls = [...document.querySelectorAll('[data-home-slide-control]')];
  const carousel = document.querySelector('[data-home-carousel]');
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let activeSlide = 0;
  let slideTimer = null;

  if (menuButton && mobileMenu) {
    const closeMenu = () => {
      mobileMenu.hidden = true;
      menuButton.setAttribute('aria-expanded', 'false');
    };

    menuButton.addEventListener('click', () => {
      const willOpen = mobileMenu.hidden;
      mobileMenu.hidden = !willOpen;
      menuButton.setAttribute('aria-expanded', String(willOpen));
    });

    mobileMenu.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', closeMenu);
    });

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMenu();
    });
  }

  if (slides.length > 1 && controls.length > 1) {
    const showSlide = (index) => {
      activeSlide = (index + slides.length) % slides.length;
      slides.forEach((slide, currentIndex) => {
        slide.classList.toggle('is-active', currentIndex === activeSlide);
      });
      controls.forEach((button, currentIndex) => {
        button.classList.toggle('is-active', currentIndex === activeSlide);
      });
    };

    const stopTimer = () => {
      if (!slideTimer) return;
      window.clearInterval(slideTimer);
      slideTimer = null;
    };

    const startTimer = () => {
      if (reduceMotion || slideTimer) return;
      slideTimer = window.setInterval(() => showSlide(activeSlide + 1), 5200);
    };

    controls.forEach((button) => {
      button.addEventListener('click', () => {
        showSlide(Number(button.dataset.homeSlideControl || 0));
        stopTimer();
        startTimer();
      });
    });

    carousel?.addEventListener('mouseenter', stopTimer);
    carousel?.addEventListener('mouseleave', startTimer);
    startTimer();
  }
})();
