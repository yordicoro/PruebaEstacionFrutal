create extension if not exists pgcrypto;

create table if not exists public.staff_users (
  id uuid primary key references auth.users(id) on delete restrict,
  role text not null check (role in ('waiter','admin')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  catalog_key text not null unique,
  name text not null,
  category text not null,
  description text not null default '',
  price_cents integer not null check (price_cents >= 0),
  available boolean not null default true,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  code char(4),
  idempotency_key uuid,
  customer_token uuid,
  code_expires_at timestamptz,
  origin text not null check (origin in ('customer','waiter')),
  status text not null check (status in ('pending','accepted','preparing','ready','delivered','paid','cancelled')),
  table_number smallint check (table_number between 1 and 20),
  print_count integer not null default 0 check (print_count >= 0),
  total_cents integer not null check (total_cents >= 0),
  created_by uuid references public.staff_users(id),
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);
alter table public.orders add column if not exists idempotency_key uuid;
alter table public.orders add column if not exists customer_token uuid;
alter table public.orders add column if not exists print_count integer not null default 0;
create unique index if not exists orders_customer_token_idx on public.orders(customer_token) where customer_token is not null;
create unique index if not exists orders_idempotency_key_idx on public.orders(idempotency_key) where idempotency_key is not null;
create index if not exists orders_active_idx on public.orders(status, created_at desc) where status not in ('paid','cancelled');
create index if not exists orders_active_code_idx on public.orders(code, code_expires_at) where code is not null;
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  product_id uuid references public.products(id),
  product_name text not null,
  quantity smallint not null check (quantity between 1 and 99),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  note text not null default '',
  line_total_cents integer generated always as (quantity * unit_price_cents) stored
);
create index if not exists order_items_order_idx on public.order_items(order_id);
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  method text not null check (method in ('cash','card','transfer','other')),
  reference text not null default '',
  actor_id uuid not null references public.staff_users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  opening_cents integer not null check (opening_cents >= 0),
  opened_by uuid not null references public.staff_users(id),
  opened_at timestamptz not null default now(),
  counted_cents integer check (counted_cents >= 0),
  expected_cents integer,
  difference_cents integer,
  note text not null default '',
  closed_by uuid references public.staff_users(id),
  closed_at timestamptz
);
create unique index if not exists one_open_cash_session on public.cash_sessions ((true)) where closed_at is null;
alter table public.payments add column if not exists cash_session_id uuid references public.cash_sessions(id);
create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references public.staff_users(id),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.staff_users enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.cash_sessions enable row level security;
alter table public.audit_events enable row level security;
-- All application reads/writes pass through the Netlify function using the service role secret.
-- Never place SUPABASE_SERVICE_ROLE_KEY in index.html, panel.html, or browser JavaScript.

create or replace function public.create_order(p_items jsonb,p_origin text default 'customer',p_table smallint default null,p_actor uuid default null,p_idempotency uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order orders%rowtype; v_code text; v_customer_token uuid; v_total integer := 0; v_item jsonb; v_product products%rowtype; v_qty integer; v_note text;
begin
  if p_origin not in ('customer','waiter') then raise exception 'Origen inválido'; end if;
  perform pg_advisory_xact_lock(190729);
  if p_origin='customer' and p_idempotency is not null then
    select * into v_order from orders where idempotency_key=p_idempotency;
    if found then return jsonb_build_object('id',v_order.id,'code',v_order.code,'customerToken',v_order.customer_token,'codeExpiresAt',v_order.code_expires_at,'status',v_order.status,'tableNumber',v_order.table_number,'totalCents',v_order.total_cents,'createdAt',v_order.created_at); end if;
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 40 then raise exception 'Productos inválidos'; end if;
  if p_origin = 'waiter' and (p_actor is null or p_table is null or p_table < 1 or p_table > 20) then raise exception 'Mesa inválida'; end if;
  if p_origin = 'customer' then
    for i in 1..100 loop
      v_code := lpad(floor(random() * 10000)::int::text, 4, '0');
      exit when not exists(select 1 from orders where code = v_code and code_expires_at > now() and status = 'pending');
    end loop;
    if exists(select 1 from orders where code = v_code and code_expires_at > now() and status = 'pending') then raise exception 'No hay códigos disponibles'; end if;
    v_customer_token := gen_random_uuid();
    insert into orders(code,idempotency_key,customer_token,code_expires_at,origin,status,total_cents) values(v_code,p_idempotency,v_customer_token,now()+interval '30 minutes',p_origin,'pending',0) returning * into v_order;
  else
    insert into orders(origin, status, table_number, total_cents, created_by) values(p_origin, 'accepted', p_table, 0, p_actor) returning * into v_order;
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::int;
    if v_qty < 1 or v_qty > 99 then raise exception 'Cantidad inválida'; end if;
    v_note := left(coalesce(v_item->>'notes',''),180);
    select * into v_product from products where catalog_key = v_item->>'productId' and available = true;
    if not found then raise exception 'Producto no disponible'; end if;
    v_total := v_total + (v_product.price_cents * v_qty);
    insert into order_items(order_id, product_id, product_name, quantity, unit_price_cents, note)
    values(v_order.id, v_product.id, v_product.name, v_qty, v_product.price_cents, v_note);
  end loop;
  update orders set total_cents = v_total where id = v_order.id returning * into v_order;
  insert into audit_events(actor_id,action,entity_type,entity_id,details) values(p_actor,'order-created','order',v_order.id::text,jsonb_build_object('origin',p_origin,'total_cents',v_total));
  return jsonb_build_object('id',v_order.id,'code',v_order.code,'customerToken',v_order.customer_token,'codeExpiresAt',v_order.code_expires_at,'status',v_order.status,'tableNumber',v_order.table_number,'totalCents',v_order.total_cents,'createdAt',v_order.created_at);
end $$;

create or replace function public.create_staff_order(p_items jsonb,p_table smallint,p_actor uuid) returns jsonb language sql security definer set search_path=public as $$
 select public.create_order(p_items,'waiter',p_table,p_actor)
$$;

create or replace function public.order_json(p_order uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select (to_jsonb(o) - 'customer_token') || jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('name',i.product_name,'quantity',i.quantity,'unitPriceCents',i.unit_price_cents,'lineTotalCents',i.line_total_cents,'note',i.note) order by i.id) from order_items i where i.order_id=o.id),'[]'::jsonb)) from orders o where o.id=p_order
$$;
create or replace function public.lookup_order_by_code(p_code text, p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if p_code !~ '^\d{4}$' then raise exception 'Código inválido'; end if;
  select id into v_id from orders where code=p_code and code_expires_at>now() and status='pending' order by created_at desc limit 1;
  insert into audit_events(actor_id,action,entity_type,entity_id,details) values(p_actor,'order-code-lookup','order',coalesce(v_id::text,'not-found'),jsonb_build_object('code_last_two',right(p_code,2)));
  if v_id is null then return null; end if;
  return order_json(v_id);
end $$;
create or replace function public.customer_order_status(p_token uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('status',status,'tableNumber',table_number,'createdAt',created_at,'code',code,'totalCents',total_cents)
  from orders where customer_token=p_token and created_at>now()-interval '24 hours'
$$;
create or replace function public.list_active_orders(p_actor uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(order_json(o.id) order by o.created_at),'[]'::jsonb) from orders o where o.status not in ('paid','cancelled') and (o.code is null or o.code_expires_at>now())
$$;
create or replace function public.assign_order_table(p_order uuid,p_table smallint,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if p_table<1 or p_table>20 then raise exception 'Mesa inválida'; end if;
 update orders set table_number=p_table,updated_at=now() where id=p_order and status not in ('paid','cancelled');
 if not found then raise exception 'Pedido no disponible'; end if;
 insert into audit_events(actor_id,action,entity_type,entity_id,details) values(p_actor,'table-assigned','order',p_order::text,jsonb_build_object('table',p_table));
 return order_json(p_order);
end $$;
create or replace function public.record_order_print(p_order uuid,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_order orders%rowtype;
begin
 update orders set print_count=print_count+1,updated_at=now() where id=p_order and table_number is not null and status not in ('paid','cancelled') returning * into v_order;
 if not found then raise exception 'Asigna una mesa antes de imprimir'; end if;
 insert into audit_events(actor_id,action,entity_type,entity_id,details) values(p_actor,'order-printed','order',p_order::text,jsonb_build_object('table',v_order.table_number,'print_count',v_order.print_count));
 return jsonb_build_object('printCount',v_order.print_count);
end $$;

create or replace function public.transition_order(p_order uuid,p_status text,p_reason text,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_old text;
begin
 select status into v_old from orders where id=p_order for update;
 if v_old is null then raise exception 'Pedido no encontrado'; end if;
 if not ((v_old='pending' and p_status in ('accepted','cancelled')) or (v_old='accepted' and p_status in ('preparing','cancelled')) or (v_old='preparing' and p_status in ('ready','cancelled')) or (v_old='ready' and p_status in ('delivered','cancelled')) or (v_old='delivered' and p_status='cancelled')) then raise exception 'Transición inválida'; end if;
 if p_status='cancelled' and length(trim(coalesce(p_reason,'')))<3 then raise exception 'Indica el motivo de anulación'; end if;
 update orders set status=p_status,cancel_reason=case when p_status='cancelled' then left(p_reason,240) end,updated_at=now() where id=p_order;
 insert into audit_events(actor_id,action,entity_type,entity_id,details) values(p_actor,'order-status-changed','order',p_order::text,jsonb_build_object('from',v_old,'to',p_status,'reason',left(coalesce(p_reason,''),240)));
 return order_json(p_order);
end $$;
create or replace function public.record_payment(p_order uuid,p_payments jsonb,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_order orders%rowtype; v_pay jsonb; v_sum integer:=0; v_amount integer; v_method text; v_session uuid;
begin
 select * into v_order from orders where id=p_order for update;
 if not found or v_order.status<>'delivered' then raise exception 'Solo se cobran pedidos entregados'; end if;
 if jsonb_typeof(p_payments)<>'array' or jsonb_array_length(p_payments)<1 then raise exception 'Registra al menos un pago'; end if;
 select id into v_session from cash_sessions where closed_at is null order by opened_at desc limit 1 for update;
 if v_session is null then raise exception 'Abre la caja antes de registrar pagos'; end if;
 for v_pay in select value from jsonb_array_elements(p_payments) loop
  v_amount:=(v_pay->>'amountCents')::int; v_method:=v_pay->>'method';
  if v_amount<=0 or v_method not in ('cash','card','transfer','other') then raise exception 'Pago inválido'; end if;
  v_sum:=v_sum+v_amount;
  insert into payments(order_id,cash_session_id,amount_cents,method,reference,actor_id) values(p_order,v_session,v_amount,v_method,left(coalesce(v_pay->>'reference',''),100),p_actor);
 end loop;
 if v_sum<>v_order.total_cents then raise exception 'El pago debe coincidir con el total'; end if;
 update orders set status='paid',paid_at=now(),updated_at=now() where id=p_order;
 insert into audit_events(actor_id,action,entity_type,entity_id,details) values(p_actor,'order-paid','order',p_order::text,jsonb_build_object('total_cents',v_sum));
 return order_json(p_order);
end $$;
create or replace function public.open_cash_session(p_amount_cents integer,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare v cash_sessions%rowtype;
begin
 if p_amount_cents<0 then raise exception 'Monto inválido'; end if;
 insert into cash_sessions(opening_cents,opened_by) values(p_amount_cents,p_actor) returning * into v;
 insert into audit_events(actor_id,action,entity_type,entity_id,details) values(p_actor,'cash-opened','cash-session',v.id::text,jsonb_build_object('opening_cents',p_amount_cents));
 return to_jsonb(v);
end $$;
create or replace function public.close_cash_session(p_session uuid,p_counted_cents integer,p_note text,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare v cash_sessions%rowtype; v_cash integer;
begin
 select * into v from cash_sessions where id=p_session and closed_at is null for update;
 if not found or p_counted_cents<0 then raise exception 'Caja no disponible o conteo inválido'; end if;
 select coalesce(sum(p.amount_cents),0) into v_cash from payments p join orders o on o.id=p.order_id where p.method='cash' and p.cash_session_id=p_session and o.paid_at is not null;
 update cash_sessions set expected_cents=opening_cents+v_cash,counted_cents=p_counted_cents,difference_cents=p_counted_cents-(opening_cents+v_cash),note=left(coalesce(p_note,''),500),closed_by=p_actor,closed_at=now() where id=p_session returning * into v;
 insert into audit_events(actor_id,action,entity_type,entity_id,details) values(p_actor,'cash-closed','cash-session',v.id::text,to_jsonb(v));
 return to_jsonb(v);
end $$;
create or replace function public.sales_summary(p_from timestamptz,p_to timestamptz) returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('orders',count(*),'totalCents',coalesce(sum(o.total_cents),0),'byMethod',coalesce((select jsonb_object_agg(x.method,x.amount) from (select method,sum(amount_cents) amount from payments p where p.created_at>=coalesce(p_from,'-infinity') and p.created_at<coalesce(p_to,'infinity') group by method) x),'{}'::jsonb)) from orders o where o.status='paid' and o.paid_at>=coalesce(p_from,'-infinity') and o.paid_at<coalesce(p_to,'infinity')
$$;

-- Keep every RPC private to the trusted server-side function key.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;












