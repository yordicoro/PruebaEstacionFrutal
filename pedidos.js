(() => {
  const slug = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const money = cents => `S/ ${(cents / 100).toFixed(2)}`;
  const fab = document.createElement('button');
  fab.className = 'order-fab'; fab.type = 'button'; fab.id = 'orderOpen';
  fab.innerHTML = '<span aria-hidden="true">＋</span> Pedir <span class="order-count" id="orderCount">0</span>';
  document.body.append(fab);
  const dialog = document.createElement('dialog'); dialog.className = 'order-dialog'; dialog.id = 'orderDialog';
  dialog.innerHTML = '<div class="order-head"><div><p class="order-kicker">ESTACIÓN FRUTAL</p><h2 id="orderTitle">Tu pedido</h2></div><button class="order-close" type="button" aria-label="Cerrar">×</button></div><div id="orderContent"></div>';
  document.body.append(dialog);
  const content = dialog.querySelector('#orderContent');
  const cart = new Map(); let sending = false; let idempotencyKey = null;
  const open = () => dialog.showModal();
  fab.addEventListener('click', open);
  dialog.querySelector('.order-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  function updateCount() {
    const count = [...cart.values()].reduce((sum, line) => sum + line.quantity, 0);
    document.getElementById('orderCount').textContent = String(count);
    fab.classList.toggle('has-items', count > 0);
  }
  function add(product) {
    const current = cart.get(product.catalog_key);
    if (current) current.quantity = Math.min(99, current.quantity + 1);
    else cart.set(product.catalog_key, { productId: product.catalog_key, name: product.name, price: product.price_cents, quantity: 1, notes: '' });
    updateCount();
  }
  function addSavedStatusControl() {
    const token=localStorage.getItem('ef_customer_order_token'); if(!token)return;
    const wrap=document.createElement('div'); wrap.className='order-saved-status'; const button=document.createElement('button'); button.type='button'; button.className='order-track'; button.textContent='Consultar mi último pedido'; const status=document.createElement('p'); status.className='order-track-status'; status.setAttribute('role','status');
    button.addEventListener('click',async()=>{button.disabled=true;try{const response=await fetch(`/api/order-status?token=${encodeURIComponent(token)}`);const data=await response.json();if(!response.ok||!data.status)throw new Error();const labels={pending:'Pendiente de confirmación',accepted:'Pedido confirmado',preparing:'En preparación',ready:'Listo',delivered:'Entregado',paid:'Pagado',cancelled:'Anulado'};status.textContent=`${labels[data.status]||data.status}${data.tableNumber?` · Mesa ${data.tableNumber}`:''}`;}catch{status.textContent='No se pudo consultar el estado ahora.';}finally{button.disabled=false;}}); wrap.append(button,status); content.append(wrap);
  }
  function renderCart() {
    content.replaceChildren(); addSavedStatusControl();
    if (!cart.size) {
      const empty = document.createElement('p'); empty.className = 'order-empty'; empty.textContent = 'Tu pedido está vacío. Elige productos del menú.'; content.append(empty); return;
    }
    const list = document.createElement('div'); list.className = 'order-lines';
    for (const item of cart.values()) {
      const row = document.createElement('article'); row.className = 'order-line';
      const title = document.createElement('div'); title.className = 'order-line-title';
      const name = document.createElement('strong'); name.textContent = item.name;
      const price = document.createElement('span'); price.textContent = money(item.price * item.quantity);
      title.append(name, price);
      const controls = document.createElement('div'); controls.className = 'order-line-controls';
      const minus = document.createElement('button'); minus.type = 'button'; minus.dataset.action = 'minus'; minus.dataset.id = item.productId; minus.setAttribute('aria-label', `Quitar una unidad de ${item.name}`); minus.textContent = '−';
      const quantity = document.createElement('span'); quantity.textContent = String(item.quantity); quantity.setAttribute('aria-live', 'polite');
      const plus = document.createElement('button'); plus.type = 'button'; plus.dataset.action = 'plus'; plus.dataset.id = item.productId; plus.setAttribute('aria-label', `Agregar una unidad de ${item.name}`); plus.textContent = '+';
      const remove = document.createElement('button'); remove.type = 'button'; remove.dataset.action = 'remove'; remove.dataset.id = item.productId; remove.className = 'order-remove'; remove.textContent = 'Quitar';
      controls.append(minus, quantity, plus, remove);
      const note = document.createElement('input'); note.type = 'text'; note.maxLength = 180; note.placeholder = 'Nota para este producto (opcional)'; note.value = item.notes; note.dataset.note = item.productId; note.setAttribute('aria-label', `Nota para ${item.name}`);
      row.append(title, controls, note); list.append(row);
    }
    const totalCents = [...cart.values()].reduce((sum, item) => sum + item.price * item.quantity, 0);
    const total = document.createElement('p'); total.className = 'order-total'; total.innerHTML = '<span>Total</span><strong></strong>'; total.querySelector('strong').textContent = money(totalCents);
    const info = document.createElement('p'); info.className = 'order-info'; info.textContent = 'El mesero confirmará la disponibilidad y asignará tu mesa.';
    const submit = document.createElement('button'); submit.type = 'button'; submit.className = 'order-submit'; submit.textContent = sending ? 'Enviando pedido…' : 'Generar pedido'; submit.disabled = sending;
    submit.addEventListener('click', submitOrder);
    content.append(list, total, info, submit);
  }
  content.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]'); if (!button) return;
    const item = cart.get(button.dataset.id); if (!item) return;
    if (button.dataset.action === 'minus') item.quantity--;
    if (button.dataset.action === 'plus') item.quantity = Math.min(99, item.quantity + 1);
    if (button.dataset.action === 'remove' || item.quantity <= 0) cart.delete(button.dataset.id);
    updateCount(); renderCart();
  });
  content.addEventListener('input', event => { if (event.target.dataset.note) { const item = cart.get(event.target.dataset.note); if (item) item.notes = event.target.value.slice(0, 180); } });
  async function submitOrder() {
    if (sending || !cart.size) return;
    sending = true; idempotencyKey ||= crypto.randomUUID(); renderCart();
    try {
      const response = await fetch('/api/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idempotencyKey, items: [...cart.values()].map(({ productId, quantity, notes }) => ({ productId, quantity, notes })) }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'No se pudo enviar el pedido.');
      cart.clear(); idempotencyKey = null; sending = false; updateCount(); if(result.customerToken) localStorage.setItem('ef_customer_order_token',result.customerToken);
      content.innerHTML = '<div class="order-success"><span aria-hidden="true">✓</span><h3>Pedido generado</h3><p>Indica este código al mesero:</p><strong class="order-code"></strong><p class="order-expiry"></p><button type="button" class="order-copy">Copiar código</button><button type="button" class="order-track">Ver estado del pedido</button><p class="order-track-status" role="status"></p><button type="button" class="order-submit">Entendido</button></div>';
      content.querySelector('.order-code').textContent = result.code;
      content.querySelector('.order-expiry').textContent = result.codeExpiresAt ? `Válido por 30 minutos · Total ${money(result.totalCents)}` : `Total ${money(result.totalCents)}`;
      content.querySelector('.order-copy').addEventListener('click', async event => { try { await navigator.clipboard.writeText(String(result.code)); event.currentTarget.textContent = 'Código copiado'; } catch { event.currentTarget.textContent = `Código: ${result.code}`; } });
      content.querySelector('.order-track').addEventListener('click', async event => { const status=content.querySelector('.order-track-status'); event.currentTarget.disabled=true; try { const state=await fetch(`/api/order-status?token=${encodeURIComponent(result.customerToken)}`).then(r=>r.json()); if(!state.status) throw new Error(); const labels={pending:'Pendiente de confirmación',accepted:'Pedido confirmado',preparing:'En preparación',ready:'Listo',delivered:'Entregado',paid:'Pagado',cancelled:'Anulado'}; status.textContent=`${labels[state.status]||state.status}${state.tableNumber?` · Mesa ${state.tableNumber}`:''}`; } catch { status.textContent='No se pudo consultar el estado ahora.'; } finally { event.currentTarget.disabled=false; } });
      content.querySelector('.order-submit').addEventListener('click', () => dialog.close());
    } catch (error) {
      sending = false; renderCart();
      const alert = document.createElement('p'); alert.className = 'order-error'; alert.setAttribute('role', 'alert'); alert.textContent = error.message; content.prepend(alert);
    }
  }
  async function initialize() {
    try {
      const response = await fetch('/api/catalog', { cache: 'no-store' }); if (!response.ok) throw new Error();
      const products = await response.json();
      for (const product of products) {
        catalog.set(product.catalog_key, product);
        let node = [...document.querySelectorAll('.category .item')].find(el => el.querySelector('.item-name')?.textContent.trim() === product.name && el.closest('.category')?.querySelector('h2')?.textContent.trim() === product.category);
        if (!node) {
          const suffix = `-${slug(product.name)}`;
          const categoryId = product.catalog_key.endsWith(suffix) ? product.catalog_key.slice(0, -suffix.length) : slug(product.category);
          let section = [...document.querySelectorAll('.category')].find(el => el.querySelector('h2')?.textContent.trim() === product.category);
          if (!section) {
            section = document.createElement('section'); section.className = 'category'; section.id = categoryId;
            const heading = document.createElement('h2'); heading.textContent = product.category;
            const divider = document.createElement('div'); divider.className = 'divider'; section.append(heading, divider); document.querySelector('main').append(section);
            const link = document.createElement('a'); link.href = `#${categoryId}`; link.textContent = product.category; document.getElementById('catnav').append(link);
          }
          node = document.createElement('div'); node.className = 'item';
          const info = document.createElement('div'); info.className = 'item-info'; const name = document.createElement('div'); name.className = 'item-name'; name.textContent = product.name; info.append(name);
          const price = document.createElement('div'); price.className = 'item-price'; price.textContent = (product.price_cents / 100).toFixed(2); node.append(info, price); section.append(node);
        }
        if (node.classList.contains('item-preview') && !node.querySelector('.order-photo')) {
          node.removeAttribute('role'); node.removeAttribute('tabindex'); node.removeAttribute('aria-haspopup'); node.removeAttribute('aria-controls');
          const photo = document.createElement('button'); photo.type = 'button'; photo.className = 'order-photo'; photo.textContent = 'Ver foto';
          photo.setAttribute('aria-label', `Ver foto de ${product.name}`); node.querySelector('.item-info')?.append(photo);
        }
        if (!node || node.querySelector('.order-add')) continue;
        const priceNode = node.querySelector('.item-price'); if (priceNode) priceNode.textContent = (product.price_cents / 100).toFixed(2);
        const button = document.createElement('button'); button.type = 'button'; button.className = 'order-add'; button.textContent = 'Agregar'; button.setAttribute('aria-label', `Agregar ${product.name} al pedido`);
        button.addEventListener('click', e => { e.stopPropagation(); add(product); fab.focus({ preventScroll: true }); });
        node.append(button);
        if (!product.available) { button.disabled = true; button.textContent = 'Agotado'; }
      }
    } catch { /* Keep the menu readable; adding items remains disabled until the shared service is available. */ }
  }
  fab.addEventListener('click', renderCart);
  initialize();
})();







