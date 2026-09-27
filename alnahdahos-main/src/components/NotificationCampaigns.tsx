import { useEffect, useState } from 'react';
import { Button } from '@heroui/react/button';
import { supabase } from '../lib/supabase';
import { useI18n } from '../lib/i18n';
import { formatDateTime } from '../lib/format';

type Campaign = { id: string; message_body: string; scheduled_at: string; timezone: string; status: string; requested_by: string; categories: {name_ar:string;name_en:string}|null; conditions: {name_ar:string;name_en:string}|null; medications: {name:string}|null };
type Delivery = { id: string; phone_number: string; consent_snapshot: string; status: string; reason: string|null; sent_at:string|null; failed_at:string|null; external_message_id:string|null; patients: {full_name:string}|null };
const labels: Record<string,string> = {scheduled:'مجدولة',completed:'مكتملة',cancelled:'ملغاة',pending:'لم تُرسل — في الانتظار',sending:'قيد الإرسال — النتيجة غير مؤكدة',sent:'أُرسلت',failed:'فشلت',skipped:'لم تُرسل — مستبعدة',granted:'موافق',denied:'غير موافق',unknown:'غير مؤكد'};
export function NotificationCampaigns() {
  const {locale} = useI18n();
  const ar = locale === 'ar';
  const [rows,setRows] = useState<Campaign[]>([]);
  const [selected,setSelected] = useState<string|null>(null);
  const [deliveries,setDeliveries] = useState<Delivery[]>([]);
  const [error,setError] = useState('');
  async function load() {
    const {data,error:err} = await supabase.from('notification_campaigns').select('id,message_body,scheduled_at,timezone,status,requested_by,categories(name_ar,name_en),conditions(name_ar,name_en),medications(name)').order('created_at',{ascending:false}).limit(100);
    setError(err?.message ?? ''); setRows((data ?? []) as unknown as Campaign[]);
  }
  useEffect(()=>{void load();},[]);
  async function details(id:string) {
    setSelected(id); setDeliveries([]);
    const {data,error:err} = await supabase.from('notification_deliveries').select('id,phone_number,consent_snapshot,status,reason,sent_at,failed_at,external_message_id,patients(full_name)').eq('campaign_id',id).order('created_at');
    setError(err?.message ?? ''); setDeliveries((data ?? []) as unknown as Delivery[]);
  }
  const label=(value:string)=> ar ? labels[value] ?? value : value;
  return <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
    <div className="flex items-center justify-between"><h2 className="font-semibold">{ar?'حملات الإشعارات':'Notification campaigns'}</h2><Button size="sm" variant="secondary" onPress={()=>{void load();if(selected) void details(selected);}}>{ar?'تحديث':'Refresh'}</Button></div>
    <p className="text-sm text-muted">{ar?'الجدولة تحفظ الطلب فقط. يتولى مازن أو موصل الرسائل إرسال المستحق وتسجيل التأكيد. الأوقات بتوقيت جهازك، والمنطقة الزمنية الأصلية مذكورة بجانب الموعد.':'Scheduling stores the request. Mazen or a messaging connector must dispatch due messages and record receipts. Times use your device timezone; the original timezone is shown alongside.'}</p>
    {error && <p role="alert" className="text-danger">{error}</p>}
    {!rows.length && <p className="text-sm text-muted">{ar?'لا توجد حملات بعد':'No campaigns yet'}</p>}
    {rows.map(c=><div key={c.id} className="rounded-lg border border-border p-3 space-y-2">
      <p className="whitespace-pre-wrap">{c.message_body}</p>
      <p className="text-sm">{[c.categories?.[ar?'name_ar':'name_en'],c.conditions?.[ar?'name_ar':'name_en'],c.medications?.name].filter(Boolean).join(' · ')}</p>
      <p className="text-xs text-muted">{formatDateTime(c.scheduled_at,locale)} · {c.timezone} · {label(c.status)} · {ar?'أصدر الأمر':'Requested by'}: {c.requested_by}</p>
      <Button size="sm" variant="ghost" onPress={()=>void details(c.id)}>{ar?'المستهدفون ونتائج الإرسال':'Recipients and delivery results'}</Button>
      {selected===c.id && <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-start text-sm"><thead><tr>{(ar?['المريض','الرقم','الموافقة عند الجدولة','الحالة','وقت النتيجة','التأكيد / السبب']:['Patient','Phone','Consent at scheduling','Status','Result time','Receipt / reason']).map(h=><th key={h} className="p-2 text-start">{h}</th>)}</tr></thead><tbody>{deliveries.map(d=><tr key={d.id} className="border-t border-border"><td className="p-2">{d.patients?.full_name}</td><td dir="ltr">{d.phone_number}</td><td>{label(d.consent_snapshot)}</td><td>{label(d.status)}</td><td>{formatDateTime(d.sent_at ?? d.failed_at,locale)}</td><td>{d.external_message_id ?? d.reason ?? '—'}</td></tr>)}</tbody></table></div>}
    </div>)}
  </section>;
}
