import { validateOrderItems } from '../domain/order.mjs';

export function createCustomerOrder(orderRepository) {
  return async input => {
    const items = validateOrderItems(input.items);
    return orderRepository.create({ items, origin: 'customer', idempotencyKey: input.idempotencyKey });
  };
}

export function createWaiterOrder(orderRepository) {
  return async ({ items, tableNumber, actor }) => {
    const validItems = validateOrderItems(items);
    return orderRepository.createForStaff({ items: validItems, tableNumber, actor });
  };
}
