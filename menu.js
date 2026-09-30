'use strict';

(() => {
  const drawer = document.getElementById('menuDrawer');
  const overlay = document.getElementById('menuOverlay');
  const hamburger = document.getElementById('hamburgerBtn');
  const closeMenu = document.getElementById('closeDrawerBtn');
  const sheet = document.getElementById('productSheet');
  const gallery = document.getElementById('previewGallery');
  const dots = document.getElementById('previewDots');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const background = [...document.querySelectorAll('.hero, .topbar, main, footer, .carousel-section')];
  const links = [...document.querySelectorAll('#catnav a')];
  const sections = [...document.querySelectorAll('section.category')];
  let savedScroll = 0;
  let savedBodyStyle;
  let opener;
  let closing = false;
  let closeTimer;

  // One shared scroll lock for either overlay; restore inline styles and position.
  function lockPage() {
    savedScroll = window.scrollY;
    savedBodyStyle = document.body.getAttribute('style');
    Object.assign(document.body.style, {position: 'fixed', top: `-${savedScroll}px`, width: '100%', overflow: 'hidden'});
    background.forEach(element => { element.inert = true; });
  }
  function unlockPage() {
    if (savedBodyStyle === null) document.body.removeAttribute('style');
    else document.body.setAttribute('style', savedBodyStyle);
    background.forEach(element => { element.inert = false; });
    window.scrollTo({top: savedScroll, behavior: 'instant'});
  }
  function closeDrawer(restoreFocus = true) {
    if (!drawer.classList.contains('open')) return;
    drawer.classList.remove('open');
    overlay.classList.remove('open');
    hamburger.classList.remove('open');
    hamburger.setAttribute('aria-expanded', 'false');
    drawer.inert = true;
    unlockPage();
    if (restoreFocus) hamburger.focus({preventScroll: true});
  }
  hamburger.addEventListener('click', () => {
    if (sheet.open) return;
    if (drawer.classList.contains('open')) return closeDrawer();
    lockPage();
    drawer.inert = false;
    drawer.classList.add('open');
    overlay.classList.add('open');
    hamburger.classList.add('open');
    hamburger.setAttribute('aria-expanded', 'true');
    closeMenu.focus({preventScroll: true});
  });
  closeMenu.addEventListener('click', () => closeDrawer());
  overlay.addEventListener('click', () => closeDrawer());
  drawer.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); closeDrawer(); }
    if (event.key !== 'Tab') return;
    const last = links[links.length - 1];
    if (event.shiftKey && document.activeElement === closeMenu) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); closeMenu.focus(); }
  });
  links.forEach(link => link.addEventListener('click', () => {
    closeDrawer(false);
    const target = document.getElementById(link.hash.slice(1));
    if (target) { target.tabIndex = -1; target.focus({preventScroll: true}); }
  }));
  function updateCategory() {
    let current = '';
    sections.forEach(section => { if (section.getBoundingClientRect().top <= 95) current = section.id; });
    links.forEach(link => {
      const active = link.hash === '#' + current;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }
  window.addEventListener('scroll', updateCategory, {passive: true});
  updateCategory();

  const recommendedTrack = document.getElementById('recoTrack');
  const recommendedDots = document.getElementById('recoDots');

  if (recommendedTrack && recommendedDots) {
    const cards = [...recommendedTrack.querySelectorAll('.carousel-card')];
    const dots = cards.map((_, index) => {
      const dot = document.createElement('span');
      dot.setAttribute('role', 'button');
      dot.setAttribute('tabindex', '0');
      dot.setAttribute('aria-label', `Ver recomendación ${index + 1}`);
      dot.addEventListener('click', () => {
        cards[index].scrollIntoView({behavior: reducedMotion.matches ? 'auto' : 'smooth', inline: 'center', block: 'nearest'});
      });
      dot.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          cards[index].scrollIntoView({behavior: reducedMotion.matches ? 'auto' : 'smooth', inline: 'center', block: 'nearest'});
        }
      });
      recommendedDots.appendChild(dot);
      return dot;
    });

    function updateRecommendedCarousel() {
      const center = recommendedTrack.scrollLeft + recommendedTrack.clientWidth / 2;
      cards.forEach((card, index) => {
        const cardCenter = card.offsetLeft + card.offsetWidth / 2;
        const active = Math.abs(center - cardCenter) < card.offsetWidth * 0.55;
        card.classList.toggle('active', active);
        dots[index].classList.toggle('active', active);
      });
    }

    updateRecommendedCarousel();
    recommendedTrack.addEventListener('scroll', () => requestAnimationFrame(updateRecommendedCarousel), {passive: true});
    window.addEventListener('resize', updateRecommendedCarousel);
  }

  const imagePaths = item => (item.dataset.images || '').split(',').map(path => path.trim()).filter(Boolean).slice(0, 2);
  const camera = '<svg class="photo-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/></svg>';
  document.querySelectorAll('.item-preview').forEach(item => {
    if (!imagePaths(item).length) {
      item.classList.remove('item-preview');
      item.removeAttribute('role');
      item.removeAttribute('tabindex');
      return;
    }
    item.setAttribute('role', 'button');
    item.tabIndex = 0;
    item.setAttribute('aria-haspopup', 'dialog');
    item.setAttribute('aria-controls', 'productSheet');
    item.setAttribute('aria-expanded', 'false');
    const name = item.querySelector('.item-name');
    item.setAttribute('aria-label', `Ver imagen de ${name.textContent.trim()}`);
    name.insertAdjacentHTML('beforeend', camera);
  });

  const zoomControllers = new Map();
  const clampZoom = value => Math.max(1, Math.min(4, value));
  function resetZoom() {
    zoomControllers.forEach(controller => controller.reset());
    gallery.classList.remove('has-zoom');
  }
  function configureImageZoom(slide, image) {
    const viewport = document.createElement('div');
    viewport.className = 'image-viewport';
    viewport.tabIndex = 0;
    viewport.setAttribute('role', 'group');
    viewport.setAttribute('aria-label', 'Imagen: separa dos dedos para ampliar y arrastra para explorar. Con teclado, Enter amplía o reduce y las flechas desplazan.');
    const surface = document.createElement('div');
    surface.className = 'image-surface';
    surface.appendChild(image);
    viewport.appendChild(surface);
    slide.appendChild(viewport);
    image.draggable = false;
    let scale = 1, pinch = null, moved = false, axis = null;
    const pointers = new Map();
    function reset() {
      scale = 1;
      viewport.classList.remove('is-zoomed', 'is-dragging');
      surface.removeAttribute('style');
      image.removeAttribute('style');
      viewport.scrollTo({left: 0, top: 0, behavior: 'instant'});
    }
    zoomControllers.set(viewport, {reset});
    function setZoom(value, x = viewport.clientWidth / 2, y = viewport.clientHeight / 2) {
      if (!image.naturalWidth || image.hidden) return;
      const next = clampZoom(value);
      const w = viewport.clientWidth, h = viewport.clientHeight;
      if (!w || !h) return;
      const fit = Math.max(w / image.naturalWidth, h / image.naturalHeight);
      const oldW = image.naturalWidth * fit * scale;
      const oldH = image.naturalHeight * fit * scale;
      // At rest cover crops centrally; account for that crop when starting a pinch.
      const px = scale === 1 ? (x + (oldW - w) / 2) / oldW : (viewport.scrollLeft + x) / oldW;
      const py = scale === 1 ? (y + (oldH - h) / 2) / oldH : (viewport.scrollTop + y) / oldH;
      if (next <= 1.01) { reset(); gallery.classList.remove('has-zoom'); return; }
      scale = next;
      const newW = image.naturalWidth * fit * scale;
      const newH = image.naturalHeight * fit * scale;
      surface.style.width = `${newW}px`;
      surface.style.height = `${newH}px`;
      image.style.width = `${newW}px`;
      image.style.height = `${newH}px`;
      viewport.classList.add('is-zoomed');
      gallery.classList.add('has-zoom');
      viewport.scrollTo({left: px * newW - x, top: py * newH - y, behavior: 'instant'});
    }
    function pair() {
      const [a,b] = [...pointers.values()];
      return {distance: Math.hypot(a.x-b.x,a.y-b.y), x:(a.x+b.x)/2, y:(a.y+b.y)/2};
    }
    viewport.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      if (!pointers.size) { moved = false; axis = null; }
      pointers.set(event.pointerId, {x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY});
      viewport.setPointerCapture(event.pointerId);
      if (pointers.size === 2) { pinch = {...pair(), scale}; moved = true; }
    });
    viewport.addEventListener('pointermove', event => {
      const previous = pointers.get(event.pointerId);
      if (!previous) return;
      const dx = event.clientX-previous.x, dy = event.clientY-previous.y;
      pointers.set(event.pointerId, {...previous,x:event.clientX,y:event.clientY});
      if (pointers.size >= 2 && pinch) {
        const current = pair(), rect = viewport.getBoundingClientRect();
        setZoom(pinch.scale * current.distance / Math.max(1,pinch.distance), current.x-rect.left,current.y-rect.top);
        return;
      }
      const totalX = event.clientX-previous.startX, totalY = event.clientY-previous.startY;
      if (Math.hypot(totalX,totalY)>5) moved=true;
      if (!moved) return;
      if (scale>1) {
        viewport.scrollLeft -= dx;
        viewport.scrollTop -= dy;
        viewport.classList.add('is-dragging');
      } else if (event.pointerType !== 'mouse') {
        axis ||= Math.abs(totalX)>Math.abs(totalY) ? 'x' : 'y';
        if (axis==='x') { gallery.classList.add('is-swiping'); gallery.scrollLeft -= dx; }
        else sheet.scrollTop -= dy;
      }
    });
    function finishPointer(event) {
      if (!pointers.has(event.pointerId)) return;
      pointers.delete(event.pointerId);
      if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
      if (pointers.size<2) pinch=null;
      if (!pointers.size) {
        viewport.classList.remove('is-dragging');
        if (gallery.classList.contains('is-swiping')) {
          const page = Math.round(gallery.scrollLeft/gallery.clientWidth);
          gallery.classList.remove('is-swiping');
          gallery.scrollTo({left:page*gallery.clientWidth,behavior:reducedMotion.matches?'instant':'smooth'});
        }
        // Mouse retains click-to-zoom; touch uses only the two-finger gesture.
        if (!moved && event.pointerType==='mouse' && event.type==='pointerup') setZoom(scale>1?1:2.5);
      }
    }
    viewport.addEventListener('pointerup', finishPointer);
    viewport.addEventListener('pointercancel', finishPointer);
    viewport.addEventListener('lostpointercapture', finishPointer);
    viewport.addEventListener('keydown', event => {
      if (event.key==='Enter' || event.key===' ') { event.preventDefault(); event.stopPropagation(); setZoom(scale>1?1:2.5); }
    });
    image.addEventListener('error', () => { reset(); viewport.hidden=true; gallery.classList.remove('has-zoom'); });
  }
  new ResizeObserver(() => resetZoom()).observe(gallery);

  function selectDot(index) {
    [...dots.children].forEach((dot, i) => {
      dot.setAttribute('aria-pressed', String(i === index));
    });
  }
  const pendingImageLoads = new Set();
  function clearImageLoading() {
    [...pendingImageLoads].forEach(finish => finish());
  }
  function configureImageLoading(slide, image) {
    const status = document.createElement('div');
    status.className = 'image-loading-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.hidden = true;
    slide.appendChild(status);
    image.setAttribute('aria-busy', 'true');
    slide.classList.add('image-pending');
    let finished = false;
    const timer = setTimeout(() => {
      if (finished || !slide.isConnected) return;
      status.hidden = false;
      status.textContent = 'Cargando imagen…';
    }, 200);
    function finish() {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      status.remove();
      image.removeAttribute('aria-busy');
      slide.classList.remove('image-pending');
      pendingImageLoads.delete(finish);
    }
    pendingImageLoads.add(finish);
    image.addEventListener('load', () => {
      // Keep the status until the downloaded image is decoded and ready to paint.
      if (typeof image.decode === 'function') image.decode().then(finish, finish);
      else finish();
    }, {once: true});
    image.addEventListener('error', finish, {once: true});
  }

  function openPreview(item, source = item) {
    const paths = imagePaths(item);
    if (!paths.length || sheet.open || closing) return;
    closeDrawer(false);
    opener = source;
    const name = item.querySelector('.item-name').textContent.trim();
    document.getElementById('previewName').textContent = name;
    document.getElementById('previewPrice').textContent = `S/ ${item.querySelector('.item-price').textContent.trim()}`;
    document.getElementById('previewCategory').textContent = item.closest('.category').querySelector('h2').textContent;
    const description = document.getElementById('previewDescription');
    description.textContent = item.dataset.description || item.querySelector('.item-desc')?.textContent || '';
    description.hidden = !description.textContent;
    resetZoom();
    clearImageLoading();
    zoomControllers.clear();
    gallery.replaceChildren();
    dots.replaceChildren();
    dots.hidden = paths.length < 2;
    paths.forEach((path, index) => {
      const slide = document.createElement('div');
      slide.className = 'preview-slide';
      slide.setAttribute('role', 'group');
      slide.setAttribute('aria-label', `Imagen ${index + 1} de ${paths.length}`);
      const image = document.createElement('img');
      image.width = 900;
      image.height = 900;
      image.alt = path.includes('placeholder.svg') ? `Fotografía de ${name} por añadir` : `${name}, imagen referencial ${index + 1}`;
      image.decoding = 'async';
      image.loading = index ? 'lazy' : 'eager';
      image.addEventListener('error', () => {
        image.hidden = true;
        const fallback = document.createElement('p');
        fallback.className = 'image-fallback';
        fallback.textContent = 'La fotografía no está disponible en este momento.';
        slide.appendChild(fallback);
      }, {once: true});
      configureImageZoom(slide, image);
      configureImageLoading(slide, image);
      image.src = path;
      gallery.appendChild(slide);
      if (paths.length > 1) {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.setAttribute('aria-label', `Ver fotografía ${index + 1}`);
        dot.addEventListener('click', () => {
          resetZoom();
          gallery.scrollTo({left: index * gallery.clientWidth, behavior: reducedMotion.matches ? 'instant' : 'smooth'});
        });
        dots.appendChild(dot);
      }
    });
    selectDot(0);
    lockPage();
    opener.setAttribute('aria-expanded', 'true');
    sheet.showModal(); // Native modal supplies focus trapping and background isolation.
    gallery.scrollLeft = 0;
    sheet.scrollTop = 0;
  }
  document.addEventListener('click', event => {
    const product = event.target.closest('.item-preview');
    if (product) openPreview(product);
    // Optional future recommendation cards refer to the existing product id.
    const card = event.target.closest('[data-preview-target]');
    if (card) {
      const target = document.getElementById(card.dataset.previewTarget);
      if (target && imagePaths(target).length) { event.preventDefault(); openPreview(target, card); }
    }
  });
  document.addEventListener('keydown', event => {
    const product = event.target.closest('.item-preview');
    if (product && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openPreview(product); }
  });
  gallery.addEventListener('scroll', () => selectDot(Math.round(gallery.scrollLeft / gallery.clientWidth)), {passive: true});
  gallery.addEventListener('keydown', event => {
    const zoomed = gallery.querySelector('.image-viewport.is-zoomed');
    if (zoomed && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      zoomed.scrollBy({left: event.key === 'ArrowLeft' ? -80 : event.key === 'ArrowRight' ? 80 : 0,
        top: event.key === 'ArrowUp' ? -80 : event.key === 'ArrowDown' ? 80 : 0,
        behavior: reducedMotion.matches ? 'instant' : 'smooth'});
      return;
    }
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    gallery.scrollBy({left: (event.key === 'ArrowRight' ? 1 : -1) * gallery.clientWidth, behavior: reducedMotion.matches ? 'instant' : 'smooth'});
  });
  function finishClose() {
    clearImageLoading();
    resetZoom();
    clearTimeout(closeTimer);
    sheet.classList.remove('closing');
    closing = false;
    unlockPage();
    opener?.setAttribute('aria-expanded', 'false');
    opener?.focus({preventScroll: true});
  }
  function closePreview() {
    if (!sheet.open || closing) return;
    closing = true;
    sheet.classList.add('closing');
    closeTimer = setTimeout(() => sheet.close(), reducedMotion.matches ? 0 : 180);
  }
  sheet.querySelector('.sheet-close').addEventListener('click', closePreview);
  sheet.addEventListener('cancel', event => { event.preventDefault(); closePreview(); });
  sheet.addEventListener('close', finishClose);
  let backdropDown = false;
  const outsideSheet = event => {
    const rect = sheet.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  };
  sheet.addEventListener('pointerdown', event => { backdropDown = event.target === sheet && outsideSheet(event); });
  sheet.addEventListener('click', event => {
    if (backdropDown && event.target === sheet && outsideSheet(event)) closePreview();
    backdropDown = false;
  });
})();
