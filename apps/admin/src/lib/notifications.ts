// SPDX-License-Identifier: AGPL-3.0-only
import type { Campaign, CampaignAudience, CampaignInput, CampaignStatus } from '@/api/types';

export const MAX_HEADLINE = 80;
export const MAX_TEXT = 240;

export const STATUS_LOOKS: Record<
  CampaignStatus,
  { label: string; tone: 'neutral' | 'info' | 'primary' | 'success' | 'warning' }
> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  SCHEDULED: { label: 'Scheduled', tone: 'info' },
  SENDING: { label: 'Sending', tone: 'primary' },
  SENT: { label: 'Sent', tone: 'success' },
  CANCELLED: { label: 'Held back', tone: 'warning' },
};

export const AUDIENCE_LABELS: Record<CampaignAudience, string> = {
  EVERYONE: 'Everyone',
  SUBSCRIBERS: 'Subscribers',
  NOT_SUBSCRIBED: 'Viewers without a subscription',
  PLAN: 'Subscribers of one plan',
};

/** Whom a message goes to, in words: "Subscribers of Premium". */
export function audienceLabel(campaign: Pick<Campaign, 'audience' | 'plan'>): string {
  return campaign.audience === 'PLAN'
    ? `Subscribers of ${campaign.plan?.name ?? 'a plan that is gone'}`
    : AUDIENCE_LABELS[campaign.audience];
}

/** What a device says it is, in words. An app's own word is shown as sent. */
export function platformLabel(platform: string): string {
  return (
    {
      web: 'Browsers',
      android: 'Android phones and tablets',
      'android-tv': 'Android TV',
      ios: 'iPhone and iPad',
      tvos: 'Apple TV',
    }[platform] ?? platform
  );
}

export const TOPIC_LABELS: Record<string, string> = {
  NEW_EPISODES: 'New episodes',
  NEW_TITLES: 'New titles',
  ANNOUNCEMENTS: 'Message',
};

/** What a message leads to. */
export type LinkKind = 'none' | 'title' | 'page';

/** A message while it is written. */
export interface CampaignForm {
  title: string;
  body: string;
  linkKind: LinkKind;
  linked: { id: string; name: string } | null;
  link: string;
  audience: CampaignAudience;
  planId: string;
  /** "now", or "later" with a local date and time as an input of that kind holds it. */
  when: 'now' | 'later';
  at: string;
}

const two = (value: number) => String(value).padStart(2, '0');

/** A moment as an input for a local date and time holds it: "2026-12-24T20:00". */
export function toLocalInput(date: Date): string {
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}T${two(date.getHours())}:${two(date.getMinutes())}`;
}

export function emptyForm(now: Date = new Date()): CampaignForm {
  // The next full hour is a sensible first guess for "later".
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1);
  return {
    title: '',
    body: '',
    linkKind: 'none',
    linked: null,
    link: '',
    audience: 'EVERYONE',
    planId: '',
    when: 'now',
    at: toLocalInput(next),
  };
}

export function formOf(campaign: Campaign, now: Date = new Date()): CampaignForm {
  const later = campaign.scheduledAt !== null && Date.parse(campaign.scheduledAt) > now.getTime();
  return {
    ...emptyForm(now),
    title: campaign.title,
    body: campaign.body,
    linkKind: campaign.linked ? 'title' : campaign.link ? 'page' : 'none',
    linked: campaign.linked ? { id: campaign.linked.id, name: campaign.linked.name } : null,
    link: campaign.link ?? '',
    audience: campaign.audience,
    planId: campaign.plan?.id ?? '',
    when: later ? 'later' : 'now',
    ...(later ? { at: toLocalInput(new Date(campaign.scheduledAt as string)) } : {}),
  };
}

/** What stands in the way of saving a message. Null: nothing. */
export function formProblem(form: CampaignForm, now: Date = new Date()): string | null {
  if (!form.title.trim()) {
    return 'Give the message a headline.';
  }
  if (form.title.trim().length > MAX_HEADLINE) {
    return `The headline is longer than ${MAX_HEADLINE} characters.`;
  }
  if (!form.body.trim()) {
    return 'Write what the message says.';
  }
  if (form.body.trim().length > MAX_TEXT) {
    return `The text is longer than ${MAX_TEXT} characters.`;
  }
  if (form.linkKind === 'title' && !form.linked) {
    return 'Choose the title the message leads to.';
  }
  if (form.linkKind === 'page' && !/^\/(?!\/)\S*$/.test(form.link.trim())) {
    return 'The page is a path on your website that starts with "/", such as "/plans".';
  }
  if (form.audience === 'PLAN' && !form.planId) {
    return 'Choose the plan.';
  }
  if (form.when === 'later') {
    const at = Date.parse(form.at);
    if (!Number.isFinite(at)) {
      return 'Say when the message is to be sent.';
    }
    if (at <= now.getTime()) {
      return 'The time is in the past. Choose a later one, or send now.';
    }
  }
  return null;
}

export function toInput(form: CampaignForm): CampaignInput {
  return {
    title: form.title.trim(),
    body: form.body.trim(),
    titleId: form.linkKind === 'title' ? (form.linked?.id ?? null) : null,
    link: form.linkKind === 'page' ? form.link.trim() : null,
    audience: form.audience,
    planId: form.audience === 'PLAN' ? form.planId || null : null,
    scheduledAt: form.when === 'later' ? new Date(form.at).toISOString() : null,
  };
}

/** A share of the viewers a message was made for, as "62 %". "–" when it was made for nobody. */
export function shareOf(part: number, recipients: number): string {
  return recipients > 0 ? `${Math.round((part / recipients) * 100)} %` : '–';
}

/** The share of viewers who can be reached on a device, as a sentence. */
export function reachSentence(reach: { viewers: number; withDevice: number }): string {
  if (reach.viewers === 0) {
    return 'Nobody is in this audience right now.';
  }
  const viewers = `${reach.viewers.toLocaleString('en')} ${reach.viewers === 1 ? 'viewer' : 'viewers'}`;
  return reach.withDevice === 0
    ? `${viewers}. None has a device that takes notifications: they find it in their list on the website.`
    : `${viewers}, ${reach.withDevice.toLocaleString('en')} of them on a device. The others find it in their list on the website.`;
}
