// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';
import { paginationSchema } from '../common/pagination.js';

const platform = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9-]{0,30}$/, 'A short word such as "web", "android-tv" or "ios"');

const shared = {
  /** What the device is: "web", "android", "android-tv", "ios". */
  platform,
  appVersion: z.string().trim().min(1).max(40).optional(),
  /** The language the device shows its texts in, such as "de". */
  language: z.string().trim().min(2).max(20).optional(),
};

/**
 * A device that wants notifications. A browser sends what
 * `PushManager.subscribe()` gave it, an app the registration token Firebase
 * gave it.
 */
export const registerDeviceSchema = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('WEB'),
    subscription: z.object({
      endpoint: z.url().max(2000),
      keys: z.object({
        p256dh: z.string().min(80).max(100),
        auth: z.string().min(16).max(40),
      }),
    }),
    ...shared,
  }),
  z.object({
    provider: z.literal('FCM'),
    token: z.string().trim().min(20).max(4096),
    ...shared,
  }),
]);
export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;

export const unregisterTokenSchema = z.object({
  provider: z.enum(['WEB', 'FCM']),
  /** The registration token, or for a browser the address of its subscription. */
  token: z.string().min(1).max(4096),
});
export type UnregisterTokenInput = z.infer<typeof unregisterTokenSchema>;

/** Which kinds of notification the viewer wants. Kinds left out stay as they are. */
export const topicsSchema = z.object({
  topics: z
    .object({
      NEW_EPISODES: z.boolean(),
      NEW_TITLES: z.boolean(),
      ANNOUNCEMENTS: z.boolean(),
    })
    .partial(),
});
export type TopicsInput = z.infer<typeof topicsSchema>;

export const listNotificationsSchema = z.object({
  /** The id of the oldest notification already shown. */
  before: z.uuid().optional(),
});
export type ListNotificationsInput = z.infer<typeof listNotificationsSchema>;

/** The notifications to mark as seen. Without ids: all of them. */
export const readSchema = z.object({ ids: z.array(z.uuid()).min(1).max(200).optional() });
export type ReadInput = z.infer<typeof readSchema>;

// --- The panel -----------------------------------------------------------------

export const CAMPAIGN_AUDIENCES = ['EVERYONE', 'SUBSCRIBERS', 'NOT_SUBSCRIBED', 'PLAN'] as const;

const campaignFields = {
  title: z.string().trim().min(1, 'Give the message a headline').max(80),
  body: z.string().trim().min(1, 'Write what the message says').max(240),
  /** A title of the catalog the message leads to. Its picture is shown with it. */
  titleId: z.uuid().nullable(),
  /** Or a page of the website, as a path such as "/plans". */
  link: z
    .string()
    .trim()
    .max(300)
    .regex(/^\/(?!\/)[^\s]*$/, 'A path on your website that starts with "/", such as "/plans"')
    .nullable(),
  audience: z.enum(CAMPAIGN_AUDIENCES),
  planId: z.uuid().nullable(),
  /** When it is sent. Null: when "Send" is pressed. */
  scheduledAt: z.iso.datetime({ offset: true }).nullable(),
};

const checkCampaign = (
  value: {
    titleId?: string | null;
    link?: string | null;
    audience?: string;
    planId?: string | null;
  },
  context: z.RefinementCtx,
) => {
  if (value.titleId && value.link) {
    context.addIssue({
      code: 'custom',
      path: ['link'],
      message: 'A message leads to a title or to a page, not to both',
    });
  }
  if (value.audience === 'PLAN' && !value.planId) {
    context.addIssue({ code: 'custom', path: ['planId'], message: 'Choose the plan' });
  }
};

export const createCampaignSchema = z
  .object({
    title: campaignFields.title,
    body: campaignFields.body,
    titleId: campaignFields.titleId.optional(),
    link: campaignFields.link.optional(),
    audience: campaignFields.audience.default('EVERYONE'),
    planId: campaignFields.planId.optional(),
    scheduledAt: campaignFields.scheduledAt.optional(),
  })
  .superRefine(checkCampaign);
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

export const updateCampaignSchema = z.object(campaignFields).partial().superRefine(checkCampaign);
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;

export const listCampaignsSchema = paginationSchema.extend({
  status: z.enum(['DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED']).optional(),
});
export type ListCampaignsInput = z.infer<typeof listCampaignsSchema>;

export const audienceSchema = z
  .object({ audience: z.enum(CAMPAIGN_AUDIENCES), planId: z.uuid().optional() })
  .superRefine(checkCampaign);
export type AudienceInput = z.infer<typeof audienceSchema>;

/** Sends a message to one viewer only, to see how it arrives. */
export const testSendSchema = z.object({ email: z.email().max(320) });
export type TestSendInput = z.infer<typeof testSendSchema>;

export const fcmKeySchema = z.object({
  /** The whole JSON file of the service account, as text. */
  serviceAccount: z.string().min(2).max(20_000),
});
export type FcmKeyInput = z.infer<typeof fcmKeySchema>;

export const automaticSchema = z
  .object({ newEpisodes: z.boolean(), newTitles: z.boolean() })
  .partial();
export type AutomaticInput = z.infer<typeof automaticSchema>;
