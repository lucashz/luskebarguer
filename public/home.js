(() => {
  const menuButton = document.getElementById('homeMenuButton');
  const mobileMenu = document.getElementById('homeMobileMenu');
  const slides = [...document.querySelectorAll('[data-home-slide]')];
  const controls = [...document.querySelectorAll('[data-home-slide-control]')];
  const carousel = document.querySelector('[data-home-carousel]');
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let activeSlide = 0;
  let slideTimer = null;
  let modalTrigger = null;

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

  setupImageModal();

  trackHomeAccess();
  trackMarketingCtas();

  function trackHomeAccess() {
    const payload = {
      page_type: 'home',
      path: window.location.pathname,
      title: document.title,
      referrer: document.referrer,
      device_type: accessDeviceType(),
      visitor_key: accessVisitorKey(),
      attribution: marketingAttribution(),
      source: 'home'
    };
    postAccessMetric(payload);
  }

  function trackMarketingCtas() {
    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[href]');
      if (!link) return;
      const href = String(link.getAttribute('href') || '');
      const eventName = /cardapio|demonstracao|demo/.test(href) ? 'demo_started' : /cadastro|criar-conta/.test(href) ? 'signup_started' : '';
      if (!eventName) return;
      fetch('/api/analytics/funnel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
        body: JSON.stringify({ event_name: eventName, path: location.pathname, placement: link.textContent?.trim(), attribution: marketingAttribution() })
      }).catch(() => {});
    });
  }

  function marketingAttribution() {
    const params = new URLSearchParams(location.search);
    const value = {
      utm_source: params.get('utm_source') || '', utm_medium: params.get('utm_medium') || '',
      utm_campaign: params.get('utm_campaign') || '', utm_content: params.get('utm_content') || '',
      utm_term: params.get('utm_term') || '', landing_path: location.pathname,
      referrer_host: document.referrer, visitor_key: accessVisitorKey()
    };
    try {
      const previous = JSON.parse(localStorage.getItem('tapronto_marketing_attribution') || '{}');
      const merged = { ...value, ...Object.fromEntries(Object.entries(previous).filter(([, item]) => item)) };
      localStorage.setItem('tapronto_marketing_attribution', JSON.stringify(merged));
      return merged;
    } catch { return value; }
  }

  function setupImageModal() {
    const modal = document.querySelector('[data-home-image-modal]');
    const modalImage = modal?.querySelector('[data-home-image-modal-img]');
    const modalTitle = modal?.querySelector('[data-home-image-modal-title]');
    const modalDescription = modal?.querySelector('[data-home-image-modal-description]');
    const modalCounter = modal?.querySelector('[data-home-image-modal-counter]');
    const previousButton = modal?.querySelector('[data-home-image-modal-previous]');
    const nextButton = modal?.querySelector('[data-home-image-modal-next]');
    const closeButton = modal?.querySelector('.home-image-modal-close');
    if (!modal || !modalImage || !modalTitle || !modalDescription || !modalCounter || !previousButton || !nextButton || !closeButton) return;

    const showModalSlide = (index) => {
      activeSlide = (index + slides.length) % slides.length;
      const slide = slides[activeSlide];
      const image = slide?.querySelector('img');
      if (!image) return;
      const title = slide.querySelector('figcaption strong')?.textContent?.trim() || image.alt;
      const description = slide.querySelector('figcaption span')?.textContent?.trim() || '';
      modalImage.src = image.currentSrc || image.src;
      modalImage.alt = image.alt;
      modalTitle.textContent = title;
      modalDescription.textContent = description;
      modalCounter.textContent = `${activeSlide + 1} de ${slides.length}`;
      slides.forEach((item, itemIndex) => item.classList.toggle('is-active', itemIndex === activeSlide));
      controls.forEach((button, itemIndex) => button.classList.toggle('is-active', itemIndex === activeSlide));
    };

    const closeModal = () => {
      if (modal.hidden) return;
      modal.hidden = true;
      document.body.classList.remove('home-modal-open');
      modalImage.src = '';
      modalTrigger?.focus();
      modalTrigger = null;
      startCarouselTimer();
    };

    slides.forEach((slide, slideIndex) => {
      const image = slide.querySelector('img');
      if (!image) return;
      image.setAttribute('role', 'button');
      image.setAttribute('tabindex', '0');
      image.setAttribute('aria-label', `${image.alt}. Clique para ampliar.`);

      const openModal = () => {
        modalTrigger = image;
        showModalSlide(slideIndex);
        modal.hidden = false;
        document.body.classList.add('home-modal-open');
        stopCarouselTimer();
        closeButton.focus();
      };

      image.addEventListener('click', openModal);
      image.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openModal();
      });
    });

    modal.querySelectorAll('[data-home-image-modal-close]').forEach((element) => {
      element.addEventListener('click', closeModal);
    });
    previousButton.addEventListener('click', () => showModalSlide(activeSlide - 1));
    nextButton.addEventListener('click', () => showModalSlide(activeSlide + 1));

    window.addEventListener('keydown', (event) => {
      if (modal.hidden) return;
      if (event.key === 'Escape') closeModal();
      if (event.key === 'ArrowLeft') showModalSlide(activeSlide - 1);
      if (event.key === 'ArrowRight') showModalSlide(activeSlide + 1);
      if (event.key === 'Tab') {
        const focusable = [closeButton, previousButton, nextButton];
        const currentIndex = focusable.indexOf(document.activeElement);
        const direction = event.shiftKey ? -1 : 1;
        const nextIndex = (currentIndex + direction + focusable.length) % focusable.length;
        event.preventDefault();
        focusable[nextIndex].focus();
      }
    });
  }

  function stopCarouselTimer() {
    if (!slideTimer) return;
    window.clearInterval(slideTimer);
    slideTimer = null;
  }

  function startCarouselTimer() {
    if (reduceMotion || slideTimer || slides.length < 2) return;
    slideTimer = window.setInterval(() => {
      activeSlide = (activeSlide + 1) % slides.length;
      slides.forEach((slide, index) => slide.classList.toggle('is-active', index === activeSlide));
      controls.forEach((button, index) => button.classList.toggle('is-active', index === activeSlide));
    }, 5200);
  }

  function postAccessMetric(payload) {
    const body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon) {
        const sent = navigator.sendBeacon('/api/analytics/access', new Blob([body], { type: 'application/json' }));
        if (sent) return;
      }
    } catch {}
    fetch('/api/analytics/access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true
    }).catch(() => {});
  }

  function accessDeviceType() {
    const width = window.innerWidth || 1024;
    if (width <= 767) return 'mobile';
    if (width <= 1024) return 'tablet';
    return 'desktop';
  }

  function accessVisitorKey() {
    const key = 'tapronto_visitor_key';
    try {
      let value = localStorage.getItem(key);
      if (!value) {
        value = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
        localStorage.setItem(key, value);
      }
      return value;
    } catch {
      return '';
    }
  }
})();
