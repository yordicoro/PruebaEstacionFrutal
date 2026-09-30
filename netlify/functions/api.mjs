import { createCustomerOrder } from '../../src/application/create-order.mjs';
import { validateOrderItems, validateTableNumber, canTransition } from '../../src/domain/order.mjs';
import { createSupabaseOrderRepository } from '../../src/infrastructure/supabase-order-repository.mjs';

const json = (statusCode, body) => ({ statusCode, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...(process.env.SITE_ORIGIN ? { 'access-control-allow-origin': process.env.SITE_ORIGIN, vary: 'Origin' } : {}) }, body: JSON.stringify(body) });
const env = () => {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Falta configurar la conexión segura de la base de datos.');
  return { url: url.replace(/\/$/, ''), key };
};
async function db(path, options = {}) {
  const { url, key } = env();
  const response = await fetch(`${url}/rest/v1/${path}`, { ...options, headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json', ...options.headers } });
  const body = await response.text();
  if (!response.ok) throw new Error('No se pudo completar la operación.');
  return body ? JSON.parse(body) : null;
}
async function rpc(name, args) { return db(`rpc/${name}`, { method: 'POST', body: JSON.stringify(args) }); }
const orderRepository = createSupabaseOrderRepository(rpc, db);
async function staff(event, roles = ['waiter', 'admin']) {
  const token = event.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) throw Object.assign(new Error('Inicia sesión para continuar.'), { status: 401 });
  const { url, key } = env();
  const verified = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, authorization: `Bearer ${token}` } });
  if (!verified.ok) throw Object.assign(new Error('La sesión venció. Inicia sesión nuevamente.'), { status: 401 });
  const user = await verified.json();
  const rows = await db(`staff_users?select=role,active&id=eq.${encodeURIComponent(user.id)}&limit=1`);
  const profile = rows?.[0];
  if (!profile?.active || !roles.includes(profile.role)) throw Object.assign(new Error('No tienes permiso para esta operación.'), { status: 403 });
  return { id: user.id, role: profile.role };
}
const bodyOf = event => event.body ? JSON.parse(event.body) : {};
export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: { ...(process.env.SITE_ORIGIN ? { 'access-control-allow-origin': process.env.SITE_ORIGIN } : {}), 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS' }, body: '' };
  try {
    const path = event.path.replace(/^.*?\/api/, '').replace(/\/$/, '') || '/';
    if (event.httpMethod === 'GET' && path === '/catalog') {
      return json(200, await db('products?select=id,catalog_key,name,category,description,price_cents,available,image_url&order=category,name'));
    }
    if (event.httpMethod === 'GET' && path === '/order-status') {
      const token=event.queryStringParameters?.token;
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token||'')) return json(400,{error:'No se encontró una referencia válida.'});
      return json(200,await rpc('customer_order_status',{p_token:token}));
    }
    if (event.httpMethod === 'POST' && path === '/orders') {
      const input = bodyOf(event);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.idempotencyKey || '')) return json(400, { error: 'Actualiza la página y vuelve a intentar.' });
      const order = await createCustomerOrder(orderRepository)({ items: input.items, idempotencyKey: input.idempotencyKey });
      return json(201, order);
    }
    if (event.httpMethod === 'POST' && path === '/login') {
      const { email, password } = bodyOf(event); const { url, key } = env();
      if (typeof email !== 'string' || typeof password !== 'string' || password.length < 1) return json(400, { error: 'Completa usuario y contraseña.' });
      const login = await fetch(`${url}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: key, 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
      if (!login.ok) return json(401, { error: 'Usuario o contraseña incorrectos.' });
      const session = await login.json();
      const users = await db(`staff_users?select=role,active&id=eq.${encodeURIComponent(session.user.id)}&limit=1`);
      if (!users?.[0]?.active) return json(403, { error: 'La cuenta está desactivada.' });
      return json(200, { accessToken: session.access_token, expiresIn: session.expires_in, role: users[0].role, email: session.user.email });
    }
    if (event.httpMethod === 'GET' && path === '/staff/products') {
      await staff(event, ['admin']);
      return json(200, await db('products?select=id,catalog_key,name,category,description,price_cents,available,image_url&order=category,name'));
    }
    if (event.httpMethod === 'POST' && path === '/staff/products') {
      const actor = await staff(event, ['admin']); const data = bodyOf(event);
      if (!data.catalog_key || !data.name || !data.category || !Number.isInteger(data.price_cents) || data.price_cents < 0) return json(400, { error: 'Completa producto, categoría y precio válido.' });
      const saved = await db('products?on_conflict=catalog_key', { method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify({ catalog_key: data.catalog_key, name: data.name, category: data.category, description: data.description || '', price_cents: data.price_cents, available: data.available !== false, image_url: data.image_url || null }) });
      await db('audit_events', { method: 'POST', body: JSON.stringify({ actor_id: actor.id, action: 'product-saved', entity_type: 'product', entity_id: saved?.[0]?.id || data.catalog_key }) });
      return json(200, saved?.[0]);
    }
    if (event.httpMethod === 'GET' && path === '/staff/users') {
      await staff(event, ['admin']);
      const profiles = await db('staff_users?select=id,role,active,created_at&order=created_at');
      const { url, key } = env(); const auth = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1000`, { headers: { apikey:key, authorization:`Bearer ${key}` } });
      if (!auth.ok) throw new Error('No se pudo consultar las cuentas.');
      const authUsers = await auth.json(); const emails = new Map((authUsers.users || []).map(user => [user.id,user.email]));
      return json(200, profiles.map(user => ({ ...user, email: emails.get(user.id) || '' })));
    }
    if (event.httpMethod === 'POST' && path === '/staff/users') {
      const actor = await staff(event, ['admin']); const data = bodyOf(event);
      if (data.action === 'deactivate' || data.action === 'activate') {
        const profile=(await db(`staff_users?select=id,role&id=eq.${encodeURIComponent(data.userId)}&limit=1`))?.[0];
        if(!profile||profile.role!=='waiter') return json(404,{error:'No se encontró la cuenta de mesero.'});
        await db(`staff_users?id=eq.${encodeURIComponent(data.userId)}`,{method:'PATCH',headers:{prefer:'return=minimal'},body:JSON.stringify({active:data.action==='activate'})});
        await db('audit_events',{method:'POST',body:JSON.stringify({actor_id:actor.id,action:data.action==='activate'?'waiter-activated':'waiter-deactivated',entity_type:'staff-user',entity_id:data.userId})});
        return json(200,{ok:true});
      }
      if (data.action === 'reset-password') {
        if(typeof data.password!=='string'||data.password.length<12) return json(400,{error:'La contraseña nueva debe tener al menos 12 caracteres.'});
        const profile=(await db(`staff_users?select=id,role&id=eq.${encodeURIComponent(data.userId)}&limit=1`))?.[0];
        if(!profile||profile.role!=='waiter') return json(404,{error:'No se encontró la cuenta de mesero.'});
        const {url,key}=env();const changed=await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(data.userId)}`,{method:'PUT',headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({password:data.password})});
        if(!changed.ok) throw new Error('No se pudo cambiar la contraseña.');
        await db('audit_events',{method:'POST',body:JSON.stringify({actor_id:actor.id,action:'waiter-password-reset',entity_type:'staff-user',entity_id:data.userId})});
        return json(200,{ok:true});
      }
      if (!/^\S+@\S+\.\S+$/.test(data.email || '') || typeof data.password !== 'string' || data.password.length < 12 || data.role !== 'waiter') return json(400, { error: 'Para crear un mesero ingresa correo y contraseña de al menos 12 caracteres.' });
      const { url, key } = env();
      const response = await fetch(`${url}/auth/v1/admin/users`, { method: 'POST', headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ email: data.email, password: data.password, email_confirm: true }) });
      if (!response.ok) return json(400, { error: 'No se pudo crear la cuenta. Verifica que el correo no esté registrado.' });
      const created = await response.json();
      await db('staff_users', { method: 'POST', body: JSON.stringify({ id: created.id, role: 'waiter', active: true }) });
      await db('audit_events', { method: 'POST', body: JSON.stringify({ actor_id: actor.id, action: 'waiter-created', entity_type: 'staff-user', entity_id: created.id }) });
      return json(201, { id: created.id, email: created.email, role: 'waiter' });
    }
    if (event.httpMethod === 'GET' && path === '/staff/cash') {
      await staff(event, ['admin']);
      return json(200, (await db('cash_sessions?select=*&closed_at=is.null&limit=1'))?.[0] || null);
    }
    if (event.httpMethod === 'GET' && path === '/staff/orders') {
      const actor = await staff(event);
      const code = event.queryStringParameters?.code;
      if (code) return json(200, await orderRepository.findByCode(code, actor.id));
      return json(200, await orderRepository.listActive(actor.id));
    }
    if (event.httpMethod === 'POST' && path === '/staff/orders') {
      const actor = await staff(event); const data = bodyOf(event);
      const items = validateOrderItems(data.items); const table = validateTableNumber(data.tableNumber);
      return json(201, await orderRepository.createForStaff({ items, tableNumber: table, actor: actor.id }));
    }
    if (event.httpMethod === 'POST' && path === '/staff/orders/action') {
      const actor = await staff(event); const data = bodyOf(event);
      if (data.action === 'assign-table') return json(200, await orderRepository.assignTable({ orderId: data.orderId, tableNumber: validateTableNumber(data.tableNumber), actor: actor.id }));
      if (data.action === 'print') return json(200, await orderRepository.recordPrint({ orderId: data.orderId, actor: actor.id }));
      if (data.action === 'transition') {
        const order = (await db(`orders?select=id,status&id=eq.${encodeURIComponent(data.orderId)}&limit=1`))?.[0];
        if (!order || !canTransition(order.status, data.status, actor.role)) throw Object.assign(new Error('Cambio de estado no permitido.'), { status: 403 });
        return json(200, await orderRepository.changeStatus({ orderId: order.id, status: data.status, reason: String(data.reason || '').slice(0, 240), actor: actor.id }));
      }
      if (data.action === 'pay' && actor.role === 'admin') return json(200, await orderRepository.recordPayment({ orderId: data.orderId, payments: data.payments, actor: actor.id }));
      if (data.action === 'open-cash' && actor.role === 'admin') return json(201, await rpc('open_cash_session', { p_amount_cents: data.amountCents, p_actor: actor.id }));
      if (data.action === 'close-cash' && actor.role === 'admin') return json(200, await rpc('close_cash_session', { p_session: data.sessionId, p_counted_cents: data.countedCents, p_note: String(data.note || '').slice(0, 500), p_actor: actor.id }));
      return json(400, { error: 'Acción desconocida o sin permisos.' });
    }
    if (event.httpMethod === 'GET' && path === '/staff/sales') {
      await staff(event, ['admin']);
      const from = event.queryStringParameters?.from, to = event.queryStringParameters?.to;
      return json(200, await rpc('sales_summary', { p_from: from || null, p_to: to || null }));
    }
    return json(404, { error: 'No se encontró la operación solicitada.' });
  } catch (error) {
    const status = error.status || (/Falta configurar/.test(error.message) ? 503 : /productos|cantidades|nota|mesa/i.test(error.message) ? 400 : 500);
    return json(status, { error: status === 500 ? 'No se pudo completar la operación. Inténtalo nuevamente.' : error.message });
  }
}










