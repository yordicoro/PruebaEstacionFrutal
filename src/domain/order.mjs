export const OrderStatus = Object.freeze({ PENDING:'pending', ACCEPTED:'accepted', PREPARING:'preparing', READY:'ready', DELIVERED:'delivered', PAID:'paid', CANCELLED:'cancelled' });
const transitions = { pending:new Set(['accepted','cancelled']), accepted:new Set(['preparing','cancelled']), preparing:new Set(['ready','cancelled']), ready:new Set(['delivered','cancelled']), delivered:new Set(['cancelled']), paid:new Set(), cancelled:new Set() };
export function validateOrderItems(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 40) throw new Error('Agrega entre 1 y 40 productos.');
  return items.map(item => { const productId=String(item.productId||'').trim(), quantity=Number(item.quantity), notes=String(item.notes||'').trim(); if(!productId||!Number.isInteger(quantity)||quantity<1||quantity>99) throw new Error('Revisa los productos y cantidades.'); if(notes.length>180) throw new Error('La nota no puede superar 180 caracteres.'); return {productId,quantity,notes}; });
}
export function canTransition(from,to,role) { if(!transitions[from]?.has(to)) return false; if(to==='cancelled') return role==='admin'||(role==='waiter'&&from==='pending'); if(to==='paid') return role==='admin'; return role==='waiter'||role==='admin'; }
export function validateTableNumber(value) { const table=Number(value); if(!Number.isInteger(table)||table<1||table>20) throw new Error('Selecciona una mesa del 1 al 20.'); return table; }
