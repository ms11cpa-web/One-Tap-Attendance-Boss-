/** Campus campaign deadlines are inclusive through 23:59:59 Asia/Dhaka. */
export type CampaignState = 'active' | 'expired' | 'archived';

export function dhakaCalendarDate(instant: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function effectiveCampaignStatus(status: string, dueDate: string, today: string): CampaignState {
  if (status === 'archived') return 'archived';
  return dueDate < today ? 'expired' : 'active';
}

export function campaignAcceptsWork(status: string, dueDate: string, today: string): boolean {
  return effectiveCampaignStatus(status, dueDate, today) === 'active';
}
