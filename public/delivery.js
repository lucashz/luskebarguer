(() => {
  const attribution = readAttribution();
  const visitorKey = getVisitorKey();
  attribution.visitor_key = visitorKey;
  attribution.landing_path = location.pathname;
  saveAttribution(attribution);
  propagateSignupAttribution(attribution);
  track('landing_view', 'delivery_landing', attribution);
  setupProofCarousel();
  setupImageGallery();

  document.querySelectorAll('[data-delivery-signup]').forEach((link) => {
    link.addEventListener('click', () => track('signup_started', link.textContent.trim(), attribution));
  });

  document.querySelectorAll('[data-delivery-whatsapp]').forEach((link) => {
    link.addEventListener('click', () => trackWhatsappClick(link.dataset.whatsappPlacement || link.textContent.trim()));
  });

  function trackWhatsappClick(placement) {
    track('whatsapp_click', placement, attribution);
  }

  function setupProofCarousel() {
    const carousel = document.querySelector('[data-proof-carousel]');
    const slides = [...carousel?.querySelectorAll('[data-carousel-slide]') || []];
    const controls = [...carousel?.querySelectorAll('[data-carousel-label]') || []];
    const progress = carousel?.querySelector('[data-carousel-progress]');
    if (slides.length < 2 || controls.length !== slides.length) return;
    let activeIndex = 0;
    let timer = null;

    const show = (index) => {
      activeIndex = (index + slides.length) % slides.length;
      slides.forEach((slide, position) => { slide.hidden = position !== activeIndex; });
      controls.forEach((button, position) => button.setAttribute('aria-pressed', String(position === activeIndex)));
      if (progress) { progress.style.animation = 'none'; void progress.offsetHeight; progress.style.animation = ''; }
    };
    const stop = () => { if (timer) clearInterval(timer); timer = null; carousel.classList.add('is-paused'); };
    const start = () => {
      stop();
      if (document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      carousel.classList.remove('is-paused');
      timer = setInterval(() => show(activeIndex + 1), 5000);
    };

    controls.forEach((button, index) => button.addEventListener('click', () => { show(index); start(); }));
    carousel.addEventListener('mouseenter', stop);
    carousel.addEventListener('mouseleave', start);
    carousel.addEventListener('focusin', stop);
    carousel.addEventListener('focusout', (event) => { if (!carousel.contains(event.relatedTarget)) start(); });
    document.addEventListener('visibilitychange', start);
    show(0);
    start();
  }

  function setupImageGallery() {
    const items = [...document.querySelectorAll('[data-delivery-gallery-item]')];
    const modal = document.querySelector('[data-delivery-image-modal]');
    const expandedImage = modal?.querySelector('[data-delivery-image-expanded]');
    const title = modal?.querySelector('[data-delivery-image-title]');
    const counter = modal?.querySelector('[data-delivery-image-counter]');
    const previous = modal?.querySelector('[data-delivery-image-previous]');
    const next = modal?.querySelector('[data-delivery-image-next]');
    const close = modal?.querySelector('.delivery-image-close');
    if (!items.length || !modal || !expandedImage || !title || !counter || !previous || !next || !close) return;

    let activeIndex = 0;
    let trigger = null;

    const show = (index) => {
      activeIndex = (index + items.length) % items.length;
      const item = items[activeIndex];
      const image = item.querySelector('img');
      expandedImage.src = image.currentSrc || image.src;
      expandedImage.alt = image.alt;
      title.textContent = item.querySelector('figcaption')?.textContent?.trim() || image.alt;
      counter.textContent = `${activeIndex + 1} de ${items.length}`;
    };

    const open = (index, source) => {
      trigger = source;
      show(index);
      modal.hidden = false;
      document.body.classList.add('delivery-modal-open');
      close.focus();
    };

    const closeModal = () => {
      if (modal.hidden) return;
      modal.hidden = true;
      document.body.classList.remove('delivery-modal-open');
      expandedImage.src = '';
      trigger?.focus();
      trigger = null;
    };

    items.forEach((item, index) => {
      item.addEventListener('click', () => open(index, item));
      item.addEventListener('keydown', (event) => {
        if (!['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        open(index, item);
      });
    });

    modal.querySelectorAll('[data-delivery-image-close]').forEach((element) => element.addEventListener('click', closeModal));
    previous.addEventListener('click', () => show(activeIndex - 1));
    next.addEventListener('click', () => show(activeIndex + 1));
    window.addEventListener('keydown', (event) => {
      if (modal.hidden) return;
      if (event.key === 'Escape') closeModal();
      if (event.key === 'ArrowLeft') show(activeIndex - 1);
      if (event.key === 'ArrowRight') show(activeIndex + 1);
      if (event.key === 'Tab') {
        const focusable = [close, previous, next];
        const position = focusable.indexOf(document.activeElement);
        const direction = event.shiftKey ? -1 : 1;
        event.preventDefault();
        focusable[(position + direction + focusable.length) % focusable.length].focus();
      }
    });
  }

  function readAttribution() {
    const params = new URLSearchParams(location.search);
    let previous = {};
    try { previous = JSON.parse(localStorage.getItem('tapronto_marketing_attribution') || '{}'); } catch {}
    const current = {
      utm_source: params.get('utm_source') || '',
      utm_medium: params.get('utm_medium') || '',
      utm_campaign: params.get('utm_campaign') || '',
      utm_content: params.get('utm_content') || '',
      utm_term: params.get('utm_term') || '',
      referrer_host: document.referrer || ''
    };
    return Object.fromEntries(Object.entries({ ...previous, ...current }).filter(([, value]) => value));
  }

  function saveAttribution(value) {
    try { localStorage.setItem('tapronto_marketing_attribution', JSON.stringify(value)); } catch {}
  }

  function propagateSignupAttribution(value) {
    document.querySelectorAll('[data-delivery-signup]').forEach((link) => {
      const url = new URL(link.getAttribute('href'), location.origin);
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach((key) => {
        if (value[key]) url.searchParams.set(key, value[key]);
      });
      link.href = `${url.pathname}${url.search}`;
    });
  }

  function getVisitorKey() {
    try {
      const stored = localStorage.getItem('tapronto_visitor_key');
      if (stored) return stored;
      const created = crypto.randomUUID ? crypto.randomUUID() : `visitor-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem('tapronto_visitor_key', created);
      return created;
    } catch {
      return `visitor-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
  }

  function track(eventName, placement, value) {
    fetch('/api/analytics/funnel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({ event_name: eventName, path: location.pathname, placement, attribution: value })
    }).catch(() => {});
  }
})();
