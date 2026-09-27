import { z } from 'zod';
import { adminClient, type McpActor } from './crm.ts';

const campaignInput = z.object({
  idempotency_key: z.string().trim().min(1).max(128),
  message_body: z.string().trim().min(1).max(10000),
  scheduled_at: z.string().datetime({ offset: true }),
  timezone: z.string().default('Asia/Muscat'),
  category_id: z.string().uuid().optional(),
  condition_id: z.string().uuid().optional(),
  medication_id: z.string().uuid().optional(),
  patient_ids: z.array(z.string().uuid()).min(1).max(1000).optional(),
}).strict();

export const notifications = {
  async create(actor: McpActor, args: Record<string, unknown>) {
    const input = campaignInput.parse(args);
    const { data, error } = await adminClient().rpc('notification_campaign_create', { p_actor: actor.id, p_input: input });
    if (error) throw error;
    return { ...data, delivery: 'queued_only_not_sent' };
  },
  async list() {
    const { data, error } = await adminClient().from('notification_campaigns').select('id, message_body, scheduled_at, timezone, status, requested_by, created_at, category_id, condition_id, medication_id').order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    return data;
  },
  async get(args: Record<string, unknown>) {
    const id = z.string().uuid().parse(args.campaign_id);
    const { data, error } = await adminClient().from('notification_campaigns').select('*, notification_deliveries(*)').eq('id', id).single();
    if (error) throw error;
    return data;
  },
  async claim(actor: McpActor, args: Record<string, unknown>) {
    const limit = z.number().int().min(1).max(100).default(20).parse(args.limit);
    const { data, error } = await adminClient().rpc('notification_claim_due', { p_actor: actor.id, p_limit: limit, p_campaign_id: args.campaign_id ? z.string().uuid().parse(args.campaign_id) : null });
    if (error) throw error;
    return { deliveries: data, instruction: 'Send through the messaging provider with delivery_id as idempotency key, then record its receipt. Never retry an uncertain send automatically.' };
  },
  async result(actor: McpActor, args: Record<string, unknown>) {
    const input = z.object({ delivery_id: z.string().uuid(), status: z.enum(['sent','failed']), external_message_id: z.string().min(1).optional(), error: z.string().min(1).optional() }).strict().parse(args);
    const { data, error } = await adminClient().rpc('notification_delivery_result', { p_actor: actor.id, p_delivery: input.delivery_id, p_status: input.status, p_external_id: input.external_message_id ?? null, p_error: input.error ?? null });
    if (error) throw error;
    return data;
  },
};
