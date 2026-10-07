export function buildSalesMetricsQuery() {
  return `
    with outreached as (
      select distinct on (lead_id)
        lead_id,
        lower(coalesce(details->>'delivery_status', '')) as event_delivery_status
      from sales_automation_events
      where event_type = 'outreach_sent' and lead_id is not null
      order by lead_id, created_at desc
    ), message_rollup as (
      select
        o.lead_id,
        count(m.id) filter (where m.direction = 'outbound')::int as outbound_parts,
        count(m.id) filter (where m.direction = 'inbound')::int as inbound_messages,
        bool_or(m.direction = 'inbound') as responded,
        bool_or(m.direction = 'outbound' and lower(coalesce(m.metadata->>'delivery_status', '')) in ('delivered','delivery_ack','read','read_ack','played')) as message_delivered,
        bool_or(m.direction = 'outbound' and lower(coalesce(m.metadata->>'delivery_status', '')) in ('read','read_ack','played')) as message_read,
        bool_or(m.direction = 'outbound' and m.status = 'failed') as message_failed
      from outreached o
      left join sales_messages m on m.lead_id = o.lead_id
      group by o.lead_id
    ), contact_rollup as (
      select
        o.lead_id,
        l.stage,
        coalesce(m.outbound_parts, 0) as outbound_parts,
        coalesce(m.inbound_messages, 0) as inbound_messages,
        coalesce(m.responded, false) as responded,
        o.event_delivery_status in ('delivered','delivery_ack','read','read_ack','played') or coalesce(m.message_delivered, false) as delivered,
        o.event_delivery_status in ('read','read_ack','played') or coalesce(m.message_read, false) as read,
        o.event_delivery_status = 'failed' or coalesce(m.message_failed, false) as failed
      from outreached o
      join sales_leads l on l.id = o.lead_id
      left join message_rollup m on m.lead_id = o.lead_id
    ), totals as (
      select
        count(*)::int as outreaches,
        count(*) filter (where delivered)::int as delivered_contacts,
        count(*) filter (where read)::int as read_contacts,
        count(*) filter (where responded)::int as responding_contacts,
        coalesce(sum(inbound_messages), 0)::int as inbound_messages,
        count(*) filter (where responded and stage in ('engaged','needs_discovery','demo_requested','price_requested','competitor_identified','followup_scheduled','human_handoff','won'))::int as interested_contacts,
        count(*) filter (where stage = 'demo_requested')::int as demos,
        count(*) filter (where stage = 'not_interested')::int as not_interested,
        count(*) filter (where stage = 'opted_out')::int as opt_outs,
        count(*) filter (where failed and not delivered)::int as delivery_failures,
        coalesce(sum(outbound_parts), 0)::int as outbound_message_parts
      from contact_rollup
    )
    select
      totals.*,
      case when outreaches = 0 then 0 else round(delivered_contacts * 100.0 / outreaches, 1) end::float8 as delivery_rate,
      case when outreaches = 0 then 0 else round(read_contacts * 100.0 / outreaches, 1) end::float8 as read_rate,
      case when outreaches = 0 then 0 else round(responding_contacts * 100.0 / outreaches, 1) end::float8 as reply_rate
    from totals
  `;
}
