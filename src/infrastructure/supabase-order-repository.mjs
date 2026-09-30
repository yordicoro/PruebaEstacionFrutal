// PostgreSQL RPC adapter. Domain and application code depend on this contract, not PostgREST.
export function createSupabaseOrderRepository(rpc, db) {
  return {
    create: ({ items, origin, idempotencyKey }) => rpc('create_order', { p_items: items, p_origin: origin, p_idempotency: idempotencyKey || null }),
    createForStaff: ({ items, tableNumber, actor }) => rpc('create_staff_order', { p_items: items, p_table: tableNumber, p_actor: actor }),
    findStatus: async id => (await db(`orders?select=id,status&id=eq.${encodeURIComponent(id)}&limit=1`))?.[0] || null,
    findByCode: (code, actor) => rpc('lookup_order_by_code', { p_code: code, p_actor: actor }),
    listActive: actor => rpc('list_active_orders', { p_actor: actor }),
    assignTable: ({ orderId, tableNumber, actor }) => rpc('assign_order_table', { p_order: orderId, p_table: tableNumber, p_actor: actor }),
    changeStatus: ({ orderId, status, reason, actor }) => rpc('transition_order', { p_order: orderId, p_status: status, p_reason: reason, p_actor: actor }),
    recordPrint: ({ orderId, actor }) => rpc('record_order_print', { p_order: orderId, p_actor: actor }),
    recordPayment: ({ orderId, payments, actor }) => rpc('record_payment', { p_order: orderId, p_payments: payments, p_actor: actor })
  };
}
