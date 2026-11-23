// SPDX-License-Identifier: AGPL-3.0-only
//
// Generated from the description of the API. Do not edit: run "pnpm openapi".

export interface paths {
    "/v1/admins": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs admins:read. */
        get: operations["Admins_list"];
        put?: never;
        /** @description For a signed-in admin, not for API keys. Needs admins:write. */
        post: operations["Admins_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/admins/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs admins:read. */
        get: operations["Admins_get"];
        put?: never;
        post?: never;
        /**
         * Deactivates the admin and signs them out
         * @description Admins are never deleted, so the audit log stays complete. For a signed-in admin, not for API keys. Needs admins:write.
         */
        delete: operations["Admins_deactivate"];
        options?: never;
        head?: never;
        /** @description For a signed-in admin, not for API keys. Needs admins:write. */
        patch: operations["Admins_update"];
        trace?: never;
    };
    "/v1/admins/{id}/two-factor": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Takes two-factor sign-in off an admin who lost their phone and their recovery codes, and signs them out
         * @description They set it up again after signing in. For a signed-in admin, not for API keys. Needs admins:write.
         */
        delete: operations["Admins_resetTwoFactor"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/analytics/now": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs analytics:read. */
        get: operations["Analytics_now"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/analytics/saved": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs analytics:read. */
        get: operations["SavedTitles_saved"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/analytics/summary": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs analytics:read. */
        get: operations["Analytics_summary"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/analytics/titles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs analytics:read. */
        get: operations["Analytics_titles"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/analytics/titles/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs analytics:read. */
        get: operations["Analytics_title"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/api-keys": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs api-keys:read. */
        get: operations["ApiKeys_list"];
        put?: never;
        /**
         * The response contains the full key
         * @description It is shown this once only. For a signed-in admin, not for API keys. Needs api-keys:write.
         */
        post: operations["ApiKeys_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/api-keys/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** @description For a signed-in admin, not for API keys. Needs api-keys:write. */
        delete: operations["ApiKeys_revoke"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/app-versions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The oldest version of each app that may still connect
         * @description For an admin or an API key. Needs settings:read.
         */
        get: operations["AppVersions_list"];
        /**
         * Sets all rules at once
         * @description An app without a rule is never turned away. For an admin or an API key. Needs settings:write.
         */
        put: operations["AppVersions_save"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/artwork/{file}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Serves a picture
         * @description Public: artwork is shown to visitors who are not signed in. The address never changes for the same picture, so it is cached for good. Open to everyone.
         */
        get: operations["Catalog_artwork"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/assets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs assets:read. */
        get: operations["Assets_list"];
        put?: never;
        /**
         * Creates the asset and returns what the client needs to upload its source file
         * @description For an admin or an API key. Needs assets:write.
         */
        post: operations["Assets_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/assets/{assetId}/subtitles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Adds a subtitle file to a video
         * @description The body is the file itself (.srt, .vtt, .ass or .ssa, up to 5 MB), not a form. It is converted to WebVTT and offered by the player at once. For an admin or an API key. Needs assets:write.
         */
        post: operations["Subtitles_add"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/assets/{assetId}/subtitles/{trackId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** @description For an admin or an API key. Needs assets:write. */
        delete: operations["Subtitles_remove"];
        options?: never;
        head?: never;
        /** @description For an admin or an API key. Needs assets:write. */
        patch: operations["Subtitles_update"];
        trace?: never;
    };
    "/v1/assets/{assetId}/subtitles/{trackId}/file": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The WebVTT file of a track, to read or to download
         * @description For an admin or an API key. Needs assets:read.
         */
        get: operations["Subtitles_file"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/assets/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs assets:read. */
        get: operations["Assets_get"];
        put?: never;
        post?: never;
        /** @description For an admin or an API key. Needs assets:write. */
        delete: operations["Assets_delete"];
        options?: never;
        head?: never;
        /** @description For an admin or an API key. Needs assets:write. */
        patch: operations["Assets_update"];
        trace?: never;
    };
    "/v1/assets/{id}/media": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The generated outputs of an asset: qualities, subtitle tracks and pictures
         * @description For an admin or an API key. Needs assets:read.
         */
        get: operations["Assets_media"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/assets/{id}/playback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Returns signed, short-lived URLs for playing the asset
         * @description For an admin or an API key. Needs assets:read.
         */
        post: operations["Assets_createPlayback"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/assets/{id}/reprocess": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Processes the asset again from its source file and replaces earlier outputs
         * @description Leave the body empty to let the mode be chosen again. For an admin or an API key. Needs assets:write.
         */
        post: operations["Assets_reprocess"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/audit-logs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs audit:read. */
        get: operations["Audit_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Signs an admin in with email and password
         * @description Open to everyone.
         */
        post: operations["Auth_login"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description For a signed-in admin, not for API keys. */
        post: operations["Auth_logout"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The authenticated caller: an admin or an API key, with its permissions
         * @description For an admin or an API key.
         */
        get: operations["Auth_me"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description For a signed-in admin, not for API keys. */
        post: operations["Auth_changePassword"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/setup": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Tells the admin panel whether to show the first-run setup screen
         * @description Open to everyone.
         */
        get: operations["Auth_setupStatus"];
        put?: never;
        /**
         * Creates the first owner
         * @description Available only while no admin exists. Open to everyone.
         */
        post: operations["Auth_setup"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/two-factor": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Where the caller stands with two-factor sign-in
         * @description For a signed-in admin, not for API keys.
         */
        get: operations["Auth_twoFactorStatus"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/two-factor/disable": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Switches it off
         * @description Needs the password and a code. For a signed-in admin, not for API keys.
         */
        post: operations["Auth_twoFactorDisable"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/two-factor/enable": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Switches it on with the first code from the app
         * @description Answers with the recovery codes, once. For a signed-in admin, not for API keys.
         */
        post: operations["Auth_twoFactorConfirm"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/two-factor/recovery-codes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Makes new recovery codes and ends the old ones
         * @description Needs the password and a code. For a signed-in admin, not for API keys.
         */
        post: operations["Auth_twoFactorRecoveryCodes"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/two-factor/setup": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Starts setting it up: answers with the secret for the authenticator app
         * @description For a signed-in admin, not for API keys.
         */
        post: operations["Auth_twoFactorBegin"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/backups": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The settings, how well the installation is protected, and the backups there are
         * @description For an admin or an API key. Needs settings:read.
         */
        get: operations["Backups_overview"];
        put?: never;
        /**
         * Asks for a backup now
         * @description The answer is the backup, waiting to be made. For an admin or an API key. Needs settings:write.
         */
        post: operations["Backups_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/backups/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** @description For an admin or an API key. Needs settings:write. */
        delete: operations["Backups_remove"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/backups/{id}/download": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * A link that downloads the file
         * @description It works for a minute. For an admin or an API key. Needs settings:write.
         */
        post: operations["Backups_download"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/backups/{id}/file": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The file itself
         * @description The token in the address is the permission. Open to everyone.
         */
        get: operations["Backups_file"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/backups/settings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** @description For an admin or an API key. Needs settings:write. */
        put: operations["Backups_updateSettings"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/billing": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs billing:read. */
        get: operations["BillingAdmin_overview"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/billing/revenue": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs billing:read. */
        get: operations["PaymentsAdmin_revenue"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/billing/stripe/check": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Asks Stripe which account the key belongs to: the proof that the key works
         * @description For an admin or an API key. Needs billing:read.
         */
        post: operations["BillingAdmin_checkStripe"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/billing/stripe/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The last messages Stripe sent, newest first
         * @description For an admin or an API key. Needs billing:read.
         */
        get: operations["BillingAdmin_stripeEvents"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/billing/stripe/import-payments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Reads the paid invoices from Stripe into the books
         * @description For an admin or an API key. Needs billing:write.
         */
        post: operations["PaymentsAdmin_importFromStripe"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/billing/stripe/webhook": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Takes the events Stripe reports
         * @description Only Stripe's signature opens it. Open to everyone.
         */
        post: operations["StripeWebhook_receive"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/branding": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs settings:read. */
        get: operations["Branding_get"];
        /** @description For an admin or an API key. Needs settings:write. */
        put: operations["Branding_update"];
        post?: never;
        /**
         * Back to how the site ships: its own name, mark and amber
         * @description For an admin or an API key. Needs settings:write.
         */
        delete: operations["Branding_reset"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/catalog/categories": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The categories of the catalog
         * @description Open to everyone.
         */
        get: operations["PublicCatalog_categories"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/catalog/channels": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The live channels viewers can watch
         * @description Open to everyone.
         */
        get: operations["PublicChannels_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/catalog/channels/{slug}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * One live channel, by the name in its address
         * @description Open to everyone.
         */
        get: operations["PublicChannels_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/catalog/channels/{slug}/playback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * A signed, short-lived address for watching a channel
         * @description Never cached. Open to everyone.
         */
        post: operations["PublicChannels_play"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/catalog/collections": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The collections of the catalog
         * @description Open to everyone.
         */
        get: operations["PublicCatalog_collections"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/catalog/collections/{slug}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * One collection with its titles
         * @description Open to everyone.
         */
        get: operations["PublicCatalog_collection"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/catalog/delivery": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Where video comes from besides the site itself: the edge servers and the tracker
         * @description Open to everyone.
         */
        get: operations["PublicDelivery_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/catalog/delivery/report": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * A player reports how much it got from other viewers and how much from servers
         * @description Open to everyone.
         */
        post: operations["SharingReport_report"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/catalog/episodes/{id}/playback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Asks to play an episode
         * @description The answer holds a signed address, or says what is missing. Open to everyone.
         */
        post: operations["PublicCatalog_playEpisode"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/catalog/genres": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The genres of the catalog
         * @description Open to everyone.
         */
        get: operations["PublicCatalog_genres"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/catalog/guide": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The programme guide of the channels
         * @description Open to everyone.
         */
        get: operations["PublicGuide_guide"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/catalog/home": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The rows of a page, as they are arranged in the panel
         * @description Open to everyone.
         */
        get: operations["PublicCatalog_home"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/catalog/languages": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The languages the catalog can be read in
         * @description Open to everyone.
         */
        get: operations["PublicCatalog_languages"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/catalog/pages/{page}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * A page of the website as it is arranged in the panel: "home", "movies", "series" or "live"
         * @description `custom` is false, and there are no rows, while a page other than the home page was not arranged: clients then show what the page was before. Open to everyone.
         */
        get: operations["PublicCatalog_page"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/catalog/pages/category/{slug}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The page of one category, as the page of categories is arranged: every row holds titles of this category only
         * @description 404 for a category that does not exist or has nothing to watch. Open to everyone.
         */
        get: operations["PublicCatalog_categoryPage"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/catalog/pages/genre/{slug}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The same for one genre
         * @description Open to everyone.
         */
        get: operations["PublicCatalog_genrePage"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/catalog/people/{slug}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * One person with the titles they are part of
         * @description Open to everyone.
         */
        get: operations["PublicCatalog_person"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/catalog/plans": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The plans on offer
         * @description Open to everyone, like the catalog. Open to everyone.
         */
        get: operations["PublicBilling_offered"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/catalog/plays/{id}/beat": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * A report of the player: where it is, and how long it played since the report before
         * @description Sent about every half minute, and when the video is paused, ends or the page is left. Always answers the same, whether the play is known or not. Open to everyone.
         */
        post: operations["Plays_beat"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/catalog/site": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The name, logo, colour and footer of the site
         * @description Public: it is what every visitor sees. Kept for a short time, like the rest of the catalog. Open to everyone.
         */
        get: operations["Branding_site"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/catalog/titles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Published titles: filtered, searched and in pages
         * @description Open to everyone.
         */
        get: operations["PublicCatalog_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/catalog/titles/{slug}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * One title with everything a detail page shows
         * @description Open to everyone.
         */
        get: operations["PublicCatalog_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/catalog/titles/{slug}/extras/{id}/playback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Asks to play an extra of a title
         * @description Open to everyone.
         */
        post: operations["PublicCatalog_playExtra"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/catalog/titles/{slug}/playback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Signed, short-lived addresses for playing a movie
         * @description Never cached. Open to everyone.
         */
        post: operations["PublicCatalog_playTitle"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/catalog/titles/{slug}/trailer/playback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Asks to play the trailer of a title
         * @description Open to everyone.
         */
        post: operations["PublicCatalog_playTrailer"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/categories": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs catalog:read. */
        get: operations["Catalog_listCategories"];
        put?: never;
        /** @description For an admin or an API key. Needs catalog:write. */
        post: operations["Catalog_createCategory"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/categories/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** @description For an admin or an API key. Needs catalog:write. */
        delete: operations["Catalog_removeCategory"];
        options?: never;
        head?: never;
        /** @description For an admin or an API key. Needs catalog:write. */
        patch: operations["Catalog_updateCategory"];
        trace?: never;
    };
    "/v1/categories/order": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Puts all categories into a new order
         * @description For an admin or an API key. Needs catalog:write.
         */
        put: operations["Catalog_reorderCategories"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/channels": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs live:read. */
        get: operations["Channels_list"];
        put?: never;
        /** @description For an admin or an API key. Needs live:write. */
        post: operations["Channels_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/channels/{channelId}/programmes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs live:read. */
        get: operations["Guide_listProgrammes"];
        put?: never;
        /** @description For an admin or an API key. Needs live:write. */
        post: operations["Guide_createProgramme"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/channels/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs live:read. */
        get: operations["Channels_get"];
        put?: never;
        post?: never;
        /** @description For an admin or an API key. Needs live:write. */
        delete: operations["Channels_remove"];
        options?: never;
        head?: never;
        /** @description For an admin or an API key. Needs live:write. */
        patch: operations["Channels_update"];
        trace?: never;
    };
    "/v1/channels/{id}/encoder": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * What to enter in an encoder for a pushed channel, with its stream key
         * @description For an admin or an API key. Needs live:write.
         */
        get: operations["Channels_encoder"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/channels/{id}/playback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * A signed address for watching the channel in the panel
         * @description For an admin or an API key. Needs live:read.
         */
        post: operations["Channels_createPlayback"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/channels/{id}/restart": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description For an admin or an API key. Needs live:write. */
        post: operations["Channels_restart"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/channels/{id}/source": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The full address of the source
         * @description It may carry a password, so it needs the right to change channels. For an admin or an API key. Needs live:write.
         */
        get: operations["Channels_source"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/channels/{id}/start": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description For an admin or an API key. Needs live:write. */
        post: operations["Channels_start"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/channels/{id}/stop": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description For an admin or an API key. Needs live:write. */
        post: operations["Channels_stop"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/channels/{id}/stream-key": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Replaces the stream key
         * @description The old one stops working at once. For an admin or an API key. Needs live:write.
         */
        post: operations["Channels_replaceStreamKey"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/channels/probe": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Connects to a source and reports what it carries
         * @description Each call holds a connection for up to 15 seconds, so they are limited. For an admin or an API key. Needs live:write.
         */
        post: operations["Channels_probe"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/collections": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs catalog:read. */
        get: operations["Collections_list"];
        put?: never;
        /** @description For an admin or an API key. Needs catalog:write. */
        post: operations["Collections_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/collections/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs catalog:read. */
        get: operations["Collections_get"];
        put?: never;
        post?: never;
        /** @description For an admin or an API key. Needs catalog:write. */
        delete: operations["Collections_remove"];
        options?: never;
        head?: never;
        /** @description For an admin or an API key. Needs catalog:write. */
        patch: operations["Collections_update"];
        trace?: never;
    };
    "/v1/collections/{id}/titles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** @description For an admin or an API key. Needs catalog:write. */
        put: operations["Collections_setTitles"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/collections/order": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Before ":id", so that "order" is not read as an id
         * @description For an admin or an API key. Needs catalog:write.
         */
        put: operations["Collections_order"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/coupons": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs billing:read. */
        get: operations["Coupons_list"];
        put?: never;
        /** @description For an admin or an API key. Needs billing:write. */
        post: operations["Coupons_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/coupons/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs billing:read. */
        get: operations["Coupons_get"];
        put?: never;
        post?: never;
        /** @description For an admin or an API key. Needs billing:write. */
        delete: operations["Coupons_remove"];
        options?: never;
        head?: never;
        /** @description For an admin or an API key. Needs billing:write. */
        patch: operations["Coupons_update"];
        trace?: never;
    };
    "/v1/coupons/{id}/redemptions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Who used the code, the latest first
         * @description For an admin or an API key. Needs billing:read.
         */
        get: operations["Coupons_redemptions"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/diagnostics": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Looks at everything now
         * @description Takes a second or two. For an admin or an API key. Needs settings:read.
         */
        get: operations["Diagnostics_report"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/diagnostics/settings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** @description For an admin or an API key. Needs settings:write. */
        put: operations["Diagnostics_updateSettings"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/diagnostics/summary": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * What the last look found, without looking again: cheap enough to ask for on every page
         * @description Null when nobody looked in the last quarter of an hour. For an admin or an API key. Needs settings:read.
         */
        get: operations["Diagnostics_summary"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/edge-agent/assets/{assetId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Whether a video can be played, and which processing of it is current
         * @description The agent asks before it serves copies of a video it has not checked for a while. Open to everyone.
         */
        get: operations["EdgeAgent_asset"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/edge-agent/heartbeat": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * An edge server reports in and is told what to do
         * @description Only the key of that edge opens it. Open to everyone.
         */
        post: operations["EdgeAgent_heartbeat"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/edge-agent/live/{channelId}/{fileName}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * A playlist or segment of a running channel
         * @description Open to everyone.
         */
        get: operations["EdgeAgent_liveFile"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/edge-agent/media/{assetId}/{filePath}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * A generated file of a video, or its content key
         * @description Open to everyone.
         */
        get: operations["EdgeAgent_media"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/edges": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs delivery:read. */
        get: operations["Edges_list"];
        put?: never;
        /**
         * Adds an edge
         * @description The answer carries the token of its agent, this once. For an admin or an API key. Needs delivery:write.
         */
        post: operations["Edges_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/edges/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs delivery:read. */
        get: operations["Edges_get"];
        put?: never;
        post?: never;
        /** @description For an admin or an API key. Needs delivery:write. */
        delete: operations["Edges_remove"];
        options?: never;
        head?: never;
        /** @description For an admin or an API key. Needs delivery:write. */
        patch: operations["Edges_update"];
        trace?: never;
    };
    "/v1/edges/{id}/purge": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Asks the agent to drop its copies: all of them, or those of videos or of live channels
         * @description For an admin or an API key. Needs delivery:write.
         */
        post: operations["Edges_purge"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/edges/{id}/token": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Replaces the token of the agent
         * @description The old one stops working at once. For an admin or an API key. Needs delivery:write.
         */
        post: operations["Edges_replaceToken"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/edges/overview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Who delivered what over the last day, week or month: main server, edges, viewers
         * @description For an admin or an API key. Needs delivery:read.
         */
        get: operations["Edges_overview"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/edges/traffic": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * What the edges delivered over the last day, week or month
         * @description Before ":id", which would take it. For an admin or an API key. Needs delivery:read.
         */
        get: operations["Edges_traffic"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/encoding-profiles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs encoding-profiles:read. */
        get: operations["EncodingProfiles_list"];
        put?: never;
        /** @description For an admin or an API key. Needs encoding-profiles:write. */
        post: operations["EncodingProfiles_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/encoding-profiles/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs encoding-profiles:read. */
        get: operations["EncodingProfiles_get"];
        put?: never;
        post?: never;
        /** @description For an admin or an API key. Needs encoding-profiles:write. */
        delete: operations["EncodingProfiles_delete"];
        options?: never;
        head?: never;
        /** @description For an admin or an API key. Needs encoding-profiles:write. */
        patch: operations["EncodingProfiles_update"];
        trace?: never;
    };
    "/v1/episodes/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** @description For an admin or an API key. Needs catalog:write. */
        delete: operations["Catalog_removeEpisode"];
        options?: never;
        head?: never;
        /** @description For an admin or an API key. Needs catalog:write. */
        patch: operations["Catalog_updateEpisode"];
        trace?: never;
    };
    "/v1/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * A stream of live events (server-sent events) for the admin panel
         * @description Any signed-in caller may connect. Which events arrive depends on the caller's permissions. The stream ends after a while and the client is expected to connect again. For an admin or an API key.
         */
        get: operations["Events_open"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/extras/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** @description For an admin or an API key. Needs catalog:write. */
        delete: operations["Collections_removeExtra"];
        options?: never;
        head?: never;
        /** @description For an admin or an API key. Needs catalog:write. */
        patch: operations["Collections_updateExtra"];
        trace?: never;
    };
    "/v1/genres": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs catalog:read. */
        get: operations["People_listGenres"];
        put?: never;
        /** @description For an admin or an API key. Needs catalog:write. */
        post: operations["People_createGenre"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/genres/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** @description For an admin or an API key. Needs catalog:write. */
        delete: operations["People_removeGenre"];
        options?: never;
        head?: never;
        /** @description For an admin or an API key. Needs catalog:write. */
        patch: operations["People_updateGenre"];
        trace?: never;
    };
    "/v1/guide/channels": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Channels the sources know, to link a channel here to one of them
         * @description For an admin or an API key. Needs live:read.
         */
        get: operations["Guide_searchKnown"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/guide/sources": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs live:read. */
        get: operations["Guide_listSources"];
        put?: never;
        /** @description For an admin or an API key. Needs live:write. */
        post: operations["Guide_createSource"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/guide/sources/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** @description For an admin or an API key. Needs live:write. */
        delete: operations["Guide_removeSource"];
        options?: never;
        head?: never;
        /** @description For an admin or an API key. Needs live:write. */
        patch: operations["Guide_updateSource"];
        trace?: never;
    };
    "/v1/guide/sources/{id}/import": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Fetches and reads the file of a source now
         * @description The answer comes when the import is done, which for a large guide takes a minute or more. For an admin or an API key. Needs live:write.
         */
        post: operations["Guide_importSource"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/guide/sources/{id}/url": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The full address of a source
         * @description It may carry a token, so it needs the right to change the guide. For an admin or an API key. Needs live:write.
         */
        get: operations["Guide_sourceUrl"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Readiness: reports the state of the database and Redis
         * @description Responds with 200 when everything is up and 503 otherwise. Open to everyone.
         */
        get: operations["Health_readiness"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/health/live": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Liveness: confirms the process is running and answering requests
         * @description It checks no dependencies, so an outage elsewhere does not restart this process. Open to everyone.
         */
        get: operations["Health_liveness"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/images": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Uploads a picture
         * @description The body is the file itself (JPEG, PNG or WebP, up to 10 MB), not a form. For an admin or an API key. Needs catalog:write.
         */
        post: operations["Catalog_uploadImage"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/images/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Deletes a picture that no title or episode uses
         * @description For an admin or an API key. Needs catalog:write.
         */
        delete: operations["Catalog_removeImage"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/jobs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs jobs:read. */
        get: operations["Jobs_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/jobs/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs jobs:read. */
        get: operations["Jobs_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/jobs/{id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Stops a waiting or running job
         * @description A running job stops within moments, not instantly. For an admin or an API key. Needs jobs:write.
         */
        post: operations["Jobs_cancel"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/jobs/{id}/retry": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Runs a failed or cancelled job again as a new job
         * @description For an admin or an API key. Needs jobs:write.
         */
        post: operations["Jobs_retry"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/layout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Every page, with whether it is arranged and how many sections it has
         * @description For an admin or an API key. Needs catalog:read.
         */
        get: operations["Home_pages"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/layout/{page}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The sections of a page
         * @description On the page of categories or genres, `example` names the one whose titles the sections are shown with. For an admin or an API key. Needs catalog:read.
         */
        get: operations["Home_get"];
        put?: never;
        post?: never;
        /**
         * Deletes every section of a page: it is again what it is by itself
         * @description For an admin or an API key. Needs catalog:write.
         */
        delete: operations["Home_reset"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/layout/{page}/sections": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description For an admin or an API key. Needs catalog:write. */
        post: operations["Home_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/layout/{page}/sections/order": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** @description For an admin or an API key. Needs catalog:write. */
        put: operations["Home_order"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/layout/{page}/start": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Takes a page over, starting with sections made for it
         * @description For an admin or an API key. Needs catalog:write.
         */
        post: operations["Home_start"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/layout/sections/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** @description For an admin or an API key. Needs catalog:write. */
        delete: operations["Home_remove"];
        options?: never;
        head?: never;
        /**
         * A section is known by its id, whatever page it is on
         * @description For an admin or an API key. Needs catalog:write.
         */
        patch: operations["Home_update"];
        trace?: never;
    };
    "/v1/live/{channelId}/{token}/{fileName}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The playlists and segments of a live channel
         * @description The token in the address is the permission. Open to everyone.
         */
        get: operations["LiveMedia_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/live/ingest/auth": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * The ingest server asks whether a stream key may publish
         * @description Open to everyone.
         */
        post: operations["Ingest_auth"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/mail": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs settings:read. */
        get: operations["Mail_status"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/mail/test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Sends a test email and waits for the mail server's answer, so a wrong password or host shows at once
         * @description For an admin or an API key. Needs settings:write.
         */
        post: operations["Mail_test"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/media/{assetId}/{token}/{filePath}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The playlists, segments and keys of a video
         * @description The token in the address is the permission. Open to everyone.
         */
        get: operations["Media_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/meta": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * What an app asks when it starts
         * @description Unlike every other address, this one answers an app that is too old as well, and says so in the answer: an app can show its "please update" screen before anything else fails. Open to everyone.
         */
        get: operations["AppVersions_meta"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/metadata": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Whether the import is set up, so the panel can show or explain it
         * @description For an admin or an API key. Needs catalog:read.
         */
        get: operations["Metadata_status"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/metadata/import": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Creates a draft title from an entry
         * @description For an admin or an API key. Needs catalog:write.
         */
        post: operations["Metadata_importNew"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/metadata/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * What an import of one entry would bring
         * @description Changes nothing. For an admin or an API key. Needs catalog:write.
         */
        get: operations["Metadata_preview"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/metadata/search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs catalog:write. */
        get: operations["Metadata_search"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/openapi.json": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The description of this API as an OpenAPI 3.1 document
         * @description It is produced from the source code of the server with "pnpm openapi", so it says what this version does. Clients and their types are generated from it. Open to everyone.
         */
        get: operations["OpenApi_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/p2p": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Whether P2P is on, and how the tracker is doing
         * @description For an admin or an API key. Needs delivery:read.
         */
        get: operations["P2p_status"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/p2p/traffic": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * How much of what viewers played came from other viewers, hour by hour
         * @description For an admin or an API key. Needs delivery:read.
         */
        get: operations["P2p_traffic"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/packages": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs catalog:read. */
        get: operations["Packages_list"];
        put?: never;
        /** @description For an admin or an API key. Needs billing:write. */
        post: operations["Packages_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/packages/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** @description For an admin or an API key. Needs billing:write. */
        delete: operations["Packages_remove"];
        options?: never;
        head?: never;
        /** @description For an admin or an API key. Needs billing:write. */
        patch: operations["Packages_update"];
        trace?: never;
    };
    "/v1/packages/{id}/titles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Puts titles into the package and takes titles out
         * @description What a plan opens changes with it, at once. For an admin or an API key. Needs billing:write.
         */
        put: operations["Packages_changeTitles"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/packages/order": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Before ":id", so "order" is not read as an id
         * @description For an admin or an API key. Needs billing:write.
         */
        put: operations["Packages_reorder"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/payments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs billing:read. */
        get: operations["PaymentsAdmin_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/payments/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Takes a payment that was written down by hand out of the books
         * @description For an admin or an API key. Needs billing:write.
         */
        delete: operations["PaymentsAdmin_remove"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/payments/export": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The payments as a file
         * @description Before ":id", so "export" is not read as an id. For an admin or an API key. Needs billing:read.
         */
        get: operations["PaymentsAdmin_export"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/people": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs catalog:read. */
        get: operations["People_listPeople"];
        put?: never;
        /** @description For an admin or an API key. Needs catalog:write. */
        post: operations["People_createPerson"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/people/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs catalog:read. */
        get: operations["People_getPerson"];
        put?: never;
        post?: never;
        /** @description For an admin or an API key. Needs catalog:write. */
        delete: operations["People_removePerson"];
        options?: never;
        head?: never;
        /** @description For an admin or an API key. Needs catalog:write. */
        patch: operations["People_updatePerson"];
        trace?: never;
    };
    "/v1/plans": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs billing:read. */
        get: operations["BillingAdmin_list"];
        put?: never;
        /** @description For an admin or an API key. Needs billing:write. */
        post: operations["BillingAdmin_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/plans/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** @description For an admin or an API key. Needs billing:write. */
        delete: operations["BillingAdmin_remove"];
        options?: never;
        head?: never;
        /** @description For an admin or an API key. Needs billing:write. */
        patch: operations["BillingAdmin_update"];
        trace?: never;
    };
    "/v1/plans/order": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Sets the order of the page of plans
         * @description Before ":id", so "order" is not read as an id. For an admin or an API key. Needs billing:write.
         */
        put: operations["BillingAdmin_reorder"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/programmes/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** @description For an admin or an API key. Needs live:write. */
        delete: operations["Guide_removeProgramme"];
        options?: never;
        head?: never;
        /** @description For an admin or an API key. Needs live:write. */
        patch: operations["Guide_updateProgramme"];
        trace?: never;
    };
    "/v1/programmes/{id}/record": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Records a programme of the guide
         * @description For an admin or an API key. Needs live:write.
         */
        post: operations["Recordings_recordProgramme"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/purchases/{id}/revoke": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Takes a title back from a viewer, at once
         * @description For an admin or an API key. Needs billing:write.
         */
        post: operations["PurchasesAdmin_revoke"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/recordings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs live:read. */
        get: operations["Recordings_list"];
        put?: never;
        /** @description For an admin or an API key. Needs live:write. */
        post: operations["Recordings_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/recordings/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** @description For an admin or an API key. Needs live:write. */
        delete: operations["Recordings_remove"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/recordings/{id}/stop": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Calls a waiting recording off, or stops a running one and keeps what it has
         * @description For an admin or an API key. Needs live:write.
         */
        post: operations["Recordings_stop"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/roles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Every role, built in and custom, and the list of permissions with a sentence each
         * @description For an admin or an API key. Needs admins:read.
         */
        get: operations["AdminRoles_overview"];
        put?: never;
        /** @description For a signed-in admin, not for API keys. Needs admins:write. */
        post: operations["AdminRoles_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/roles/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * One custom role with the admins who hold it
         * @description For an admin or an API key. Needs admins:read.
         */
        get: operations["AdminRoles_get"];
        put?: never;
        post?: never;
        /**
         * Deletes a role
         * @description `?moveTo=` names the role its holders get instead: ADMIN, EDITOR, VIEWER or the id of another custom role. For a signed-in admin, not for API keys. Needs admins:write.
         */
        delete: operations["AdminRoles_remove"];
        options?: never;
        head?: never;
        /** @description For a signed-in admin, not for API keys. Needs admins:write. */
        patch: operations["AdminRoles_update"];
        trace?: never;
    };
    "/v1/seasons/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** @description For an admin or an API key. Needs catalog:write. */
        delete: operations["Catalog_removeSeason"];
        options?: never;
        head?: never;
        /** @description For an admin or an API key. Needs catalog:write. */
        patch: operations["Catalog_updateSeason"];
        trace?: never;
    };
    "/v1/seasons/{id}/episodes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description For an admin or an API key. Needs catalog:write. */
        post: operations["Catalog_createEpisode"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/stats/overview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Figures for the dashboard: assets, jobs, storage and recent failures
         * @description For an admin or an API key. Needs assets:read and jobs:read.
         */
        get: operations["Stats_overview"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/storage-pools": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs storage:read. */
        get: operations["StoragePools_list"];
        put?: never;
        /** @description For a signed-in admin, not for API keys. Needs storage:write. */
        post: operations["StoragePools_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/storage-pools/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs storage:read. */
        get: operations["StoragePools_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** @description For a signed-in admin, not for API keys. Needs storage:write. */
        patch: operations["StoragePools_update"];
        trace?: never;
    };
    "/v1/storage-pools/{id}/test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Writes, reads and deletes a small file to confirm the pool works
         * @description For a signed-in admin, not for API keys. Needs storage:write.
         */
        post: operations["StoragePools_test"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/subscriptions/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** @description For an admin or an API key. Needs billing:write. */
        patch: operations["BillingAdmin_change"];
        trace?: never;
    };
    "/v1/subscriptions/{id}/end": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Ends access now
         * @description For an admin or an API key. Needs billing:write.
         */
        post: operations["BillingAdmin_end"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/subscriptions/{id}/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Reads a subscription paid online from Stripe again
         * @description For an admin or an API key. Needs billing:write.
         */
        post: operations["BillingAdmin_refresh"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/titles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs catalog:read. */
        get: operations["Catalog_listTitles"];
        put?: never;
        /** @description For an admin or an API key. Needs catalog:write. */
        post: operations["Catalog_createTitle"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/titles/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs catalog:read. */
        get: operations["Catalog_getTitle"];
        put?: never;
        post?: never;
        /** @description For an admin or an API key. Needs catalog:write. */
        delete: operations["Catalog_removeTitle"];
        options?: never;
        head?: never;
        /** @description For an admin or an API key. Needs catalog:write. */
        patch: operations["Catalog_updateTitle"];
        trace?: never;
    };
    "/v1/titles/{id}/credits": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Replaces the cast and crew of a title with the list given, in its order
         * @description For an admin or an API key. Needs catalog:write.
         */
        put: operations["People_replaceCredits"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/titles/{id}/duplicate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Makes a copy of a title as a draft
         * @description The body says what comes along; the videos and pictures of the copy are the same ones, not new files. For an admin or an API key. Needs catalog:write.
         */
        post: operations["Catalog_duplicateTitle"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/titles/{id}/extras": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description For an admin or an API key. Needs catalog:write. */
        post: operations["Collections_addExtra"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/titles/{id}/extras/order": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** @description For an admin or an API key. Needs catalog:write. */
        put: operations["Collections_orderExtras"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/titles/{id}/history": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs catalog:read. */
        get: operations["TitleHistory_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/titles/{id}/history/{revisionId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * One version, with what bringing it back would change now
         * @description For an admin or an API key. Needs catalog:read.
         */
        get: operations["TitleHistory_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/titles/{id}/history/{revisionId}/restore": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Brings a version back: texts, facts, prices, artwork, genres and categories, people and translations
         * @description Publishing, videos and episodes stay as they are. For an admin or an API key. Needs catalog:write.
         */
        post: operations["TitleHistory_restore"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/titles/{id}/metadata": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Brings details of an entry into an existing title
         * @description For an admin or an API key. Needs catalog:write.
         */
        post: operations["Metadata_apply"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/titles/{id}/seasons": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description For an admin or an API key. Needs catalog:write. */
        post: operations["Catalog_createSeason"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/titles/{id}/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Publishes, unpublishes or archives a title
         * @description For an admin or an API key. Needs catalog:write.
         */
        put: operations["Catalog_setTitleStatus"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/titles/{id}/translations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs catalog:read. */
        get: operations["Translations_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/titles/{id}/translations/{language}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** @description For an admin or an API key. Needs catalog:write. */
        put: operations["Translations_put"];
        post?: never;
        /** @description For an admin or an API key. Needs catalog:write. */
        delete: operations["Translations_remove"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/titles/{id}/translations/{language}/source": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * What the source says about an imported title in another language
         * @description Changes nothing. For an admin or an API key. Needs catalog:write.
         */
        get: operations["Metadata_sourceTranslation"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/titles/bulk": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Does one thing to many titles
         * @description Answers with what happened to how many, and names the titles that could not be changed. For an admin or an API key. Needs catalog:write.
         */
        post: operations["Bulk_run"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/translation-jobs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs catalog:read. */
        get: operations["Bulk_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/translation-jobs/{id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description For an admin or an API key. Needs catalog:write. */
        post: operations["Bulk_cancel"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/translations/languages": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The languages in use, to offer them first when a title gets a new one
         * @description For an admin or an API key. Needs catalog:read.
         */
        get: operations["Translations_languages"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/translations/terms": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * What there is to translate, and how far each language has come
         * @description For an admin or an API key. Needs catalog:read.
         */
        get: operations["TermTranslations_overview"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/translations/terms/{kind}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs catalog:read. */
        get: operations["TermTranslations_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/translations/terms/{kind}/{language}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Writes the translations of up to 200 terms into one language
         * @description For an admin or an API key. Needs catalog:write.
         */
        put: operations["TermTranslations_save"];
        post?: never;
        /**
         * Takes a language away from every term of a kind
         * @description For an admin or an API key. Needs catalog:write.
         */
        delete: operations["TermTranslations_remove"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewer/billing-portal": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Opens Stripe's page for changing the card, reading invoices and cancelling
         * @description For a signed-in viewer.
         */
        post: operations["PublicBilling_portal"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewer/checkout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Opens Stripe's payment page for a plan
         * @description The viewer is sent to the address returned. For a signed-in viewer.
         */
        post: operations["PublicBilling_start"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewer/checkout/confirm": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Called when the viewer returns from paying
         * @description Records the subscription at once, without waiting for Stripe's own message about it. For a signed-in viewer.
         */
        post: operations["PublicBilling_confirm"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewer/config": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * What the website needs to know to show the right buttons
         * @description Open to everyone.
         */
        get: operations["ViewerAuth_config"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewer/coupons/check": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Says what a code takes off a plan or a title
         * @description Asking uses nothing up. For a signed-in viewer.
         */
        post: operations["ViewerCoupons_check"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewer/delete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Deletes the viewer's own account
         * @description POST, because it carries the password. For a signed-in viewer.
         */
        post: operations["ViewerAuth_deleteOwn"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewer/device-codes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * A device asks for a code to show
         * @description The viewer enters it on the website, on a phone or a computer where they are signed in. Open to everyone.
         */
        post: operations["ViewerDevices_start"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewer/device-codes/{code}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The device behind a code, for the viewer to look at before they answer
         * @description For a signed-in viewer.
         */
        get: operations["ViewerDevices_find"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewer/device-codes/{code}/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * The viewer says yes: the device is signed in to their account
         * @description For a signed-in viewer.
         */
        post: operations["ViewerDevices_approve"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewer/device-codes/{code}/deny": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * The viewer says no: the device is told, and the code stops working
         * @description For a signed-in viewer.
         */
        post: operations["ViewerDevices_deny"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewer/device-codes/token": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * The device asks whether the viewer has answered
         * @description Once they said yes, the answer holds the token, one time. Asking more often than every two seconds is answered with 429 and the code "slow_down". Open to everyone.
         */
        post: operations["ViewerDevices_poll"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewer/devices": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The apps the viewer is, or was, signed in on
         * @description Browsers are under "sessions". For a signed-in viewer.
         */
        get: operations["ViewerDevices_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewer/devices/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Signs a device out and forgets it
         * @description For a signed-in viewer.
         */
        delete: operations["ViewerDevices_remove"];
        options?: never;
        head?: never;
        /**
         * Gives a device another name, such as "Bedroom TV"
         * @description For a signed-in viewer.
         */
        patch: operations["ViewerDevices_rename"];
        trace?: never;
    };
    "/v1/viewer/email/send": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Sends the link to confirm the address again
         * @description For a signed-in viewer.
         */
        post: operations["ViewerAuth_sendVerification"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewer/email/verify": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Confirms the address with the token of the link
         * @description Needs no sign-in: the link is often opened on another device than the one that signed up. Open to everyone.
         */
        post: operations["ViewerAuth_verifyEmail"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewer/list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The titles on the list, as cards
         * @description For a signed-in viewer.
         */
        get: operations["Watchlist_list"];
        put?: never;
        post?: never;
        /**
         * Empties the list
         * @description For a signed-in viewer.
         */
        delete: operations["Watchlist_clear"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewer/list/{slug}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Puts a title on the list
         * @description Safe to repeat. For a signed-in viewer.
         */
        put: operations["Watchlist_add"];
        post?: never;
        /**
         * Takes a title off the list
         * @description Safe to repeat. For a signed-in viewer.
         */
        delete: operations["Watchlist_remove"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewer/list/ids": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Only the ids: enough to mark the titles of a page that are on the list
         * @description For a signed-in viewer.
         */
        get: operations["Watchlist_ids"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewer/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Signs a viewer in
         * @description The answer holds the token an app sends from then on. Open to everyone.
         */
        post: operations["ViewerAuth_login"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewer/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Signs this device out
         * @description For a signed-in viewer.
         */
        post: operations["ViewerAuth_logout"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewer/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The signed-in viewer
         * @description For a signed-in viewer.
         */
        get: operations["ViewerAuth_me"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Changes the viewer's own details
         * @description For a signed-in viewer.
         */
        patch: operations["ViewerAuth_updateOwn"];
        trace?: never;
    };
    "/v1/viewer/password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Sets a new password, given the current one
         * @description For a signed-in viewer.
         */
        post: operations["ViewerAuth_changePassword"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewer/password/forgot": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Asks for a link to set a new password
         * @description The answer is the same whether or not the address belongs to an account. Open to everyone.
         */
        post: operations["ViewerAuth_forgotPassword"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewer/password/reset": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Sets a new password with the token of the link
         * @description Signs the viewer out everywhere. Open to everyone.
         */
        post: operations["ViewerAuth_resetPassword"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewer/payments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The viewer's own payments
         * @description For a signed-in viewer.
         */
        get: operations["ViewerPayments_own"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewer/profiles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The profiles of the account, and which one is in use
         * @description For a signed-in viewer.
         */
        get: operations["ViewerProfiles_list"];
        put?: never;
        /**
         * Adds a profile to the account
         * @description For a signed-in viewer.
         */
        post: operations["ViewerProfiles_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewer/profiles/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Deletes a profile and what it watched
         * @description For a signed-in viewer.
         */
        delete: operations["ViewerProfiles_remove"];
        options?: never;
        head?: never;
        /**
         * Changes a profile
         * @description For a signed-in viewer.
         */
        patch: operations["ViewerProfiles_update"];
        trace?: never;
    };
    "/v1/viewer/profiles/{id}/select": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Chooses who is watching on this device
         * @description Other devices keep their own choice. For a signed-in viewer.
         */
        post: operations["ViewerProfiles_select"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewer/purchases": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The viewer's rented and bought titles, newest first
         * @description For a signed-in viewer.
         */
        get: operations["ViewerPurchases_own"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewer/purchases/checkout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Opens Stripe's payment page for renting or buying a title
         * @description For a signed-in viewer.
         */
        post: operations["ViewerPurchases_start"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewer/register": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Creates a viewer account and signs it in
         * @description Open to everyone.
         */
        post: operations["ViewerAuth_register"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewer/session": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Who is signed in, or nobody
         * @description Unlike "me" this is not an error for a visitor, so the website can ask on every page without filling the browser's console with failed requests. Open to everyone.
         */
        get: operations["ViewerAuth_session"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewer/sessions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The devices the viewer is signed in on
         * @description For a signed-in viewer.
         */
        get: operations["ViewerAuth_sessions"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewer/sessions/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Signs another device of the account out
         * @description For a signed-in viewer.
         */
        delete: operations["ViewerAuth_revokeSession"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewer/streams": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * What plays on the account right now, and how many devices may play at once
         * @description For a signed-in viewer.
         */
        get: operations["ViewerStreams_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewer/streams/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Ends a stream: the player's own on leaving, or another device's to make room
         * @description For a signed-in viewer.
         */
        delete: operations["ViewerStreams_end"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewer/streams/{id}/beat": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * The player says it is still playing
         * @description 410 tells it to stop. For a signed-in viewer.
         */
        post: operations["ViewerStreams_beat"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewer/subscription": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The signed-in viewer's own subscription
         * @description For a signed-in viewer.
         */
        get: operations["PublicBilling_own"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewer/watching": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The "Continue watching" row
         * @description For a signed-in viewer.
         */
        get: operations["Watching_list"];
        /**
         * Reports where the viewer is, in one video or in several
         * @description For a signed-in viewer.
         */
        put: operations["Watching_save"];
        post?: never;
        /**
         * Forgets everything the viewer watched
         * @description For a signed-in viewer.
         */
        delete: operations["Watching_clear"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewer/watching/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Forgets one video
         * @description For a signed-in viewer.
         */
        delete: operations["Watching_remove"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewer/watching/titles/{slug}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Progress in the videos of one title, for its page
         * @description For a signed-in viewer.
         */
        get: operations["Watching_forTitle"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs viewers:read. */
        get: operations["ViewersAdmin_list"];
        put?: never;
        /** @description For an admin or an API key. Needs viewers:write. */
        post: operations["ViewersAdmin_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewers/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs viewers:read. */
        get: operations["ViewersAdmin_get"];
        put?: never;
        post?: never;
        /** @description For an admin or an API key. Needs viewers:write. */
        delete: operations["ViewersAdmin_remove"];
        options?: never;
        head?: never;
        /** @description For an admin or an API key. Needs viewers:write. */
        patch: operations["ViewersAdmin_update"];
        trace?: never;
    };
    "/v1/viewers/{id}/devices/{deviceId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Signs one device of a viewer out and forgets it
         * @description For an admin or an API key. Needs viewers:write.
         */
        delete: operations["ViewersAdmin_removeDevice"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewers/{id}/list": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs viewers:read. */
        get: operations["ViewerListAdmin_forViewer"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewers/{id}/password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Sets a new password
         * @description The viewer is signed out everywhere. For an admin or an API key. Needs viewers:write.
         */
        post: operations["ViewersAdmin_resetPassword"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewers/{id}/password-email": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Emails the viewer a link to set a new password themselves
         * @description For an admin or an API key. Needs viewers:write.
         */
        post: operations["ViewersAdmin_sendPasswordEmail"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewers/{id}/payments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs billing:read. */
        get: operations["PaymentsAdmin_forViewer"];
        put?: never;
        /**
         * Writes down money received outside the site
         * @description For an admin or an API key. Needs billing:write.
         */
        post: operations["PaymentsAdmin_record"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewers/{id}/purchases": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs billing:read. */
        get: operations["PurchasesAdmin_forViewer"];
        put?: never;
        /**
         * Gives a viewer a title by hand: paid in cash, or as a gift
         * @description For an admin or an API key. Needs billing:write.
         */
        post: operations["PurchasesAdmin_grant"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewers/{id}/sign-out": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description For an admin or an API key. Needs viewers:write. */
        post: operations["ViewersAdmin_signOut"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewers/{id}/streams": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs viewers:read. */
        get: operations["ViewerStreamsAdmin_forViewer"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewers/{id}/streams/{streamId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Stops what one device of the viewer is playing
         * @description The player stops at its next report. For an admin or an API key. Needs viewers:write.
         */
        delete: operations["ViewerStreamsAdmin_stop"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewers/{id}/subscriptions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The running subscription of a viewer and the history of the account
         * @description For an admin or an API key. Needs billing:read.
         */
        get: operations["BillingAdmin_forViewer"];
        put?: never;
        /**
         * Gives a viewer access by hand: cash, a bank transfer, a gift
         * @description For an admin or an API key. Needs billing:write.
         */
        post: operations["BillingAdmin_grant"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewers/{id}/verification-email": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Emails the viewer the link to confirm their address
         * @description For an admin or an API key. Needs viewers:write.
         */
        post: operations["ViewersAdmin_sendVerificationEmail"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/viewers/{id}/watching": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs viewers:read. */
        get: operations["ViewerWatchingAdmin_forViewer"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/watch/files": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs catalog:read. */
        get: operations["Watch_listFiles"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/watch/files/{id}/ignore": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description For an admin or an API key. Needs catalog:write. */
        post: operations["Watch_ignore"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/watch/files/{id}/match": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description For an admin or an API key. Needs catalog:write. */
        post: operations["Watch_match"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/watch/files/{id}/retry": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description For an admin or an API key. Needs catalog:write. */
        post: operations["Watch_retry"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/watch/files/retry": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Before ":id", so that "retry" is not read as an id
         * @description For an admin or an API key. Needs catalog:write.
         */
        post: operations["Watch_retryAll"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/watch/locations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs storage:read. */
        get: operations["Watch_listLocations"];
        put?: never;
        /** @description For an admin or an API key. Needs storage:write. */
        post: operations["Watch_createLocation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/watch/locations/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs storage:read. */
        get: operations["Watch_getLocation"];
        put?: never;
        post?: never;
        /** @description For an admin or an API key. Needs storage:write. */
        delete: operations["Watch_removeLocation"];
        options?: never;
        head?: never;
        /** @description For an admin or an API key. Needs storage:write. */
        patch: operations["Watch_updateLocation"];
        trace?: never;
    };
    "/v1/watch/locations/{id}/scan": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description For an admin or an API key. Needs catalog:write. */
        post: operations["Watch_scan"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/watch/locations/test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Looks at a place without saving it
         * @description Before ":id", so that "test" is not read as an id. For an admin or an API key. Needs storage:write.
         */
        post: operations["Watch_test"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/watch/summary": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs catalog:read. */
        get: operations["Watch_summary"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/webhooks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs settings:read. */
        get: operations["Webhooks_list"];
        put?: never;
        /** @description For a signed-in admin, not for API keys. Needs settings:write. */
        post: operations["Webhooks_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/webhooks/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs settings:read. */
        get: operations["Webhooks_get"];
        put?: never;
        post?: never;
        /** @description For an admin or an API key. Needs settings:write. */
        delete: operations["Webhooks_remove"];
        options?: never;
        head?: never;
        /** @description For an admin or an API key. Needs settings:write. */
        patch: operations["Webhooks_update"];
        trace?: never;
    };
    "/v1/webhooks/{id}/activity": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The deliveries of the last 24 hours, hour by hour
         * @description For an admin or an API key. Needs settings:read.
         */
        get: operations["Webhooks_activity"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/webhooks/{id}/deliveries": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs settings:read. */
        get: operations["Webhooks_deliveries"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/webhooks/{id}/deliveries/{deliveryId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description For an admin or an API key. Needs settings:read. */
        get: operations["Webhooks_delivery"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/webhooks/{id}/deliveries/{deliveryId}/redeliver": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Sends a delivery again, as a new one with the same content
         * @description For an admin or an API key. Needs settings:write.
         */
        post: operations["Webhooks_redeliver"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/webhooks/{id}/secret": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Replaces the signing secret and shows the new one, once
         * @description For a signed-in admin, not for API keys. Needs settings:write.
         */
        post: operations["Webhooks_rollSecret"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/webhooks/{id}/test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Sends a test message now and answers with what came back
         * @description For an admin or an API key. Needs settings:write.
         */
        post: operations["Webhooks_test"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/webhooks/reference": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The events with an example each, and how requests are signed and tried again
         * @description For an admin or an API key. Needs settings:read.
         */
        get: operations["Webhooks_reference"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        AddedSubtitleView: {
            track: components["schemas"]["SubtitleTrackView"];
            /** @description How many subtitles the file holds. */
            cues: number;
            /** @description What the file was: "srt", "vtt" or "ass". */
            format: string;
            /** @description What its bytes were read as, such as "utf-8" or "windows-1256". */
            encoding: string;
            /** @description Something to check, when the file looks as if it belonged to another video. */
            warning: string | null;
        };
        AdminPrincipal: {
            /** @constant */
            type: "admin";
            adminId: string;
            sessionId: string;
            email: string;
            displayName: string;
            role: components["schemas"]["AdminRole"];
            /** @description The role made in the panel that this admin holds. Set when role is CUSTOM. */
            customRole: {
                id: string;
                name: string;
                color: string;
            } | null;
            permissions: ("admins:read" | "admins:write" | "api-keys:read" | "api-keys:write" | "audit:read" | "assets:read" | "assets:write" | "jobs:read" | "jobs:write" | "encoding-profiles:read" | "encoding-profiles:write" | "storage:read" | "storage:write" | "catalog:read" | "catalog:write" | "viewers:read" | "viewers:write" | "analytics:read" | "billing:read" | "billing:write" | "live:read" | "live:write" | "delivery:read" | "delivery:write" | "settings:read" | "settings:write")[];
            /** @description Whether a code is asked for when this admin signs in. */
            twoFactorEnabled: boolean;
            /**
             * @description True when the installation asks every admin for two-factor sign-in and
             *     this one has yet to set it up. Until then nothing else is open to them.
             */
            twoFactorSetupRequired: boolean;
        };
        /** @enum {string} */
        AdminRole: "ADMIN" | "EDITOR" | "VIEWER" | "OWNER" | "CUSTOM";
        AdminView: {
            id: string;
            email: string;
            displayName: string;
            role: components["schemas"]["AdminRole"];
            /** @description The role made in the panel that this admin holds. Set when role is CUSTOM. */
            customRole: components["schemas"]["CustomRoleRef"] | null;
            isActive: boolean;
            /** @description Whether a code is asked for when this admin signs in. */
            twoFactorEnabled: boolean;
            /** Format: date-time */
            lastLoginAt: string | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        AlertSettings: {
            /** @description Whether the owners get an email when a problem appears. */
            emailAlerts: boolean;
        };
        AnalyticsSummary: {
            /** @description False when the installation records nothing: the figures are then empty. */
            recording: boolean;
            totals: components["schemas"]["Figures"];
            /** @description The same number of days right before, to compare with. */
            previous: components["schemas"]["Figures"];
            days: components["schemas"]["DayFigures"][];
            devices: {
                device: components["schemas"]["PlayDevice"];
                views: number;
                watchSeconds: number;
            }[];
            audience: {
                /** @description Views by viewers who were signed in, and by visitors who were not. */
                signedIn: number;
                visitors: number;
                /** @description Views of titles that need a plan or a purchase, and of free ones. */
                paid: number;
                free: number;
            };
            /** @description Views by the hour of the day they began in, 0 to 23, in the time zone asked for. */
            hours: number[];
        };
        ApiKeyPrincipal: {
            /** @constant */
            type: "apiKey";
            apiKeyId: string;
            /** @description The admin who created the key. Used as the actor in the audit log. */
            adminId: string;
            name: string;
            permissions: ("admins:read" | "admins:write" | "api-keys:read" | "api-keys:write" | "audit:read" | "assets:read" | "assets:write" | "jobs:read" | "jobs:write" | "encoding-profiles:read" | "encoding-profiles:write" | "storage:read" | "storage:write" | "catalog:read" | "catalog:write" | "viewers:read" | "viewers:write" | "analytics:read" | "billing:read" | "billing:write" | "live:read" | "live:write" | "delivery:read" | "delivery:write" | "settings:read" | "settings:write")[];
        };
        ApiKeyView: {
            id: string;
            name: string;
            /** @description Public start of the key, for recognizing it. */
            prefix: string;
            scopes: string[];
            createdBy: {
                id: string;
                displayName: string;
            };
            /** Format: date-time */
            lastUsedAt: string | null;
            /** Format: date-time */
            expiresAt: string | null;
            /** Format: date-time */
            revokedAt: string | null;
            /** Format: date-time */
            createdAt: string;
        };
        ApiMeta: {
            /** @description The name of the site, as set under Branding. */
            name: string;
            api: {
                /** @description The version of the server. */
                version: string;
                /** @description The part every address starts with. */
                prefix: string;
                /** @description Where the description of the API is. */
                description: string;
            };
            /** @description The app that asked, when it named itself in the X-Onyx-Client header. */
            client: {
                app: string;
                version: string;
                supported: boolean;
                refusal: components["schemas"]["ClientRefusal"] | null;
            } | null;
        };
        AppVersionRule: {
            /** @description What the app calls itself, such as "android-tv". */
            app: string;
            /** @description Versions below this one are turned away. */
            minimum: string;
            /** @description What the app shows the viewer. Null for the standard sentence. */
            message: string | null;
            /** @description Where the newer version is, such as its page in a store. */
            updateUrl: string | null;
        };
        AppVersionsView: {
            rules: components["schemas"]["AppVersionRule"][];
            /** @description The header apps name themselves in. */
            header: string;
            maxRules: number;
        };
        AssetMediaView: {
            /** @description Qualities, highest first. */
            renditions: {
                name: string;
                width: number;
                height: number;
                /** @description Average bitrate in bits per second. */
                bitrate: number;
                frameRate: number | null;
                /** @description Codec strings as written in the playlist, for example "avc1.64001f,mp4a.40.2". */
                codec: string;
                /** @description Bytes as text. */
                sizeBytes: string;
            }[];
            subtitles: {
                id: string;
                /** @description Language code, for example "en". */
                language: string;
                label: string | null;
                source: string;
                isDefault: boolean;
                isForced: boolean;
                /** @description Signed address of the WebVTT file. Null while the asset is not ready. */
                url: string | null;
            }[];
            /** @description Signed addresses. Null while the asset is not ready or the picture does not exist. */
            thumbnails: {
                posterUrl: string | null;
                spriteUrl: string | null;
                spriteTrackUrl: string | null;
            };
            /** @description Size of all qualities together, bytes as text. */
            outputBytes: string;
        };
        AssetRef: {
            id: string;
            title: string;
            status: components["schemas"]["AssetStatus"];
            durationMs: number | null;
            height: number | null;
            /** @description Whether it can be streamed: ready, and stored with a stream. */
            playable: boolean;
        };
        /** @enum {string} */
        AssetStatus: "UPLOADING" | "UPLOADED" | "PROCESSING" | "READY" | "FAILED" | "DELETED";
        AssetView: {
            id: string;
            title: string;
            status: components["schemas"]["AssetStatus"];
            storagePoolId: string;
            createdById: string | null;
            source: {
                filename: string | null;
                /** @description Bytes, as a string because the value can exceed the safe range of a JSON number. */
                bytes: string | null;
                checksum: string | null;
            };
            /** @description Filled in after probing. */
            media: {
                durationMs: number | null;
                width: number | null;
                height: number | null;
                frameRate: number | null;
                videoCodec: string | null;
                audioCodec: string | null;
            };
            processingMode: ("COPY" | "TRANSCODE" | "PASSTHROUGH") | null;
            encodingProfileId: string | null;
            encryption: components["schemas"]["EncryptionMode"];
            p2pEnabled: boolean;
            /** @description Signed address of the poster picture. Null until the asset is ready and has one. */
            posterUrl: string | null;
            /** Format: date-time */
            readyAt: string | null;
            /** Format: date-time */
            deletedAt: string | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        BackupOverview: {
            settings: {
                /**
                 * @description How often a backup is made on its own.
                 * @enum {string}
                 */
                schedule: "off" | "daily" | "weekly";
                /** @description The hour of the day it is made, in UTC. */
                hour: number;
                /** @description For weekly backups: the day, with 0 for Sunday as in JavaScript. */
                weekday: number;
                /** @description How many finished backups are kept. Older ones are deleted. */
                keep: number;
                /** @description Where backups are written. Null is the default storage pool. */
                storagePoolId: string | null;
            };
            protection: components["schemas"]["Protection"];
            /** @description When the newest backup that can be restored was made. */
            lastGoodAt: string | null;
            /** @description When the next scheduled backup is due. Null when the schedule is off. */
            nextRunAt: string | null;
            /** @description The process that makes the backups. Null when none has been heard of lately. */
            runner: {
                pgDump: string | null;
                server: string | null;
                /** @description What stands in the way of a backup, or null. */
                problem: string | null;
            } | null;
            /** @description The version this server runs, to compare backups with. */
            appVersion: string;
            /** @description What all kept backups take up together. */
            totalBytes: number;
            /** @description The last thirty days, oldest first: what became of the backups of each day. */
            days: {
                date: string;
                good: number;
                failed: number;
            }[];
            pools: {
                id: string;
                name: string;
                driver: string;
                isDefault: boolean;
                isActive: boolean;
            }[];
            backups: components["schemas"]["BackupView"][];
        };
        /** @enum {string} */
        BackupStatus: "FAILED" | "RUNNING" | "COMPLETED" | "PENDING";
        /** @enum {string} */
        BackupTrigger: "MANUAL" | "SCHEDULED";
        BackupView: {
            id: string;
            status: components["schemas"]["BackupStatus"];
            trigger: components["schemas"]["BackupTrigger"];
            pool: {
                id: string;
                name: string;
            };
            /** @description The name the file has when it is downloaded. */
            fileName: string | null;
            sizeBytes: number | null;
            sha256: string | null;
            /** @description How many database objects the file holds. */
            entries: number | null;
            appVersion: string;
            migration: string | null;
            error: string | null;
            createdBy: {
                id: string;
                displayName: string;
            } | null;
            createdAt: string;
            startedAt: string | null;
            finishedAt: string | null;
        };
        BillingOverview: {
            /** @description Devices one account plays on at once where a plan says nothing. 0: no limit. */
            streamLimit: number;
            currency: string;
            checkout: boolean;
            contactUrl: string | null;
            plans: number;
            /** @description Viewers who can watch through a plan right now. */
            subscribers: number;
            /** @description Of those, the ones an admin granted access to. */
            grantedByHand: number;
            /** @description Of those, the ones who pay online. */
            paidOnline: number;
            /** @description Paying subscribers whose last payment failed and is being tried again. */
            pastDue: number;
            /** @description How online payment is set up. Null when it is off. */
            stripe: components["schemas"]["StripeStatus"] | null;
            /** @description Running subscriptions that end within the next seven days and are not renewed. */
            endingSoon: number;
            /** @description Published titles that need a subscription, and all published titles. */
            paidTitles: number;
            publishedTitles: number;
            packages: number;
            /** @description Plans that open only their packages. */
            limitedPlans: number;
            /** @description Published paid titles in no package, which only plans that open everything show. */
            unpackagedPaidTitles: number;
        };
        BrandingSettings: {
            /** @description The name of the site. Null: the SITE_NAME of the installation. */
            name: string | null;
            /** @description A sentence about the site, for search engines and link previews. */
            description: string | null;
            /** @description The picture shown as the logo, in the header and the footer. */
            logoId: string | null;
            /** @description Whether the name is written next to the logo, or the logo stands for it. */
            logoShowsName: boolean;
            /** @description The picture for the browser tab and home screens. */
            iconId: string | null;
            /** @description The one colour of the interface, as "#rrggbb". */
            accent: string | null;
            /** @description A line at the bottom of every page: a copyright, a company name. */
            footerText: string | null;
            footerLinks: components["schemas"]["FooterLink"][];
        };
        BrandingView: {
            settings: components["schemas"]["BrandingSettings"];
            logo: components["schemas"]["ImageView"] | null;
            icon: components["schemas"]["ImageView"] | null;
            /** @description What shows where a setting is left empty. */
            defaults: {
                name: string;
                description: string;
                accent: string;
            };
            /** @description How light the accent has to be against black. */
            minimumContrast: number;
        };
        BulkFailure: {
            titleId: string;
            name: string;
            reason: string;
        };
        BulkResult: {
            /** @enum {string} */
            action: "delete" | "categories" | "availability" | "collections" | "genres" | "publish" | "unpublish" | "archive" | "feature" | "translate";
            /** @description How many titles the selection meant. */
            matched: number;
            changed: number;
            /** @description Titles that were as asked already. */
            unchanged: number;
            failed: number;
            /** @description The first failures, with the reason of each. */
            failures: components["schemas"]["BulkFailure"][];
            /** @description Set by "translate": the job that does the work, in the background. */
            job: components["schemas"]["TranslationJobView"] | null;
        };
        CategoryView: {
            id: string;
            slug: string;
            name: string;
            description: string | null;
            sortOrder: number;
            /** @description How many titles carry this category. */
            titleCount: number;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        Change: {
            /** @enum {string} */
            group: "access" | "artwork" | "classification" | "translations" | "videos" | "people" | "episodes" | "texts" | "facts" | "publishing";
            /** @description Stable, for keys: "synopsis", "genres", "season:1:episode:3:name". */
            field: string;
            label: string;
            /**
             * @description "text": a longer text, shown as before and after. "value": a short value.
             *     "list": things added to and removed from a list.
             * @enum {string}
             */
            kind: "value" | "text" | "list";
            /**
             * @description How the panel shows `before` and `after`: as they are, or as a price, a date and so on.
             * @enum {string}
             */
            format?: "date" | "datetime" | "status" | "money" | "yesno" | "picture";
            before?: string | null;
            after?: string | null;
            added?: string[];
            removed?: string[];
            /** @description Said when nothing was added or removed and the order is new. */
            reordered?: boolean;
        };
        ChannelDetails: {
            /** @description The latest lines of the live process, oldest first. */
            log: string[];
            id: string;
            name: string;
            slug: string;
            number: number | null;
            description: string | null;
            /** @description PULL: the server connects to an address. PUSH: an encoder connects with a stream key. */
            ingest: components["schemas"]["ChannelIngest"];
            /** @description The address of a pulled channel without anything secret. Empty for a pushed one. */
            source: string;
            mode: components["schemas"]["ChannelMode"];
            /** @description The qualities chosen for transcoding. Empty for a channel that is passed through. */
            qualities: number[];
            /**
             * @description The qualities the channel is encoded into, best first, once the source is
             *     known: chosen heights above the source are left out. Null otherwise.
             */
            outputs: {
                name: string;
                height: number;
                videoKbps: number;
            }[] | null;
            /** @description Minutes viewers can go back in time. 0 means only the present. */
            dvrMinutes: number;
            /** @description The id of the channel in guide sources. Null when it is not linked. */
            guideId: string | null;
            /** @description Whether viewers find the channel on the website and in the apps. */
            published: boolean;
            /** @description FREE is as open as the installation. PAID needs a plan that opens the channel. */
            access: components["schemas"]["TitleAccess"];
            /** @description The packages the channel is in, in their order. */
            packages: {
                id: string;
                name: string;
            }[];
            enabled: boolean;
            status: components["schemas"]["ChannelState"];
            statusMessage: string | null;
            startedAt: string | null;
            restartCount: number;
            streams: components["schemas"]["SourceStreams"] | null;
            /** @description Figures of the running stream. Null while no live process runs the channel. */
            health: {
                bitrate: number | null;
                speed: number | null;
                lastDataAt: string | null;
                node: string;
            } | null;
            createdAt: string;
            updatedAt: string;
        };
        /** @enum {string} */
        ChannelIngest: "PULL" | "PUSH";
        /** @enum {string} */
        ChannelMode: "COPY" | "TRANSCODE";
        /** @enum {string} */
        ChannelState: "FAILED" | "RUNNING" | "WAITING" | "STOPPED" | "IDLE" | "STARTING" | "RECONNECTING";
        ChannelView: {
            id: string;
            name: string;
            slug: string;
            number: number | null;
            description: string | null;
            /** @description PULL: the server connects to an address. PUSH: an encoder connects with a stream key. */
            ingest: components["schemas"]["ChannelIngest"];
            /** @description The address of a pulled channel without anything secret. Empty for a pushed one. */
            source: string;
            mode: components["schemas"]["ChannelMode"];
            /** @description The qualities chosen for transcoding. Empty for a channel that is passed through. */
            qualities: number[];
            /**
             * @description The qualities the channel is encoded into, best first, once the source is
             *     known: chosen heights above the source are left out. Null otherwise.
             */
            outputs: {
                name: string;
                height: number;
                videoKbps: number;
            }[] | null;
            /** @description Minutes viewers can go back in time. 0 means only the present. */
            dvrMinutes: number;
            /** @description The id of the channel in guide sources. Null when it is not linked. */
            guideId: string | null;
            /** @description Whether viewers find the channel on the website and in the apps. */
            published: boolean;
            /** @description FREE is as open as the installation. PAID needs a plan that opens the channel. */
            access: components["schemas"]["TitleAccess"];
            /** @description The packages the channel is in, in their order. */
            packages: {
                id: string;
                name: string;
            }[];
            enabled: boolean;
            status: components["schemas"]["ChannelState"];
            statusMessage: string | null;
            startedAt: string | null;
            restartCount: number;
            streams: components["schemas"]["SourceStreams"] | null;
            /** @description Figures of the running stream. Null while no live process runs the channel. */
            health: {
                bitrate: number | null;
                speed: number | null;
                lastDataAt: string | null;
                node: string;
            } | null;
            createdAt: string;
            updatedAt: string;
        };
        Check: {
            /** @description Stable name, such as "backups" or "storage:<pool id>". Alerts are told apart by it. */
            id: string;
            group: components["schemas"]["CheckGroup"];
            title: string;
            status: components["schemas"]["CheckStatus"];
            /** @description One sentence: what is the case. */
            summary: string;
            /** @description What to do about it. Only where there is something to do. */
            hint?: string;
            /** @description The page of the panel where it is dealt with. */
            link?: {
                label: string;
                to: string;
            };
            /** @description Figures behind the summary, for the curious and for bug reports. */
            facts?: [
                string,
                string
            ][];
        };
        /** @enum {string} */
        CheckGroup: "setup" | "live" | "core" | "processing" | "storage" | "protection" | "delivery" | "connections";
        ChecklistItem: {
            key: string;
            label: string;
            done: boolean;
            /** @description A required point blocks publishing while it is not done. */
            required: boolean;
        };
        /** @enum {string} */
        CheckStatus: "off" | "problem" | "ok" | "warning";
        ClientRefusal: {
            minimumVersion: string;
            message: string;
            updateUrl: string | null;
        };
        CollectionDetail: {
            titles: components["schemas"]["CollectionTitleView"][];
            id: string;
            slug: string;
            name: string;
            synopsis: string;
            visible: boolean;
            position: number;
            poster: components["schemas"]["ImageView"] | null;
            backdrop: components["schemas"]["ImageView"] | null;
            titleCount: number;
            /** @description Posters of its first titles, for a picture of the collection without a poster of its own. */
            covers: components["schemas"]["ImageView"][];
            /** @description Where it was imported from, or null for one made by hand. */
            metadataSource: string | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        CollectionTitleView: {
            id: string;
            type: components["schemas"]["TitleType"];
            name: string;
            releaseYear: number | null;
            status: components["schemas"]["PublishStatus"];
            poster: components["schemas"]["ImageView"] | null;
        };
        CollectionView: {
            id: string;
            slug: string;
            name: string;
            synopsis: string;
            visible: boolean;
            position: number;
            poster: components["schemas"]["ImageView"] | null;
            backdrop: components["schemas"]["ImageView"] | null;
            titleCount: number;
            /** @description Posters of its first titles, for a picture of the collection without a poster of its own. */
            covers: components["schemas"]["ImageView"][];
            /** @description Where it was imported from, or null for one made by hand. */
            metadataSource: string | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        CouponPlansQuote: {
            code: string;
            /** @enum {string} */
            kind: "PERCENT" | "AMOUNT";
            percentOff: number | null;
            amountOff: number | null;
            currency: string;
            /** @enum {string} */
            duration: "ONCE" | "REPEATING" | "FOREVER";
            durationMonths: number | null;
            lasts: string;
            /** @description Per plan and way to pay. Null where the code does not apply or the plan is not sold that way. */
            plans: {
                planId: string;
                month: components["schemas"]["CouponPrice"] | null;
                year: components["schemas"]["CouponPrice"] | null;
            }[];
        };
        CouponPrice: {
            listAmount: number;
            discountAmount: number;
            finalAmount: number;
        };
        CouponQuote: {
            code: string;
            /** @enum {string} */
            kind: "PERCENT" | "AMOUNT";
            percentOff: number | null;
            amountOff: number | null;
            currency: string;
            listAmount: number;
            discountAmount: number;
            /** @description What the first payment is over. 0: nothing is charged. */
            finalAmount: number;
            /** @description For a plan: for how long the price stays lower. Null for a title. */
            duration: ("ONCE" | "REPEATING" | "FOREVER") | null;
            durationMonths: number | null;
            /** @description The same in words: "on the first payment", "for the first 3 months". */
            lasts: string | null;
        };
        /** @enum {string} */
        CouponState: "ACTIVE" | "ENDED" | "SCHEDULED" | "USED_UP" | "OFF";
        CouponView: {
            id: string;
            code: string;
            note: string | null;
            /** @enum {string} */
            kind: "PERCENT" | "AMOUNT";
            percentOff: number | null;
            amountOff: number | null;
            /** @enum {string} */
            scope: "EVERYTHING" | "SUBSCRIPTIONS" | "TITLES";
            /** @enum {string} */
            duration: "ONCE" | "REPEATING" | "FOREVER";
            durationMonths: number | null;
            /** @description The plans it is for. Empty: every plan. */
            plans: {
                id: string;
                name: string;
            }[];
            /** Format: date-time */
            startsAt: string | null;
            /** Format: date-time */
            endsAt: string | null;
            maxRedemptions: number | null;
            oncePerViewer: boolean;
            newCustomersOnly: boolean;
            isActive: boolean;
            /** @description Where it stands now: its switch, its dates and its uses taken together. */
            state: components["schemas"]["CouponState"];
            /** @description How often it was used, and what it took off first payments in all. */
            used: number;
            discountTotal: number;
            /** Format: date-time */
            lastUsedAt: string | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        CreatedApiKey: {
            /** @description The full key. Shown once, at creation, and never again. */
            key: string;
            id: string;
            name: string;
            /** @description Public start of the key, for recognizing it. */
            prefix: string;
            scopes: string[];
            createdBy: {
                id: string;
                displayName: string;
            };
            /** Format: date-time */
            lastUsedAt: string | null;
            /** Format: date-time */
            expiresAt: string | null;
            /** Format: date-time */
            revokedAt: string | null;
            /** Format: date-time */
            createdAt: string;
        };
        CreatedAsset: {
            asset: components["schemas"]["AssetView"];
            upload: components["schemas"]["UploadInstructions"];
        };
        /** @enum {string} */
        CreditKind: "CAST" | "CREW";
        CreditView: {
            id: string;
            kind: components["schemas"]["CreditKind"];
            /** @description Cast: the character played. Crew: the job. */
            role: string | null;
            person: components["schemas"]["PersonRef"];
        };
        CustomRoleRef: {
            id: string;
            name: string;
            color: string;
        };
        DayFigures: {
            /** @description "2026-12-24" */
            day: string;
            views: number;
            viewers: number;
            watchSeconds: number;
        };
        DeliveryDetail: {
            /** @description The body as it is sent and signed. */
            payload: components["schemas"]["WebhookEnvelope"];
            /** @description The start of what the address answered at the last try. */
            responseBody: string | null;
            id: string;
            event: string;
            status: components["schemas"]["WebhookDeliveryStatus"];
            attempts: number;
            /** @description How many tries a delivery gets before it is given up. */
            maxAttempts: number;
            /** Format: date-time */
            nextAttemptAt: string | null;
            responseStatus: number | null;
            error: string | null;
            durationMs: number | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            attemptedAt: string | null;
            /** Format: date-time */
            deliveredAt: string | null;
        };
        DeliveryOverview: {
            /** @enum {string} */
            range: "24h" | "7d" | "30d";
            /** Format: date-time */
            from: string;
            hours: number;
            /**
             * @description Whether the gateway's own delivery is counted. Without it the main
             *     server's share is unknown and no overall figure can be given.
             */
            gatewayCounted: boolean;
            points: components["schemas"]["OverviewPoint"][];
        };
        DeliveryView: {
            id: string;
            event: string;
            status: components["schemas"]["WebhookDeliveryStatus"];
            attempts: number;
            /** @description How many tries a delivery gets before it is given up. */
            maxAttempts: number;
            /** Format: date-time */
            nextAttemptAt: string | null;
            responseStatus: number | null;
            error: string | null;
            durationMs: number | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            attemptedAt: string | null;
            /** Format: date-time */
            deliveredAt: string | null;
        };
        DependencyCheck: {
            status: components["schemas"]["DependencyStatus"];
            /** @description Time the check took, in milliseconds. */
            latencyMs: number;
            /** @description Present only when the dependency is down. */
            error?: string;
        };
        /** @enum {string} */
        DependencyStatus: "up" | "down";
        DeviceCodePoll: {
            /** @constant */
            status: "pending";
        } | {
            /** @constant */
            status: "denied";
        } | {
            /** @constant */
            status: "expired";
        } | {
            /** @constant */
            status: "approved";
            token: string;
            /** Format: date-time */
            expiresAt: string;
            viewer: components["schemas"]["ViewerView"];
            profile: components["schemas"]["ProfileView"];
            device: {
                id: string;
                name: string;
            };
        };
        DeviceCodeRequest: {
            userCode: string;
            device: {
                name: string;
                kind: components["schemas"]["PlayDevice"];
                platform: string;
                model: string | null;
            };
            /** Format: date-time */
            requestedAt: string;
            /** Format: date-time */
            expiresAt: string;
        };
        DeviceRef: {
            id: string;
            name: string;
            kind: components["schemas"]["PlayDevice"];
            platform: string;
        };
        DeviceView: {
            id: string;
            name: string;
            kind: components["schemas"]["PlayDevice"];
            /** @description The app: "android-tv". */
            platform: string;
            model: string | null;
            appVersion: string | null;
            /** Format: date-time */
            lastSeenAt: string;
            /** Format: date-time */
            createdAt: string;
            /** @description Whether it is signed in right now. */
            signedIn: boolean;
            /** @description Whether the request came from this device. */
            current: boolean;
        };
        DiagnosticsReport: {
            /** @description How long looking at everything took, in milliseconds. */
            tookMs: number;
            version: components["schemas"]["VersionInfo"];
            checks: components["schemas"]["Check"][];
            processes: components["schemas"]["ProcessReport"][];
            alerts: {
                /** @description Whether the owners get an email when a problem appears. */
                emailAlerts: boolean;
                /** @description Whether email is set up at all. */
                mailEnabled: boolean;
                /** @description Who gets the emails: the owners that can sign in. */
                recipients: string[];
            };
            /** @enum {string} */
            status: "problem" | "ok" | "warning";
            problems: number;
            warnings: number;
            checkedAt: string;
        };
        DiagnosticsSummary: {
            /** @enum {string} */
            status: "problem" | "ok" | "warning";
            problems: number;
            warnings: number;
            checkedAt: string;
        };
        DuplicateReport: {
            genres: number;
            categories: number;
            collections: number;
            credits: number;
            translations: number;
            packages: number;
            extras: number;
            seasons: number;
            episodes: number;
            /** @description Videos the copy points at: the film, the trailer, extras and episodes. */
            videos: number;
        };
        DuplicateResult: {
            title: components["schemas"]["TitleDetail"];
            copied: components["schemas"]["DuplicateReport"];
        };
        EdgeCommand: {
            id: string;
            /** @constant */
            type: "purge";
            /** @enum {string} */
            scope: "video" | "live" | "all";
        };
        EdgeSample: [
            number,
            number,
            number
        ];
        /** @enum {string} */
        EdgeStatus: "DISABLED" | "ONLINE" | "OFFLINE" | "NEVER_CONNECTED";
        EdgeView: {
            id: string;
            name: string;
            publicUrl: string;
            location: string | null;
            enabled: boolean;
            weight: number;
            serveVideo: boolean;
            serveLive: boolean;
            status: components["schemas"]["EdgeStatus"];
            /** Format: date-time */
            lastSeenAt: string | null;
            version: string | null;
            hostname: string | null;
            remoteIp: string | null;
            /** @description Everything delivered since the edge was added. Numbers too large for JSON, as text. */
            bytesServed: string;
            requestsServed: string;
            /** @description What the agent reports now. Null while it is not connected. */
            now: {
                bitsPerSecond: number;
                requestsPerSecond: number;
                activeRequests: number;
                hitRatio: number | null;
                startedAt: string;
                cache: {
                    bytes: number;
                    files: number;
                    limitBytes: number;
                };
                system: {
                    cpus: number;
                    load1: number | null;
                    diskFreeBytes: number | null;
                    diskTotalBytes: number | null;
                };
                refused: number;
                originErrors: number;
            } | null;
            /** @description Traffic of the last hour, oldest first: [seconds, bits per second, requests per second]. */
            samples: components["schemas"]["EdgeSample"][];
            /** @description What its copies are being emptied of, until the agent says it is done. */
            purging: ("video" | "live" | "all")[];
            /** Format: date-time */
            createdAt: string;
        };
        EdgeWithToken: {
            edge: components["schemas"]["EdgeView"];
            token: string;
        };
        EncoderSettings: {
            streamKey: string;
            /** @description "Server" in OBS and similar. Null when the address is not configured: the panel then uses its own host name. */
            rtmpServer: string | null;
            /** @description The complete address for encoders that take one. */
            rtmpUrl: string | null;
            srtUrl: string | null;
        };
        EncodingProfileWithRenditions: {
            id: string;
            name: string;
            description: string | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
            isDefault: boolean;
            /** @description Segment length in seconds. All renditions share it so they stay aligned. */
            segmentSeconds: number;
            /** @description Keyframe interval in seconds. Must divide segmentSeconds evenly. */
            keyframeSeconds: number;
            renditions: {
                id: string;
                name: string;
                /**
                 * @description Target height in pixels. Width follows the source aspect ratio.
                 *     Renditions taller than the source are skipped, so nothing is upscaled.
                 */
                height: number;
                videoBitrate: number;
                audioBitrate: number;
                /** @description Encoder preset, for example "medium" or "slow". */
                preset: string;
                videoCodec: string;
                audioCodec: string;
                profileId: string;
                sortOrder: number;
            }[];
        };
        /** @enum {string} */
        EncryptionMode: "NONE" | "AES_128";
        EpisodeView: {
            id: string;
            seasonId: string;
            number: number;
            name: string;
            synopsis: string | null;
            status: components["schemas"]["PublishStatus"];
            /** Format: date-time */
            publishedAt: string | null;
            /** @description The day it was first shown, as "2021-09-05". */
            airDate: string | null;
            runtimeMinutes: number | null;
            asset: components["schemas"]["AssetRef"] | null;
            still: components["schemas"]["ImageView"] | null;
        };
        /** @enum {string} */
        ExtraKind: "TRAILER" | "TEASER" | "CLIP" | "FEATURETTE" | "BEHIND_THE_SCENES" | "INTERVIEW" | "BLOOPERS";
        ExtraView: {
            id: string;
            kind: components["schemas"]["ExtraKind"];
            name: string;
            position: number;
            asset: components["schemas"]["AssetRef"] | null;
        };
        Figures: {
            /** @description Plays that counted: at least half a minute watched. */
            views: number;
            /** @description Different viewers among them. A visitor who is not signed in counts once per day. */
            viewers: number;
            /** @description Everything that was played, also what did not become a view. */
            watchSeconds: number;
            /** @description Views watched to the end, of all views, from 0 to 1. */
            completionRate: number;
            /** @description Seconds watched per view. */
            averageSeconds: number;
        };
        FooterLink: {
            label: string;
            url: string;
        };
        GenreView: {
            id: string;
            slug: string;
            name: string;
            titleCount: number;
            /** Format: date-time */
            createdAt: string;
        };
        GuideSourceView: {
            id: string;
            name: string;
            /** @description The address without anything secret. */
            url: string;
            enabled: boolean;
            /** @description The last import. Null before the first one. */
            lastRun: {
                at: string;
                ok: boolean;
                message: string;
            } | null;
            /** @description Programmes it holds for channels of this installation. */
            programmes: number;
            /** @description Channels its file lists. */
            channels: number;
            createdAt: string;
            updatedAt: string;
        };
        HealthReport: {
            /**
             * @description "ok" when every dependency is up, otherwise "degraded".
             * @enum {string}
             */
            status: "ok" | "degraded";
            roles: ("live" | "api" | "worker" | "scheduler")[];
            uptimeSeconds: number;
            checks: {
                database: components["schemas"]["DependencyCheck"];
                redis: components["schemas"]["DependencyCheck"];
            };
        };
        HeartbeatAnswer: {
            edge: {
                id: string;
                name: string;
                enabled: boolean;
            };
            /** @description The key the playback tokens of this edge are signed with. */
            signingKey: string;
            heartbeatSeconds: number;
            protocol: number;
            /** @description What the agent is asked to do. It names them in a later report once done. */
            commands: components["schemas"]["EdgeCommand"][];
        };
        HomeAnswer: {
            page: components["schemas"]["LayoutPage"];
            /** @description On the page of categories or genres: the one the sections are shown with. */
            example: {
                id: string;
                slug: string;
                name: string;
            } | null;
            /** @description False while the page has no sections and is what it is by itself. */
            custom: boolean;
            sections: components["schemas"]["HomeSectionAnswer"][];
        };
        /** @enum {string} */
        HomeLayout: "POSTER" | "LANDSCAPE" | "NUMBERED";
        HomeSectionAnswer: {
            id: string;
            /** @description The heading an admin gave. Null: {@link defaultName} is used. */
            name: string | null;
            sort: components["schemas"]["HomeSort"];
            kind: components["schemas"]["HomeSectionKind"];
            source: components["schemas"]["HomeSource"];
            visible: boolean;
            layout: components["schemas"]["HomeLayout"];
            titleType: ("MOVIE" | "SERIES") | null;
            limit: number;
            /** Format: date-time */
            visibleFrom: string | null;
            /** Format: date-time */
            visibleUntil: string | null;
            position: number;
            defaultName: string;
            category: {
                id: string;
                name: string;
            } | null;
            genre: {
                id: string;
                name: string;
            } | null;
            collection: {
                id: string;
                name: string;
            } | null;
            /** @description Whether viewers see it right now: switched on, inside its dates, and not empty. */
            shownNow: boolean;
            /** @description The picked titles of a MANUAL section, in their order, also those viewers cannot see. */
            picked: {
                id: string;
                name: string;
                /** @enum {string} */
                type: "MOVIE" | "SERIES";
                visible: boolean;
            }[];
            /** @description How many titles viewers get, up to the limit. */
            count: number;
            preview: components["schemas"]["PublicTitleCard"][];
        };
        /** @enum {string} */
        HomeSectionKind: "TITLES" | "HERO" | "CONTINUE_WATCHING" | "MY_LIST";
        /** @enum {string} */
        HomeSort: "CURATED" | "NEWEST" | "RELEASED" | "RATING" | "NAME";
        /** @enum {string} */
        HomeSource: "MANUAL" | "ALL" | "FEATURED" | "CATEGORY" | "GENRE" | "COLLECTION";
        IceServer: {
            urls: string[];
            username?: string;
            credential?: string;
        };
        /** @enum {string} */
        ImageKind: "POSTER" | "BACKDROP" | "STILL" | "LOGO" | "PORTRAIT";
        ImageView: {
            id: string;
            kind: components["schemas"]["ImageKind"];
            /** @description Public address of the picture. It never changes, so it can be cached for good. */
            url: string;
            width: number;
            height: number;
            bytes: number;
        };
        ImportedSeasonSummary: {
            number: number;
            name: string | null;
            episodeCount: number;
            /** @description The day its first episode was first shown, as "2021-09-05". */
            airDate: string | null;
            /** @description Path of its poster at the source. */
            poster: string | null;
        };
        ImportReport: {
            /** @description Fields of the title that were filled or replaced. */
            fields: string[];
            categoriesCreated: string[];
            /** @description Genres that were not known before. */
            genresCreated: string[];
            /** @description The collection the title was put into, when it was not in it. */
            collection: string | null;
            /** @description People that were not known before, and credits written. */
            peopleCreated: number;
            credits: number;
            seasonsCreated: number;
            episodesCreated: number;
            episodesUpdated: number;
            picturesAdded: number;
            /** @description What could not be done, in words for the admin. The rest was imported. */
            warnings: string[];
        };
        ImportResult: {
            ok: boolean;
            message: string;
            /** @description Programmes written for channels of this installation. */
            programmes: number;
            /** @description Channels the file lists, and how many of them a channel here is linked to. */
            channels: number;
            linked: number;
        };
        ImportResult2: {
            title: components["schemas"]["TitleDetail"];
            report: components["schemas"]["ImportReport"];
        };
        JobFailure: {
            titleId: string;
            name: string;
            reason: string;
        };
        /** @enum {string} */
        JobStatus: "FAILED" | "RUNNING" | "CANCELLED" | "QUEUED" | "COMPLETED";
        /** @enum {string} */
        JobType: "TRANSCODE" | "PROBE" | "REMUX" | "PACKAGE" | "THUMBNAILS" | "SUBTITLES" | "CLEANUP";
        JobView: {
            id: string;
            type: components["schemas"]["JobType"];
            status: components["schemas"]["JobStatus"];
            assetId: string | null;
            progress: number;
            attempts: number;
            maxAttempts: number;
            error: string | null;
            output: unknown;
            /** Format: date-time */
            queuedAt: string;
            /** Format: date-time */
            startedAt: string | null;
            /** Format: date-time */
            finishedAt: string | null;
        };
        KnownGuideChannel: {
            guideId: string;
            name: string;
            source: string;
        };
        LanguageUse: {
            language: string;
            titles: number;
        };
        /** @enum {string} */
        LayoutPage: "SERIES" | "CATEGORY" | "GENRE" | "HOME" | "MOVIES" | "LIVE";
        /** @enum {string} */
        LimitSource: "VIEWER" | "PLAN" | "SITE";
        ListItem: {
            title: components["schemas"]["PublicTitleCard"];
            /** Format: date-time */
            addedAt: string;
        };
        LiveAnswer: {
            /** @constant */
            protocol: "hls";
            url: string;
            expiresAt: string;
            /** @description What a player needs to share the channel with other viewers. Null when P2P is off. */
            p2p: components["schemas"]["P2pInfo"] | null;
            /** @description For `POST /viewer/streams/{id}/beat`. Null for a visitor. */
            stream: components["schemas"]["StreamTicket"] | null;
        };
        LivePlaybackInfo: {
            /** @constant */
            protocol: "hls";
            url: string;
            expiresAt: string;
            /** @description What a player needs to share the channel with other viewers. Null when P2P is off. */
            p2p: components["schemas"]["P2pInfo"] | null;
        };
        LocationView: {
            id: string;
            name: string;
            driver: components["schemas"]["StorageDriver"];
            config: components["schemas"]["PublicPoolConfig"];
            isActive: boolean;
            scanIntervalMinutes: number;
            storagePool: {
                id: string;
                name: string;
            } | null;
            processingMode: ("COPY" | "TRANSCODE" | "PASSTHROUGH") | null;
            encodingProfile: {
                id: string;
                name: string;
            } | null;
            autoPublish: boolean;
            afterImport: components["schemas"]["WatchAfterImport"];
            /** Format: date-time */
            lastScanAt: string | null;
            lastScanError: string | null;
            /** @description True while a look asked for by an admin has not happened yet. */
            scanRequested: boolean;
            /** @description Files by what became of them. States without files are left out. */
            counts: {
                FAILED?: number;
                QUEUED?: number;
                WAITING?: number;
                UNRECOGNISED?: number;
                IMPORTING?: number;
                IMPORTED?: number;
                CONFLICT?: number;
                IGNORED?: number;
            };
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        LoginResult: {
            token: string;
            /** Format: date-time */
            expiresAt: string;
            admin: components["schemas"]["AdminView"];
            /**
             * @description Set when the admin signed in with a recovery code: how many are left.
             *     A reason to make new ones, or to set the app up again.
             */
            recoveryCodesLeft?: number;
        };
        MailDelivery: {
            /** Format: date-time */
            at: string;
            /** @description The mail server's reason, when it did not take the message. */
            error: string | null;
        };
        MailStatus: {
            enabled: boolean;
            server: {
                host: string;
                port: number;
                secure: boolean;
                user: string | null;
            } | null;
            from: string | null;
            /** @description Where the links in emails lead. */
            siteUrl: string | null;
            siteName: string;
            /**
             * @description Whether viewers must confirm their address before they can watch.
             * @enum {string}
             */
            verification: "optional" | "required";
            /** @description The last attempt of the process that answered. Null when it sent nothing yet. */
            lastDelivery: components["schemas"]["MailDelivery"] | null;
        };
        MetadataPreview: {
            id: string;
            /** @description How many people the import would bring. */
            cast: number;
            crew: number;
            /** @description Movies: the name of the series of films it is part of. */
            collection: string | null;
            /** @description The first few of the cast, to recognize the title by. */
            leads: string[];
            type: components["schemas"]["TitleType"];
            language: string;
            /** @description Genres at the source, each with the category of the same name if there is one. */
            genres: {
                name: string;
                categoryId: string | null;
            }[];
            /** @description Addresses of medium-sized pictures at the source. */
            artwork: {
                poster: string | null;
                backdrop: string | null;
                logo: string | null;
            };
            seasons: components["schemas"]["ImportedSeasonSummary"][];
            existingTitleId: string | null;
            name: string;
            originalName: string | null;
            tagline: string | null;
            synopsis: string | null;
            releaseYear: number | null;
            ageRating: string | null;
            originalLanguage: string | null;
            /** @description The day of the premiere, as "1999-03-31". */
            releaseDate: string | null;
            runtimeMinutes: number | null;
            /** @description ISO 3166 codes. */
            countries: string[];
            studios: string[];
            keywords: string[];
            imdbId: string | null;
            /** @description From 0 to 10, with one decimal. Null when nobody voted. */
            rating: number | null;
            ratingCount: number | null;
            /** @description Series only. */
            seriesStatus: ("UPCOMING" | "RUNNING" | "ENDED" | "CANCELLED") | null;
            lastAirDate: string | null;
        };
        MetadataSearchResult: {
            /** @description The id at the source with its kind: "movie:603" or "tv:1399". */
            id: string;
            type: components["schemas"]["TitleType"];
            name: string;
            originalName: string | null;
            releaseYear: number | null;
            overview: string | null;
            /** @description A small poster served by the source, to recognize the title. */
            posterUrl: string | null;
            /** @description Set when the catalog already has a title imported from this entry. */
            existingTitleId: string | null;
        };
        MetadataStatus: {
            enabled: boolean;
            /** @constant */
            source: "tmdb";
            /** @description Language and country that an import defaults to. */
            language: string;
            region: string;
        };
        OverviewPoint: [
            number,
            number,
            number,
            number,
            number
        ];
        OverviewStats: {
            assets: {
                /** @description Assets that are not deleted. */
                total: number;
                byStatus: {
                    UPLOADING?: number;
                    UPLOADED?: number;
                    PROCESSING?: number;
                    READY?: number;
                    FAILED?: number;
                    DELETED?: number;
                };
                /** @description Playing time of all ready assets in milliseconds. */
                readyDurationMs: number;
            };
            catalog: {
                /** @description Movies and series, whatever their state. */
                titles: number;
                published: number;
                drafts: number;
            };
            viewers: {
                total: number;
                /** @description Accounts created in the last seven days. */
                newLast7Days: number;
                /** @description Viewers who signed in during the last thirty days. */
                activeLast30Days: number;
            };
            jobs: {
                queued: number;
                running: number;
                completedLast24h: number;
                failedLast24h: number;
            };
            storage: {
                pools: number;
                /** @description Bytes as text. */
                usedBytes: string;
                /** @description Sum of all limits as text. Null when any active pool has no limit. */
                quotaBytes: string | null;
            };
            /** @description Assets created per day, oldest first, in UTC. Days without uploads are included. */
            uploadsPerDay: {
                date: string;
                count: number;
            }[];
            recentFailures: {
                jobId: string;
                type: components["schemas"]["JobType"];
                assetId: string | null;
                assetTitle: string | null;
                error: string | null;
                /** Format: date-time */
                finishedAt: string | null;
            }[];
        };
        OwnedTitle: {
            titleId: string;
            kind: components["schemas"]["PurchaseKind"];
            /**
             * Format: date-time
             * @description Until when it may be watched. Null for a bought title.
             */
            expiresAt: string | null;
            /** @description Whether a rental was started, so the hours to finish it are running. */
            started: boolean;
        };
        OwnStream: {
            /** @description Whether it plays on the device that asks. */
            here: boolean;
            id: string;
            kind: components["schemas"]["StreamKind"];
            /** @description What is playing: "Night Train", "Deep Ocean S1 E2", "News 24". */
            subject: string;
            device: components["schemas"]["PlayDevice"];
            /** @description What the device said it is when it signed in, for naming it. */
            userAgent: string | null;
            profile: {
                id: string;
                name: string;
            } | null;
            /** Format: date-time */
            startedAt: string;
            /** Format: date-time */
            lastSeenAt: string;
        };
        OwnSubscription: {
            subscription: components["schemas"]["ViewerSubscriptionView"] | null;
            /** @description Whether titles that need a subscription are open to the viewer. */
            entitled: boolean;
            /** @description Which paid titles the subscription opens: all, or those of some packages. */
            access: components["schemas"]["ViewerAccess"];
            /** @description Whether the viewer paid online before, so a free trial is not offered again. */
            trialUsed: boolean;
            /** @description Titles the viewer rented or bought and can watch now. */
            purchases: components["schemas"]["OwnedTitle"][];
        };
        P2pInfo: {
            /** @description Address of the tracker, with the token that lets this viewer in. */
            trackerUrl: string;
            /**
             * @description Names the group of viewers who watch the same files. Nobody can work it
             *     out without being let watch, so it also keeps others out of the group.
             */
            swarmId: string;
            /**
             * @description Servers that help two players connect: STUN servers tell a player the
             *     address others can reach it at, TURN servers pass the data on when no
             *     direct way is found. A TURN server comes with a name and a password that
             *     run out with the video.
             */
            iceServers: components["schemas"]["IceServer"][];
            /** @description Whether the player shares until the viewer chooses. */
            sharingDefault: boolean;
        };
        P2pStatus: {
            /** @constant */
            state: "off";
        } | {
            /** @constant */
            state: "unreachable";
            trackerUrl: string;
            message: string;
        } | {
            /** @constant */
            state: "running";
            trackerUrl: string;
            stats: components["schemas"]["TrackerStats"];
        };
        PackageView: {
            id: string;
            name: string;
            description: string | null;
            position: number;
            /** @description Titles in it, and how many of them are published and need a subscription. */
            titles: number;
            sellableTitles: number;
            /** @description Live channels in the package. */
            channels: number;
            /** @description The plans that open it by name. Plans that open everything are not listed. */
            plans: {
                id: string;
                name: string;
            }[];
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        PageOfAdminView: {
            items: components["schemas"]["AdminView"][];
            total: number;
            page: number;
            pageSize: number;
        };
        PageOfAssetView: {
            items: components["schemas"]["AssetView"][];
            total: number;
            page: number;
            pageSize: number;
        };
        PageOfDeliveryView: {
            items: components["schemas"]["DeliveryView"][];
            total: number;
            page: number;
            pageSize: number;
        };
        PageOfidstringmetadataJsonValuecreatedAtDateactionstringadminIdstringnullentityTypestringnullentityIdstringnullipAddressstringnull: {
            items: {
                id: string;
                metadata: unknown;
                /** Format: date-time */
                createdAt: string;
                action: string;
                adminId: string | null;
                entityType: string | null;
                entityId: string | null;
                ipAddress: string | null;
            }[];
            total: number;
            page: number;
            pageSize: number;
        };
        PageOfJobView: {
            items: components["schemas"]["JobView"][];
            total: number;
            page: number;
            pageSize: number;
        };
        PageOfPaymentAdminView: {
            items: components["schemas"]["PaymentAdminView"][];
            total: number;
            page: number;
            pageSize: number;
        };
        PageOfPersonView: {
            items: components["schemas"]["PersonView"][];
            total: number;
            page: number;
            pageSize: number;
        };
        PageOfPublicTitleCard: {
            items: components["schemas"]["PublicTitleCard"][];
            total: number;
            page: number;
            pageSize: number;
        };
        PageOfRecordingView: {
            items: components["schemas"]["RecordingView"][];
            total: number;
            page: number;
            pageSize: number;
        };
        PageOfRedemptionView: {
            items: components["schemas"]["RedemptionView"][];
            total: number;
            page: number;
            pageSize: number;
        };
        PageOfRevisionView: {
            items: components["schemas"]["RevisionView"][];
            total: number;
            page: number;
            pageSize: number;
        };
        PageOfTermRow: {
            items: components["schemas"]["TermRow"][];
            total: number;
            page: number;
            pageSize: number;
        };
        PageOfTitleFigures: {
            items: components["schemas"]["TitleFigures"][];
            total: number;
            page: number;
            pageSize: number;
        };
        PageOfTitleSummary: {
            items: components["schemas"]["TitleSummary"][];
            total: number;
            page: number;
            pageSize: number;
        };
        PageOfViewerAdminView: {
            items: components["schemas"]["ViewerAdminView"][];
            total: number;
            page: number;
            pageSize: number;
        };
        PageOfWatchedFileView: {
            items: components["schemas"]["WatchedFileView"][];
            total: number;
            page: number;
            pageSize: number;
        };
        PageSummary: {
            page: components["schemas"]["LayoutPage"];
            custom: boolean;
            sections: number;
        };
        PartTranslation: {
            id: string;
            name: string | null;
            synopsis: string | null;
        };
        PaymentAdminView: {
            /** @description Null once the account is deleted. The email address stays. */
            viewer: {
                id: string;
                displayName: string;
            } | null;
            viewerEmail: string;
            planId: string | null;
            /** @description MANUAL: written down by an admin. STRIPE: collected online. */
            source: components["schemas"]["SubscriptionSource"];
            taxAmount: number;
            /** @description What stays after refunds. */
            netAmount: number;
            note: string | null;
            recordedBy: {
                id: string;
                displayName: string;
            } | null;
            /** @description Where to open it at Stripe. Null for one written down by hand. */
            externalUrl: string | null;
            /** Format: date-time */
            createdAt: string;
            id: string;
            /** @description What was paid for: a subscription, or renting or buying one title. */
            kind: components["schemas"]["PaymentKind"];
            planName: string | null;
            /** @description The title that was rented or bought. Null for a subscription. */
            titleName: string | null;
            status: components["schemas"]["PaymentStatus"];
            amount: number;
            refundedAmount: number;
            currency: string;
            /** Format: date-time */
            paidAt: string;
            /** Format: date-time */
            periodStart: string | null;
            /** Format: date-time */
            periodEnd: string | null;
            invoiceNumber: string | null;
            /** @description Where the invoice can be read and downloaded. Null when there is none. */
            invoiceUrl: string | null;
        };
        /** @enum {string} */
        PaymentKind: "SUBSCRIPTION" | "RENTAL" | "PURCHASE";
        /** @enum {string} */
        PaymentStatus: "PAID" | "PARTIALLY_REFUNDED" | "REFUNDED";
        PermissionArea: {
            /** @description The first half of the permission: `catalog` for `catalog:read`. */
            key: string;
            label: string;
            /** @description What seeing this area means. */
            read: {
                /** @enum {string} */
                permission: "admins:read" | "admins:write" | "api-keys:read" | "api-keys:write" | "audit:read" | "assets:read" | "assets:write" | "jobs:read" | "jobs:write" | "encoding-profiles:read" | "encoding-profiles:write" | "storage:read" | "storage:write" | "catalog:read" | "catalog:write" | "viewers:read" | "viewers:write" | "analytics:read" | "billing:read" | "billing:write" | "live:read" | "live:write" | "delivery:read" | "delivery:write" | "settings:read" | "settings:write";
                description: string;
            };
            /** @description What changing it means. Missing for areas that can only be seen. */
            write: {
                /** @enum {string} */
                permission: "admins:read" | "admins:write" | "api-keys:read" | "api-keys:write" | "audit:read" | "assets:read" | "assets:write" | "jobs:read" | "jobs:write" | "encoding-profiles:read" | "encoding-profiles:write" | "storage:read" | "storage:write" | "catalog:read" | "catalog:write" | "viewers:read" | "viewers:write" | "analytics:read" | "billing:read" | "billing:write" | "live:read" | "live:write" | "delivery:read" | "delivery:write" | "settings:read" | "settings:write";
                description: string;
            } | null;
            /**
             * @description Set on areas that reach beyond their own page: changing admins, for
             *     instance, is a way to every other permission. The panel shows a warning.
             */
            sensitive: boolean;
        };
        PermissionSection: {
            key: string;
            label: string;
            description: string;
            areas: components["schemas"]["PermissionArea"][];
        };
        PersonDetail: {
            credits: {
                id: string;
                kind: components["schemas"]["CreditKind"];
                role: string | null;
                title: {
                    id: string;
                    type: components["schemas"]["TitleType"];
                    name: string;
                    releaseYear: number | null;
                    status: components["schemas"]["PublishStatus"];
                    poster: components["schemas"]["ImageView"] | null;
                };
            }[];
            knownFor: string | null;
            biography: string | null;
            /** @description Set when the person came with an import. */
            metadata: {
                source: string;
                id: string;
            } | null;
            creditCount: number;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
            id: string;
            slug: string;
            name: string;
            portrait: components["schemas"]["ImageView"] | null;
        };
        PersonRef: {
            id: string;
            slug: string;
            name: string;
            portrait: components["schemas"]["ImageView"] | null;
        };
        PersonView: {
            knownFor: string | null;
            biography: string | null;
            /** @description Set when the person came with an import. */
            metadata: {
                source: string;
                id: string;
            } | null;
            creditCount: number;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
            id: string;
            slug: string;
            name: string;
            portrait: components["schemas"]["ImageView"] | null;
        };
        PlaceTest: {
            /** @description Files looked at. Capped, see {@link PlaceTest.capped}. */
            files: number;
            videos: number;
            recognised: number;
            capped: boolean;
            /**
             * @description Whether files can be moved or deleted there. A place that can only be read
             *     still imports, but leaves its files where they are.
             */
            writable: boolean;
            samples: {
                path: string;
                recognisedAs: string | null;
            }[];
        };
        PlanAdminView: {
            isOffered: boolean;
            position: number;
            /** @description Viewers who can watch through this plan right now. */
            subscribers: number;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
            id: string;
            name: string;
            description: string | null;
            features: string[];
            /** @description Prices in the smallest unit of the currency. Null when not sold for that interval. */
            monthlyAmount: number | null;
            yearlyAmount: number | null;
            trialDays: number;
            isRecommended: boolean;
            /** @description Whether the plan opens every paid title. Otherwise it opens its packages. */
            includesAll: boolean;
            packages: {
                id: string;
                name: string;
            }[];
            /**
             * @description On how many devices a subscriber plays at the same time. For viewers this
             *     is what applies: the plan's own limit, or that of the installation. Null:
             *     no limit.
             */
            maxStreams: number | null;
        };
        PlayAnswer: {
            /** @constant */
            protocol: "hls";
            /** @description URL of the HLS multivariant playlist. Relative to the API origin unless MEDIA_BASE_URL is set. */
            manifestUrl: string;
            /** @description URL of the poster picture, or null when there is none. */
            posterUrl: string | null;
            /**
             * @description URL of the WebVTT file for seek-bar previews, or null when there is none.
             *     Its cues point into a sprite sheet next to it.
             */
            thumbnailTrackUrl: string | null;
            /**
             * Format: date-time
             * @description When the URLs stop working.
             */
            expiresAt: string;
            /** @description What a player needs to share the video with other viewers. Null when P2P is off. */
            p2p: components["schemas"]["P2pInfo"] | null;
            /** @description For `POST /catalog/plays/{playId}/beat`. Null when the installation records nothing. */
            playId: string | null;
            /**
             * @description The place this device holds among the streams of the account, for
             *     `POST /viewer/streams/{id}/beat`. Null for a visitor, a trailer or an extra.
             */
            stream: components["schemas"]["StreamTicket"] | null;
        };
        PlaybackInfo: {
            /** @constant */
            protocol: "hls";
            /** @description URL of the HLS multivariant playlist. Relative to the API origin unless MEDIA_BASE_URL is set. */
            manifestUrl: string;
            /** @description URL of the poster picture, or null when there is none. */
            posterUrl: string | null;
            /**
             * @description URL of the WebVTT file for seek-bar previews, or null when there is none.
             *     Its cues point into a sprite sheet next to it.
             */
            thumbnailTrackUrl: string | null;
            /**
             * Format: date-time
             * @description When the URLs stop working.
             */
            expiresAt: string;
            /** @description What a player needs to share the video with other viewers. Null when P2P is off. */
            p2p: components["schemas"]["P2pInfo"] | null;
        };
        /** @enum {string} */
        PlayDevice: "TV" | "MOBILE" | "TABLET" | "DESKTOP" | "OTHER";
        Principal: components["schemas"]["AdminPrincipal"] | components["schemas"]["ApiKeyPrincipal"];
        ProbeResult: {
            /** @constant */
            ok: true;
            streams: components["schemas"]["SourceStreams"];
            /**
             * @description What happens to the audio of a channel that is passed through.
             * @enum {string}
             */
            audio: "none" | "copy" | "aac";
            /** @description Why the source cannot be passed through and needs transcoding. Null when it can. */
            copyObstacle: string | null;
        } | {
            /** @constant */
            ok: false;
            reason: string;
        };
        /** @description What every error looks like. */
        Problem: {
            statusCode: number;
            /** @description What went wrong, in words a person can read. */
            message: string;
            /** @description The name of the status, such as "Not Found". */
            error?: string;
            /** @description A fixed word for programs to act on, where there is one. */
            code?: string;
            /** @description On a 400: every field that was refused. */
            issues?: {
                field: string;
                message: string;
            }[];
        };
        ProcessReport: {
            id: string;
            roles: string[];
            host: string;
            pid: number;
            version: string;
            node: string;
            /** @description When it started and when it last reported, as ISO dates. */
            startedAt: string;
            seenAt: string;
            /** @description Memory it holds, in bytes. */
            memoryBytes: number;
        };
        ProfilesView: {
            profiles: components["schemas"]["ProfileView"][];
            /** @description The profile in use on this device. */
            currentId: string;
            /** @description How many profiles an account can have. */
            limit: number;
            /** @description The colours a profile can have. */
            colors: string[];
        };
        ProfileView: {
            id: string;
            name: string;
            color: string;
            /** @description The profile the account started with. It cannot be deleted. */
            isMain: boolean;
        };
        ProgrammeView: {
            id: string;
            channelId: string;
            title: string;
            subtitle: string | null;
            description: string | null;
            category: string | null;
            startsAt: string;
            endsAt: string;
            /** @description The source it was imported from. Null for one an admin entered, which can be changed. */
            source: {
                id: string;
                name: string;
            } | null;
        };
        /** @enum {string} */
        Protection: "none" | "off" | "protected" | "late";
        PublicCategory: {
            description: string | null;
            /** @description Titles in this category that viewers can see. */
            titleCount: number;
            slug: string;
            name: string;
        };
        PublicCategoryRef: {
            slug: string;
            name: string;
        };
        PublicChannel: {
            slug: string;
            name: string;
            number: number | null;
            description: string | null;
            access: components["schemas"]["TitleAccess"];
            /** @description The packages the channel is in, for the site to say whether a plan opens it. */
            packageIds: string[];
            /** @description Whether the channel is sending right now. */
            onAir: boolean;
            /** @description Minutes viewers can go back in time. 0 means only the present. */
            dvrMinutes: number;
            /** @description What the guide says is on now, and what comes after it. Null when it does not say. */
            now: components["schemas"]["PublicProgramme"] | null;
            next: components["schemas"]["PublicProgramme"] | null;
        };
        PublicCollection: {
            synopsis: string;
            poster: components["schemas"]["PublicImage"] | null;
            backdrop: components["schemas"]["PublicImage"] | null;
            /** @description Titles of the collection that viewers can see. */
            titleCount: number;
            slug: string;
            name: string;
        };
        PublicCollectionDetail: {
            /** @description In the order of the collection. */
            titles: components["schemas"]["PublicTitleCard"][];
            synopsis: string;
            poster: components["schemas"]["PublicImage"] | null;
            backdrop: components["schemas"]["PublicImage"] | null;
            /** @description Titles of the collection that viewers can see. */
            titleCount: number;
            slug: string;
            name: string;
        };
        PublicCollectionRef: {
            slug: string;
            name: string;
        };
        PublicCredit: {
            /** @description Of the person, for the address of their page. */
            slug: string;
            name: string;
            /** @description The character played, or the job. */
            role: string | null;
            portrait: components["schemas"]["PublicImage"] | null;
        };
        PublicEpisode: {
            id: string;
            number: number;
            name: string;
            synopsis: string | null;
            still: components["schemas"]["PublicImage"] | null;
            durationMs: number | null;
        };
        PublicExtra: {
            id: string;
            /** @description TRAILER, TEASER, CLIP, FEATURETTE, BEHIND_THE_SCENES, INTERVIEW or BLOOPERS. */
            kind: components["schemas"]["ExtraKind"];
            name: string;
            durationMs: number | null;
        };
        PublicGenre: {
            /** @description Titles of this genre that viewers can see. */
            titleCount: number;
            slug: string;
            name: string;
        };
        PublicGenreRef: {
            slug: string;
            name: string;
        };
        PublicGuideRow: {
            slug: string;
            programmes: components["schemas"]["PublicProgramme"][];
        };
        PublicHome: {
            /** @description True when an admin arranged the page. */
            custom: boolean;
            /** @description The opening: one title, or a few that take turns. Null: the page starts with its rows. */
            hero: {
                titles: components["schemas"]["PublicTitleCard"][];
            } | null;
            rows: components["schemas"]["PublicRow"][];
        };
        PublicImage: {
            url: string;
            width: number;
            height: number;
        };
        PublicLanguages: {
            /** @description The language the catalog is written in, such as "en". */
            default: string;
            /** @description Other languages at least one visible title is translated into, the most used first. */
            translated: {
                language: string;
                titles: number;
            }[];
        };
        PublicPerson: {
            slug: string;
            name: string;
            knownFor: string | null;
            biography: string | null;
            portrait: components["schemas"]["PublicImage"] | null;
            /** @description The titles viewers can see that the person has a part in, newest first, each once. */
            titles: {
                id: string;
                type: components["schemas"]["TitleType"];
                slug: string;
                name: string;
                tagline: string | null;
                releaseYear: number | null;
                ageRating: string | null;
                isFeatured: boolean;
                /** @description FREE, or PAID when watching needs a subscription. */
                access: components["schemas"]["TitleAccess"];
                /**
                 * @description Ids of the packages a paid title is in. A plan opens the title when it
                 *     opens everything or names one of them. Empty for a free title.
                 */
                packageIds: string[];
                /**
                 * @description What renting and buying a paid title cost, in the smallest unit of the
                 *     site's currency. Null when not on offer.
                 */
                rentAmount: number | null;
                buyAmount: number | null;
                /** @description True when no subscription opens the title: it is rented or bought only. */
                purchaseOnly: boolean;
                poster: components["schemas"]["PublicImage"] | null;
                backdrop: components["schemas"]["PublicImage"] | null;
                logo: components["schemas"]["PublicImage"] | null;
                categories: components["schemas"]["PublicCategoryRef"][];
                /** @description Movies: length of the film in milliseconds. Series: null. */
                durationMs: number | null;
                /** @description Series: seasons and episodes that can be watched. Movies: 0. */
                seasonCount: number;
                episodeCount: number;
                /** Format: date-time */
                publishedAt: string | null;
                role: string | null;
            }[];
        };
        PublicPlan: {
            id: string;
            name: string;
            description: string | null;
            features: string[];
            /** @description Prices in the smallest unit of the currency. Null when not sold for that interval. */
            monthlyAmount: number | null;
            yearlyAmount: number | null;
            trialDays: number;
            isRecommended: boolean;
            /** @description Whether the plan opens every paid title. Otherwise it opens its packages. */
            includesAll: boolean;
            packages: {
                id: string;
                name: string;
            }[];
            /**
             * @description On how many devices a subscriber plays at the same time. For viewers this
             *     is what applies: the plan's own limit, or that of the installation. Null:
             *     no limit.
             */
            maxStreams: number | null;
        };
        PublicPlans: {
            /** @description Currency of all prices, as three letters such as "EUR". */
            currency: string;
            /** @description Whether a viewer can pay online. Without it, access is granted by the operator. */
            checkout: boolean;
            /** @description Where to ask for access when there is no online payment. An https or mailto address. */
            contactUrl: string | null;
            /** @description How long a rented title can be watched: days to start, hours to finish once started. */
            rental: {
                startDays: number;
                watchHours: number;
            };
            plans: components["schemas"]["PublicPlan"][];
        };
        PublicPoolConfig: {
            basePath: string;
        } | components["schemas"]["S3PublicConfig"];
        PublicProgramme: {
            title: string;
            subtitle: string | null;
            description: string | null;
            category: string | null;
            startsAt: string;
            endsAt: string;
        };
        PublicRow: {
            /** @description Stable, for keys: "featured", "latest", "category:{slug}", "continue" or "section:{id}". */
            key: string;
            name: string;
            /**
             * @description "continue": the place of the viewer's own row of started videos. "list":
             *     the place of the titles the viewer saved. Neither has titles here.
             * @enum {string}
             */
            kind: "titles" | "continue" | "list";
            /**
             * @description How the cards look: posters, wide cards with the backdrop, or a numbered top list.
             * @enum {string}
             */
            layout: "poster" | "landscape" | "numbered";
            /** @description Set for a category row. */
            category: components["schemas"]["PublicCategoryRef"] | null;
            /** @description Where "See all" leads on the website. Null: the row shows everything it has. */
            browse: string | null;
            titles: components["schemas"]["PublicTitleCard"][];
        };
        PublicSeason: {
            number: number;
            name: string | null;
            synopsis: string | null;
            episodes: components["schemas"]["PublicEpisode"][];
        };
        PublicSite: {
            name: string;
            description: string;
            logo: {
                url: string;
                width: number;
                height: number;
            } | null;
            logoShowsName: boolean;
            icon: {
                url: string;
                width: number;
                height: number;
            } | null;
            /** @description Null: the colours the website ships with. */
            accent: {
                color: string;
                deep: string;
            } | null;
            footerText: string | null;
            footerLinks: components["schemas"]["FooterLink"][];
        };
        PublicSubjectPage: {
            /** @description True when an admin arranged the page. */
            custom: boolean;
            /** @description The opening: one title, or a few that take turns. Null: the page starts with its rows. */
            hero: {
                titles: components["schemas"]["PublicTitleCard"][];
            } | null;
            rows: components["schemas"]["PublicRow"][];
            subject: {
                slug: string;
                name: string;
                description: string | null;
            };
        };
        PublicTitleCard: {
            id: string;
            type: components["schemas"]["TitleType"];
            slug: string;
            name: string;
            tagline: string | null;
            releaseYear: number | null;
            ageRating: string | null;
            isFeatured: boolean;
            /** @description FREE, or PAID when watching needs a subscription. */
            access: components["schemas"]["TitleAccess"];
            /**
             * @description Ids of the packages a paid title is in. A plan opens the title when it
             *     opens everything or names one of them. Empty for a free title.
             */
            packageIds: string[];
            /**
             * @description What renting and buying a paid title cost, in the smallest unit of the
             *     site's currency. Null when not on offer.
             */
            rentAmount: number | null;
            buyAmount: number | null;
            /** @description True when no subscription opens the title: it is rented or bought only. */
            purchaseOnly: boolean;
            poster: components["schemas"]["PublicImage"] | null;
            backdrop: components["schemas"]["PublicImage"] | null;
            logo: components["schemas"]["PublicImage"] | null;
            categories: components["schemas"]["PublicCategoryRef"][];
            /** @description Movies: length of the film in milliseconds. Series: null. */
            durationMs: number | null;
            /** @description Series: seasons and episodes that can be watched. Movies: 0. */
            seasonCount: number;
            episodeCount: number;
            /** Format: date-time */
            publishedAt: string | null;
        };
        PublicTitleDetail: {
            originalName: string | null;
            synopsis: string | null;
            originalLanguage: string | null;
            hasTrailer: boolean;
            /** @description What kind of story it is, by name. */
            genres: components["schemas"]["PublicGenreRef"][];
            /** @description The day of the premiere, such as "1999-03-31". */
            releaseDate: string | null;
            /** @description Movies: the length. Series: what an episode usually runs. In minutes. */
            runtimeMinutes: number | null;
            /** @description Where it was made, as codes of two letters. */
            countries: string[];
            studios: string[];
            /** @description From 0 to 10 at the source, with the number of votes. */
            rating: number | null;
            ratingCount: number | null;
            /** @description Series: UPCOMING, RUNNING, ENDED or CANCELLED. */
            seriesStatus: ("UPCOMING" | "RUNNING" | "ENDED" | "CANCELLED") | null;
            /** @description Who plays in it, in the order of the title, and the first of those who made it. */
            cast: components["schemas"]["PublicCredit"][];
            crew: components["schemas"]["PublicCredit"][];
            /** @description More videos around the title that can be played, in their order. Free to watch, like the trailer. */
            extras: components["schemas"]["PublicExtra"][];
            /** @description Collections the title belongs to, such as the films of a series of films. */
            collections: components["schemas"]["PublicCollectionRef"][];
            /**
             * @description Where details and artwork were imported from, for example "tmdb". Sources
             *     ask to be named where their material is shown. Null for a title typed by hand.
             */
            metadataSource: string | null;
            /** @description Series: seasons that have something to watch, in order. Movies: empty. */
            seasons: components["schemas"]["PublicSeason"][];
            id: string;
            type: components["schemas"]["TitleType"];
            slug: string;
            name: string;
            tagline: string | null;
            releaseYear: number | null;
            ageRating: string | null;
            isFeatured: boolean;
            /** @description FREE, or PAID when watching needs a subscription. */
            access: components["schemas"]["TitleAccess"];
            /**
             * @description Ids of the packages a paid title is in. A plan opens the title when it
             *     opens everything or names one of them. Empty for a free title.
             */
            packageIds: string[];
            /**
             * @description What renting and buying a paid title cost, in the smallest unit of the
             *     site's currency. Null when not on offer.
             */
            rentAmount: number | null;
            buyAmount: number | null;
            /** @description True when no subscription opens the title: it is rented or bought only. */
            purchaseOnly: boolean;
            poster: components["schemas"]["PublicImage"] | null;
            backdrop: components["schemas"]["PublicImage"] | null;
            logo: components["schemas"]["PublicImage"] | null;
            categories: components["schemas"]["PublicCategoryRef"][];
            /** @description Movies: length of the film in milliseconds. Series: null. */
            durationMs: number | null;
            /** @description Series: seasons and episodes that can be watched. Movies: 0. */
            seasonCount: number;
            episodeCount: number;
            /** Format: date-time */
            publishedAt: string | null;
        };
        /** @enum {string} */
        PublishStatus: "DRAFT" | "PUBLISHED" | "ARCHIVED";
        PurchaseAdminView: {
            id: string;
            title: {
                id: string;
                name: string;
                slug: string;
            };
            kind: components["schemas"]["PurchaseKind"];
            status: components["schemas"]["PurchaseStatus"];
            source: components["schemas"]["SubscriptionSource"];
            /** @description Whether it can be watched right now. */
            valid: boolean;
            /** Format: date-time */
            purchasedAt: string;
            /** Format: date-time */
            startedAt: string | null;
            /** Format: date-time */
            expiresAt: string | null;
            /** @description What was paid, when money was paid. */
            amount: number | null;
            currency: string | null;
            note: string | null;
            grantedBy: {
                id: string;
                displayName: string;
            } | null;
        };
        /** @enum {string} */
        PurchaseKind: "RENT" | "BUY";
        /** @enum {string} */
        PurchaseStatus: "ACTIVE" | "REVOKED";
        /** @enum {string} */
        RecordingStatus: "FAILED" | "CANCELLED" | "SCHEDULED" | "RECORDING" | "FINISHING" | "DONE";
        RecordingView: {
            id: string;
            title: string;
            channel: {
                id: string | null;
                name: string;
            };
            startsAt: string;
            endsAt: string;
            status: components["schemas"]["RecordingStatus"];
            statusMessage: string | null;
            /** @description How much was really recorded. Null until it is known. */
            recordedSeconds: number | null;
            bytes: string | null;
            /** @description What it became in the library, and how far that is processed. */
            asset: {
                id: string;
                status: components["schemas"]["AssetStatus"];
            } | null;
            createdAt: string;
        };
        RedemptionView: {
            id: string;
            viewer: {
                id: string | null;
                email: string;
            };
            kind: components["schemas"]["PaymentKind"];
            /** @description The plan or the title, as it was called then. */
            subject: string;
            listAmount: number;
            discountAmount: number;
            currency: string;
            /** Format: date-time */
            createdAt: string;
        };
        RestoreResult: {
            /** @description How many things were brought back. */
            restored: number;
            /**
             * @description What could not be brought back, because a genre, a person or a picture
             *     of that version no longer exists.
             */
            left: components["schemas"]["Change"][];
        };
        RevenueByPlan: {
            /** @description Null for the two rows of single titles: rentals, and purchases. */
            planId: string | null;
            /** @description The name of the plan, or "Rentals", "Purchases", or "No plan". */
            planName: string;
            net: number;
            payments: number;
        };
        RevenueMonth: {
            /** @description "2026-11", in the time zone asked for. */
            month: string;
            /** @description What was paid, before refunds. */
            gross: number;
            /** @description What was returned of the payments of this month. */
            refunded: number;
            /** @description gross less refunded. */
            net: number;
            /** @description The tax in it, where the provider worked it out. */
            tax: number;
            payments: number;
            /** @description Of net: collected online, and written down by an admin. */
            online: number;
            byHand: number;
            /** @description Subscriptions paid online that started, and that ended. */
            started: number;
            ended: number;
        };
        RevenueReport: {
            currency: string;
            timeZone: string;
            months: components["schemas"]["RevenueMonth"][];
            totals: {
                gross: number;
                refunded: number;
                net: number;
                tax: number;
                payments: number;
            };
            /** @description Net revenue by plan over the same months, largest first. */
            byPlan: components["schemas"]["RevenueByPlan"][];
            /**
             * @description What the subscriptions paid online bring in per month as they stand:
             *     monthly prices, and a twelfth of yearly ones. Trials are not counted.
             */
            monthlyRecurring: number;
            /** @description The subscriptions counted in it. */
            payingSubscribers: number;
            /** @description Viewers in a free trial, who pay when it ends unless they cancel. */
            trialing: number;
            /** @description Payments in other currencies, which are left out of every sum above. */
            otherCurrencies: {
                currency: string;
                payments: number;
            }[];
        };
        RevisionDetail: {
            /** @description What bringing this version back would change now. Empty: the title is as it was then. */
            restore: components["schemas"]["Change"][];
            id: string;
            /** @description What was done, as a word: "update", "publish", "import", "restore". */
            action: string;
            /** Format: date-time */
            createdAt: string;
            /** @description Who did it. Null for the system, or an admin who is gone. */
            admin: {
                id: string;
                displayName: string;
            } | null;
            changes: components["schemas"]["Change"][];
            /** @description How many things changed. More than `changes` holds when the list was cut. */
            changeCount: number;
            /** @description True for the first revision of a title: there is nothing to compare it with. */
            first: boolean;
        };
        RevisionView: {
            id: string;
            /** @description What was done, as a word: "update", "publish", "import", "restore". */
            action: string;
            /** Format: date-time */
            createdAt: string;
            /** @description Who did it. Null for the system, or an admin who is gone. */
            admin: {
                id: string;
                displayName: string;
            } | null;
            changes: components["schemas"]["Change"][];
            /** @description How many things changed. More than `changes` holds when the list was cut. */
            changeCount: number;
            /** @description True for the first revision of a title: there is nothing to compare it with. */
            first: boolean;
        };
        RoleDeleted: {
            /** @description How many admins were moved to the other role. */
            movedAdmins: number;
        };
        RoleDetail: {
            admins: components["schemas"]["RoleHolderView"][];
            /** @description The id of a custom role. Null for a built-in one, which is named by `key`. */
            id: string | null;
            /** @description OWNER, ADMIN, EDITOR or VIEWER for a built-in role, CUSTOM for the others. */
            key: components["schemas"]["AdminRole"];
            builtIn: boolean;
            name: string;
            description: string;
            color: string;
            permissions: ("admins:read" | "admins:write" | "api-keys:read" | "api-keys:write" | "audit:read" | "assets:read" | "assets:write" | "jobs:read" | "jobs:write" | "encoding-profiles:read" | "encoding-profiles:write" | "storage:read" | "storage:write" | "catalog:read" | "catalog:write" | "viewers:read" | "viewers:write" | "analytics:read" | "billing:read" | "billing:write" | "live:read" | "live:write" | "delivery:read" | "delivery:write" | "settings:read" | "settings:write")[];
            /** @description How many admins hold it, deactivated ones included. */
            adminCount: number;
            /** @description The built-in role whose permissions this one covers, as a hint. Null for built-in roles. */
            like: ("ADMIN" | "EDITOR" | "VIEWER" | "OWNER") | null;
            /** Format: date-time */
            createdAt: string | null;
            /** Format: date-time */
            updatedAt: string | null;
        };
        RoleHolderView: {
            id: string;
            displayName: string;
            email: string;
            isActive: boolean;
        };
        RolesOverview: {
            roles: components["schemas"]["RoleView"][];
            /** @description Every permission with a sentence, grouped the way the panel is. */
            catalog: components["schemas"]["PermissionSection"][];
        };
        RoleView: {
            /** @description The id of a custom role. Null for a built-in one, which is named by `key`. */
            id: string | null;
            /** @description OWNER, ADMIN, EDITOR or VIEWER for a built-in role, CUSTOM for the others. */
            key: components["schemas"]["AdminRole"];
            builtIn: boolean;
            name: string;
            description: string;
            color: string;
            permissions: ("admins:read" | "admins:write" | "api-keys:read" | "api-keys:write" | "audit:read" | "assets:read" | "assets:write" | "jobs:read" | "jobs:write" | "encoding-profiles:read" | "encoding-profiles:write" | "storage:read" | "storage:write" | "catalog:read" | "catalog:write" | "viewers:read" | "viewers:write" | "analytics:read" | "billing:read" | "billing:write" | "live:read" | "live:write" | "delivery:read" | "delivery:write" | "settings:read" | "settings:write")[];
            /** @description How many admins hold it, deactivated ones included. */
            adminCount: number;
            /** @description The built-in role whose permissions this one covers, as a hint. Null for built-in roles. */
            like: ("ADMIN" | "EDITOR" | "VIEWER" | "OWNER") | null;
            /** Format: date-time */
            createdAt: string | null;
            /** Format: date-time */
            updatedAt: string | null;
        };
        S3PublicConfig: {
            bucket: string;
            region: string;
            endpoint?: string;
            forcePathStyle: boolean;
            keyPrefix?: string;
            accessKeyId: string;
            /**
             * @description Always true. Tells the panel a secret is stored without revealing it.
             * @constant
             */
            secretAccessKeySet: true;
        };
        SavedTitle: {
            title: {
                id: string;
                name: string;
                type: components["schemas"]["TitleType"];
                poster: components["schemas"]["PublicImage"] | null;
            };
            /** @description Lists the title stands on now. */
            saves: number;
            /** @description Of them, added within the days asked for. */
            recent: number;
            /** @description Of them, those whose profile has begun the title. */
            started: number;
        };
        SavedTitles: {
            days: number;
            /** @description Entries on all lists together. */
            saves: number;
            /** @description Of them, added within the days asked for. */
            recent: number;
            /** @description Profiles that have a list. */
            lists: number;
            /** @description Titles that stand on a list. */
            titles: number;
            /** @description The titles on the most lists. */
            top: components["schemas"]["SavedTitle"][];
        };
        SaveTermsResult: {
            /** @description Terms that have a translation after the save. */
            saved: number;
            /** @description Terms whose translation was emptied and removed. */
            cleared: number;
        };
        SeasonView: {
            id: string;
            number: number;
            name: string | null;
            synopsis: string | null;
            /** @description The day its first episode was first shown. */
            airDate: string | null;
            poster: components["schemas"]["ImageView"] | null;
            episodes: components["schemas"]["EpisodeView"][];
        };
        SharingPoint: [
            number,
            number,
            number,
            number,
            number
        ];
        SharingTraffic: {
            /** @enum {string} */
            range: "24h" | "7d" | "30d";
            /** Format: date-time */
            from: string;
            hours: number;
            video: components["schemas"]["SharingPoint"][];
            live: components["schemas"]["SharingPoint"][];
        };
        SourceStreams: {
            videoCodec: string;
            width: number;
            height: number;
            frameRate: number | null;
            audioCodec: string | null;
            audioChannels: number | null;
        };
        SourceTranslation: {
            language: string;
            name: string | null;
            tagline: string | null;
            synopsis: string | null;
            /** @description By the ids of the catalog's own seasons and episodes. Only those the source has texts for. */
            seasons: {
                id: string;
                name: string | null;
                synopsis: string | null;
            }[];
            episodes: {
                id: string;
                name: string | null;
                synopsis: string | null;
            }[];
            /** @description What could not be read, in words for the admin. */
            warnings: string[];
        };
        StartedDeviceCode: {
            /** @description The secret the device asks with from now on. It is never shown to the viewer. */
            deviceCode: string;
            /** @description What the device shows: "CDFG-HJKM". */
            userCode: string;
            /** @description Where the viewer enters the code. Shown beside it. */
            verificationUrl: string;
            /** @description The same with the code filled in, for a QR code. */
            verificationUrlComplete: string;
            /** @description Seconds until the code stops working. */
            expiresIn: number;
            /** @description Seconds to wait between asking whether the viewer has answered. */
            interval: number;
        };
        /** @enum {string} */
        StorageDriver: "LOCAL" | "S3";
        StoragePoolTestResult: {
            ok: boolean;
            latencyMs: number;
            /** @description Present when the test failed. */
            error?: string;
        };
        StoragePoolView: {
            id: string;
            name: string;
            driver: components["schemas"]["StorageDriver"];
            config: components["schemas"]["PublicPoolConfig"];
            isDefault: boolean;
            isActive: boolean;
            /** @description Bytes, as a string because the value can exceed the safe range of a JSON number. Null means unlimited. */
            quotaBytes: string | null;
            /** @description Bytes, as a string. */
            usedBytes: string;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        /** @enum {string} */
        StreamKind: "LIVE" | "VIDEO";
        StreamsView: {
            streams: components["schemas"]["StreamView"][];
            /** @description Devices that may play at the same time. Null: as many as they like. */
            limit: number | null;
            source: components["schemas"]["LimitSource"];
        };
        StreamTicket: {
            id: string;
            /** @description How often to report, in seconds. */
            beatSeconds: number;
        };
        StreamView: {
            id: string;
            kind: components["schemas"]["StreamKind"];
            /** @description What is playing: "Night Train", "Deep Ocean S1 E2", "News 24". */
            subject: string;
            device: components["schemas"]["PlayDevice"];
            /** @description What the device said it is when it signed in, for naming it. */
            userAgent: string | null;
            profile: {
                id: string;
                name: string;
            } | null;
            /** Format: date-time */
            startedAt: string;
            /** Format: date-time */
            lastSeenAt: string;
        };
        StripeAccountView: {
            id: string;
            name: string | null;
            country: string | null;
            defaultCurrency: string | null;
            chargesEnabled: boolean;
            livemode: boolean;
            /** @description Set when the account's currency is not the one prices are in here. */
            currencyMismatch: boolean;
        };
        StripeEventView: {
            id: string;
            type: string;
            /** Format: date-time */
            receivedAt: string;
            /**
             * @description "handled", "failed" with the reason in error, or "pending" while it is worked on.
             * @enum {string}
             */
            state: "handled" | "failed" | "pending";
            error: string | null;
        };
        StripeStatus: {
            /** @description False while the key is one for testing, where no money moves. */
            livemode: boolean;
            /** @description Path of the endpoint Stripe reports to, after the address of the API. */
            webhookPath: string;
            /** @description The events the endpoint must be subscribed to at Stripe. */
            webhookEvents: string[];
            /** @description Where viewers return after paying. */
            siteUrl: string;
            automaticTax: boolean;
            /** @description The last message Stripe sent. Null when none arrived yet. */
            lastEvent: components["schemas"]["StripeEventView"] | null;
            /** @description Messages of the last day that could not be handled. */
            failedEvents: number;
        };
        SubscriptionAdminView: {
            id: string;
            source: components["schemas"]["SubscriptionSource"];
            /** @description Whether it lets the viewer watch right now. */
            running: boolean;
            /** Format: date-time */
            canceledAt: string | null;
            note: string | null;
            grantedBy: {
                id: string;
                displayName: string;
            } | null;
            /** @description Id of the subscription at the payment provider, and where to open it there. */
            externalId: string | null;
            externalUrl: string | null;
            /** Format: date-time */
            createdAt: string;
            plan: {
                id: string;
                name: string;
            };
            status: components["schemas"]["SubscriptionStatus"];
            interval: ("MONTH" | "YEAR") | null;
            /** Format: date-time */
            startedAt: string;
            /**
             * Format: date-time
             * @description Until when it lets the viewer watch. Null means it has no end.
             */
            endsAt: string | null;
            /** @description Set when it ends at endsAt and is not renewed. */
            cancelAtPeriodEnd: boolean;
            /**
             * Format: date-time
             * @description When the next payment is due. Null when it is not renewed.
             */
            renewsAt: string | null;
            /** @description Whether it is paid online, so the viewer manages it at the payment provider. */
            online: boolean;
        };
        /** @enum {string} */
        SubscriptionSource: "MANUAL" | "STRIPE";
        /** @enum {string} */
        SubscriptionStatus: "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELED" | "EXPIRED";
        SubtitleTrackView: {
            id: string;
            language: string;
            label: string | null;
            source: string;
            isDefault: boolean;
            isForced: boolean;
        };
        TermField: {
            /** @description The name of the field, on the term and on its translation. */
            key: string;
            label: string;
            /** @description A text of several lines, for a larger box in the panel. */
            long: boolean;
            maxLength: number;
        };
        TermKindInfo: {
            /** @enum {string} */
            kind: "categories" | "collections" | "genres" | "people";
            label: string;
            fields: components["schemas"]["TermField"][];
            /** @description How many terms of this kind there are. */
            total: number;
        };
        TermLanguageInfo: {
            language: string;
            /** @description Per kind, how many terms have a text in this language. */
            translated: {
                categories: number;
                collections: number;
                genres: number;
                people: number;
            };
            /** @description How many titles are translated into it. */
            titles: number;
        };
        TermRow: {
            id: string;
            slug: string;
            original: components["schemas"]["TermTexts"];
            /** @description Null: nothing of this term is translated into the language. */
            translation: components["schemas"]["TermTexts"] | null;
            /** @description How many titles the term is on, to tell the ones that matter from the rest. */
            titles: number;
            /** Format: date-time */
            updatedAt: string | null;
        };
        TermsOverview: {
            kinds: components["schemas"]["TermKindInfo"][];
            /** @description The languages in use, the most used first. */
            languages: components["schemas"]["TermLanguageInfo"][];
        };
        TermTexts: {
            [key: string]: string | null;
        };
        /** @enum {string} */
        TitleAccess: "PAID" | "FREE";
        TitleAnalytics: {
            title: components["schemas"]["TitleRef"];
            totals: components["schemas"]["Figures"];
            previous: components["schemas"]["Figures"];
            days: components["schemas"]["DayFigures"][];
            /** @description For a series: its episodes that were watched, in their order. */
            episodes: {
                /** @description Plays that counted: at least half a minute watched. */
                views: number;
                /** @description Different viewers among them. A visitor who is not signed in counts once per day. */
                viewers: number;
                /** @description Everything that was played, also what did not become a view. */
                watchSeconds: number;
                /** @description Views watched to the end, of all views, from 0 to 1. */
                completionRate: number;
                /** @description Seconds watched per view. */
                averageSeconds: number;
                id: string;
                seasonNumber: number;
                number: number;
                name: string | null;
            }[];
            /**
             * @description How far viewers get: the share of views that reached at least 10 %, 20 %
             *     ... 100 % of the video, from 0 to 1.
             */
            reach: number[];
            devices: {
                device: components["schemas"]["PlayDevice"];
                views: number;
                watchSeconds: number;
            }[];
            /** @description Plays of the trailer and of the extras, however short. */
            trailerPlays: number;
            extraPlays: number;
        };
        TitleDetail: {
            originalName: string | null;
            tagline: string | null;
            synopsis: string | null;
            ageRating: string | null;
            originalLanguage: string | null;
            backdrop: components["schemas"]["ImageView"] | null;
            logo: components["schemas"]["ImageView"] | null;
            countries: string[];
            studios: string[];
            keywords: string[];
            imdbId: string | null;
            /** @description How many voted for the rating. */
            ratingCount: number | null;
            /** @description Series only: the day the newest episode was first shown. */
            lastAirDate: string | null;
            /** @description The cast in order, then the crew in order. */
            credits: components["schemas"]["CreditView"][];
            trailerAsset: components["schemas"]["AssetRef"] | null;
            /** @description More videos around the title, in their order: further trailers, clips, a look behind the scenes. */
            extras: components["schemas"]["ExtraView"][];
            /** @description The collections the title is in, by name. */
            collections: {
                id: string;
                name: string;
            }[];
            /** @description The languages the title is translated into, as tags such as "de". */
            translations: string[];
            /** @description Where the details were imported from. Null for a title typed by hand. */
            metadata: components["schemas"]["TitleMetadataRef"] | null;
            seasons: components["schemas"]["SeasonView"][];
            /** @description What is done and what is missing before the title can be published. */
            checklist: components["schemas"]["ChecklistItem"][];
            id: string;
            type: components["schemas"]["TitleType"];
            slug: string;
            name: string;
            releaseYear: number | null;
            status: components["schemas"]["PublishStatus"];
            /** Format: date-time */
            publishedAt: string | null;
            /**
             * Format: date-time
             * @description A published title is shown to viewers between these moments. Null leaves that end open.
             */
            availableFrom: string | null;
            /** Format: date-time */
            availableUntil: string | null;
            isFeatured: boolean;
            /** @description FREE, or PAID when watching needs a subscription. */
            access: components["schemas"]["TitleAccess"];
            /** @description What renting and buying cost, in the smallest unit of the currency. Null: not on offer. */
            rentAmount: number | null;
            buyAmount: number | null;
            /** @description True when no subscription opens the title: it is rented or bought only. */
            purchaseOnly: boolean;
            poster: components["schemas"]["ImageView"] | null;
            /** @description The day of the premiere, as "1999-03-31". */
            releaseDate: string | null;
            /** @description Movies: the length of the film. Series: the usual length of an episode. */
            runtimeMinutes: number | null;
            /** @description What the audience of the metadata source thinks of it, from 0 to 10. */
            rating: number | null;
            /** @description Series only: whether more episodes are to come. */
            seriesStatus: ("UPCOMING" | "RUNNING" | "ENDED" | "CANCELLED") | null;
            genres: {
                id: string;
                name: string;
            }[];
            categories: {
                id: string;
                name: string;
            }[];
            /** @description The packages the title is in. Plans open a paid title through them. */
            packages: {
                id: string;
                name: string;
            }[];
            /** @description Movies: the film's asset. Series: null. */
            asset: components["schemas"]["AssetRef"] | null;
            seasonCount: number;
            episodeCount: number;
            /** @description Series: how many episodes have a video that plays. */
            readyEpisodeCount: number;
            /**
             * @description Whether viewers can see the title right now: it is published and has
             *     something that plays. False for a published title whose video is gone.
             */
            isVisible: boolean;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        TitleFigures: {
            /** @description Null for plays whose title was deleted since. */
            title: components["schemas"]["TitleRef"] | null;
            /** @description Plays that counted: at least half a minute watched. */
            views: number;
            /** @description Different viewers among them. A visitor who is not signed in counts once per day. */
            viewers: number;
            /** @description Everything that was played, also what did not become a view. */
            watchSeconds: number;
            /** @description Views watched to the end, of all views, from 0 to 1. */
            completionRate: number;
            /** @description Seconds watched per view. */
            averageSeconds: number;
        };
        TitleMetadataRef: {
            /** @description For example "tmdb". */
            source: string;
            /** @description The id there with its kind, for example "movie:603". */
            id: string;
            language: string | null;
            /** Format: date-time */
            syncedAt: string | null;
        };
        TitleRef: {
            id: string;
            name: string;
            /** @enum {string} */
            type: "MOVIE" | "SERIES";
            poster: components["schemas"]["PublicImage"] | null;
        };
        TitleSummary: {
            id: string;
            type: components["schemas"]["TitleType"];
            slug: string;
            name: string;
            releaseYear: number | null;
            status: components["schemas"]["PublishStatus"];
            /** Format: date-time */
            publishedAt: string | null;
            /**
             * Format: date-time
             * @description A published title is shown to viewers between these moments. Null leaves that end open.
             */
            availableFrom: string | null;
            /** Format: date-time */
            availableUntil: string | null;
            isFeatured: boolean;
            /** @description FREE, or PAID when watching needs a subscription. */
            access: components["schemas"]["TitleAccess"];
            /** @description What renting and buying cost, in the smallest unit of the currency. Null: not on offer. */
            rentAmount: number | null;
            buyAmount: number | null;
            /** @description True when no subscription opens the title: it is rented or bought only. */
            purchaseOnly: boolean;
            poster: components["schemas"]["ImageView"] | null;
            /** @description The day of the premiere, as "1999-03-31". */
            releaseDate: string | null;
            /** @description Movies: the length of the film. Series: the usual length of an episode. */
            runtimeMinutes: number | null;
            /** @description What the audience of the metadata source thinks of it, from 0 to 10. */
            rating: number | null;
            /** @description Series only: whether more episodes are to come. */
            seriesStatus: ("UPCOMING" | "RUNNING" | "ENDED" | "CANCELLED") | null;
            genres: {
                id: string;
                name: string;
            }[];
            categories: {
                id: string;
                name: string;
            }[];
            /** @description The packages the title is in. Plans open a paid title through them. */
            packages: {
                id: string;
                name: string;
            }[];
            /** @description Movies: the film's asset. Series: null. */
            asset: components["schemas"]["AssetRef"] | null;
            seasonCount: number;
            episodeCount: number;
            /** @description Series: how many episodes have a video that plays. */
            readyEpisodeCount: number;
            /**
             * @description Whether viewers can see the title right now: it is published and has
             *     something that plays. False for a published title whose video is gone.
             */
            isVisible: boolean;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        /** @enum {string} */
        TitleType: "MOVIE" | "SERIES";
        TitleWatchState: {
            id: string;
            /** @description 0 when there is nothing to resume. */
            position: number;
            duration: number;
            /** @description Whether the viewer has watched this to the end at some time. */
            completed: boolean;
            /** Format: date-time */
            watchedAt: string;
        };
        TrackerStats: {
            version: string;
            connections: number;
            refusedConnections: number;
            /** @description Viewers in swarms. */
            peers: number;
            swarms: number;
            /** @description The sizes of the largest swarms, largest first. */
            largestSwarms: number[];
            announces: number;
            offersRelayed: number;
            answersRelayed: number;
            refused: number;
            startedAt: string;
        };
        TrafficPoint: [
            number,
            number,
            number,
            number,
            number,
            number
        ];
        TrafficView: {
            /** @enum {string} */
            range: "24h" | "7d" | "30d";
            /**
             * Format: date-time
             * @description The start of the first hour.
             */
            from: string;
            /** @description How many hours the range has, the running one included. */
            hours: number;
            edges: {
                id: string;
                name: string;
                points: components["schemas"]["TrafficPoint"][];
            }[];
        };
        /** @enum {string} */
        TranslationJobStatus: "FAILED" | "RUNNING" | "CANCELLED" | "QUEUED" | "COMPLETED";
        TranslationJobView: {
            id: string;
            language: string;
            overwrite: boolean;
            status: components["schemas"]["TranslationJobStatus"];
            total: number;
            done: number;
            translated: number;
            /** @description Titles the source had nothing new for. */
            unchanged: number;
            /** @description Titles that were not imported, so the source has nothing for them. */
            skipped: number;
            failed: number;
            failures: components["schemas"]["JobFailure"][];
            note: string | null;
            createdBy: {
                id: string;
                displayName: string;
            } | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            startedAt: string | null;
            /** Format: date-time */
            finishedAt: string | null;
        };
        TranslationView: {
            language: string;
            name: string | null;
            tagline: string | null;
            synopsis: string | null;
            /** @description Only seasons and episodes that have a translated text. */
            seasons: components["schemas"]["PartTranslation"][];
            episodes: components["schemas"]["PartTranslation"][];
            /** @description How much is translated, of what there is to translate: see {@link progress }. */
            filled: number;
            total: number;
            /** Format: date-time */
            updatedAt: string;
        };
        TwoFactorSetup: {
            /** @description The secret as base32, for typing it in by hand. */
            secret: string;
            /** @description The same as an address for a QR code. */
            uri: string;
        };
        TwoFactorStatus: {
            enabled: boolean;
            /** Format: date-time */
            enabledAt: string | null;
            /** @description Recovery codes that were not used yet. */
            recoveryCodesLeft: number;
            /** @description Whether this installation asks every admin for it. */
            required: boolean;
        };
        UploadInstructions: {
            /**
             * @description Protocol of the upload endpoint.
             * @constant
             */
            protocol: "tus";
            /** @description Path of the tus endpoint, relative to the API origin. */
            endpoint: string;
            /** @description Values to send in the Upload-Metadata header. The client adds "filename". */
            metadata: {
                assetId: string;
            };
            /** @description Largest accepted file in bytes. */
            maxBytes: number;
        };
        VersionInfo: {
            version: string;
            /** @description The commit the installation was built from, when it is known. */
            commit: string | null;
            node: string;
            /**
             * @description Whether a newer version exists. "unknown" when the check is switched off,
             *     failed, or there is no commit to compare with.
             * @enum {string}
             */
            update: "unknown" | "current" | "available";
            /** @description The newest commit, when it was looked up. */
            latestCommit: string | null;
            /** @description Why the answer is "unknown", in words. */
            updateNote: string | null;
        };
        ViewerAccess: {
            all: boolean;
            packageIds: string[];
        } | null;
        ViewerAccessConfig: {
            /**
             * @description Whether people can create an account themselves.
             * @enum {string}
             */
            registration: "open" | "closed";
            /**
             * @description Who may play: anyone, signed-in viewers only, or nobody.
             * @enum {string}
             */
            playback: "viewers" | "off" | "open";
            /** @description Whether the site sends email: "forgot password" and confirming an address work. */
            email: boolean;
            /**
             * @description Whether a viewer must confirm their address before they can watch.
             * @enum {string}
             */
            verification: "optional" | "required";
        };
        ViewerAdminDetail: {
            /** @description The people who share the account, the main profile first. */
            profiles: {
                id: string;
                name: string;
                color: string;
                isMain: boolean;
            }[];
            sessions: components["schemas"]["ViewerSessionAdminView"][];
            /** @description The apps the viewer is, or was, signed in on. */
            devices: {
                id: string;
                name: string;
                /** Format: date-time */
                createdAt: string;
                kind: components["schemas"]["PlayDevice"];
                /** @description The app: "android-tv". */
                platform: string;
                model: string | null;
                appVersion: string | null;
                /** Format: date-time */
                lastSeenAt: string;
                /** @description Whether it is signed in right now. */
                signedIn: boolean;
            }[];
            status: components["schemas"]["ViewerStatus"];
            /** Format: date-time */
            emailVerifiedAt: string | null;
            /** Format: date-time */
            lastLoginAt: string | null;
            /** Format: date-time */
            updatedAt: string;
            /** @description Devices signed in right now. */
            activeSessions: number;
            /** @description Devices that may play at once, when an admin set it for this viewer. Null: not set. */
            maxStreams: number | null;
            /** @description The plan the viewer watches through right now, if any. */
            plan: components["schemas"]["ViewerPlanRef"] | null;
            id: string;
            email: string;
            displayName: string;
            /** @description Whether the viewer showed that the address is theirs. */
            emailVerified: boolean;
            /** Format: date-time */
            createdAt: string;
        };
        ViewerAdminView: {
            status: components["schemas"]["ViewerStatus"];
            /** Format: date-time */
            emailVerifiedAt: string | null;
            /** Format: date-time */
            lastLoginAt: string | null;
            /** Format: date-time */
            updatedAt: string;
            /** @description Devices signed in right now. */
            activeSessions: number;
            /** @description Devices that may play at once, when an admin set it for this viewer. Null: not set. */
            maxStreams: number | null;
            /** @description The plan the viewer watches through right now, if any. */
            plan: components["schemas"]["ViewerPlanRef"] | null;
            id: string;
            email: string;
            displayName: string;
            /** @description Whether the viewer showed that the address is theirs. */
            emailVerified: boolean;
            /** Format: date-time */
            createdAt: string;
        };
        ViewerList: {
            /** @description The titles the viewer can watch right now, the last added first. */
            items: components["schemas"]["ListItem"][];
            /** @description How many more titles a list takes. */
            room: number;
        };
        ViewerListAdminItem: {
            /** @description Who of the account saved it. */
            profile: {
                id: string;
                name: string;
            };
            title: {
                id: string;
                name: string;
                type: components["schemas"]["TitleType"];
                status: components["schemas"]["PublishStatus"];
            };
            /** Format: date-time */
            addedAt: string;
            /** @description Whether this profile has begun the title since. */
            started: boolean;
        };
        ViewerListAdminView: {
            total: number;
            /** @description The latest, newest first. */
            items: components["schemas"]["ViewerListAdminItem"][];
        };
        ViewerPaymentView: {
            id: string;
            /** @description What was paid for: a subscription, or renting or buying one title. */
            kind: components["schemas"]["PaymentKind"];
            planName: string | null;
            /** @description The title that was rented or bought. Null for a subscription. */
            titleName: string | null;
            status: components["schemas"]["PaymentStatus"];
            amount: number;
            refundedAmount: number;
            currency: string;
            /** Format: date-time */
            paidAt: string;
            /** Format: date-time */
            periodStart: string | null;
            /** Format: date-time */
            periodEnd: string | null;
            invoiceNumber: string | null;
            /** @description Where the invoice can be read and downloaded. Null when there is none. */
            invoiceUrl: string | null;
        };
        ViewerPlanRef: {
            id: string;
            name: string;
            /**
             * Format: date-time
             * @description Until when. Null means it has no end.
             */
            endsAt: string | null;
        };
        ViewerPurchaseView: {
            id: string;
            title: {
                slug: string;
                name: string;
                type: string;
                poster: components["schemas"]["PublicImage"] | null;
            };
            /** Format: date-time */
            purchasedAt: string;
            /** @description Whether it can be watched right now. */
            valid: boolean;
            titleId: string;
            kind: components["schemas"]["PurchaseKind"];
            /**
             * Format: date-time
             * @description Until when it may be watched. Null for a bought title.
             */
            expiresAt: string | null;
            /** @description Whether a rental was started, so the hours to finish it are running. */
            started: boolean;
        };
        ViewerSessionAdminView: {
            ipAddress: string | null;
            id: string;
            /** Format: date-time */
            expiresAt: string;
            /** Format: date-time */
            createdAt: string;
            /** @description The app it belongs to. Null for a browser. */
            device: components["schemas"]["DeviceRef"] | null;
            /** @description The browser or app, as it named itself. */
            userAgent: string | null;
            /** Format: date-time */
            lastUsedAt: string;
        };
        ViewerSessionView: {
            id: string;
            /** @description The browser or app, as it named itself. */
            userAgent: string | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            lastUsedAt: string;
            /** Format: date-time */
            expiresAt: string;
            /** @description Whether this is the session the request came with. */
            current: boolean;
            /** @description The app it belongs to. Null for a browser. */
            device: components["schemas"]["DeviceRef"] | null;
        };
        ViewerSignIn: {
            viewer: components["schemas"]["ViewerView"];
            /** @description The profile in use after signing in: the main one. */
            profile: components["schemas"]["ProfileView"];
            /** @description For apps, which send it in the Authorization header. The website gets it as a cookie. */
            token: string;
            /** Format: date-time */
            expiresAt: string;
        };
        /** @enum {string} */
        ViewerStatus: "ACTIVE" | "DISABLED";
        ViewerSubscriptionView: {
            plan: {
                id: string;
                name: string;
            };
            status: components["schemas"]["SubscriptionStatus"];
            interval: ("MONTH" | "YEAR") | null;
            /** Format: date-time */
            startedAt: string;
            /**
             * Format: date-time
             * @description Until when it lets the viewer watch. Null means it has no end.
             */
            endsAt: string | null;
            /** @description Set when it ends at endsAt and is not renewed. */
            cancelAtPeriodEnd: boolean;
            /**
             * Format: date-time
             * @description When the next payment is due. Null when it is not renewed.
             */
            renewsAt: string | null;
            /** @description Whether it is paid online, so the viewer manages it at the payment provider. */
            online: boolean;
        };
        ViewerView: {
            id: string;
            email: string;
            displayName: string;
            /** @description Whether the viewer showed that the address is theirs. */
            emailVerified: boolean;
            /** Format: date-time */
            createdAt: string;
        };
        ViewerWatchingAdminItem: {
            id: string;
            /** @description Who of the account watched. */
            profile: {
                id: string;
                name: string;
            };
            title: {
                id: string;
                name: string;
                type: components["schemas"]["TitleType"];
            };
            episode: components["schemas"]["WatchingEpisodeRef"] | null;
            position: number;
            duration: number;
            /** Format: date-time */
            completedAt: string | null;
            /** Format: date-time */
            watchedAt: string;
        };
        ViewerWatchingAdminView: {
            /** @description Videos begun or finished. */
            total: number;
            completed: number;
            /** @description The latest, newest first. */
            items: components["schemas"]["ViewerWatchingAdminItem"][];
        };
        /** @enum {string} */
        WatchAfterImport: "MOVE" | "KEEP" | "DELETE";
        /** @enum {string} */
        WatchedFileState: "FAILED" | "QUEUED" | "WAITING" | "UNRECOGNISED" | "IMPORTING" | "IMPORTED" | "CONFLICT" | "IGNORED";
        WatchedFileView: {
            id: string;
            location: {
                id: string;
                name: string;
            };
            path: string;
            /** @description Bytes, as a string: a file can be larger than a JSON number holds exactly. */
            size: string;
            /** Format: date-time */
            modifiedAt: string;
            state: components["schemas"]["WatchedFileState"];
            /** @description "movie:603" or "tv:1399". Null while nobody knows what the file is. */
            metadataId: string | null;
            seasonNumber: number | null;
            episodeNumber: number | null;
            matchedByHand: boolean;
            title: {
                id: string;
                /** @enum {string} */
                type: "MOVIE" | "SERIES";
                name: string;
            } | null;
            episode: {
                id: string;
                name: string;
            } | null;
            asset: {
                id: string;
                status: string;
            } | null;
            publishPending: boolean;
            note: string | null;
            /** Format: date-time */
            firstSeenAt: string;
            /** Format: date-time */
            importedAt: string | null;
        };
        WatchingEpisodeRef: {
            id: string;
            seasonNumber: number;
            number: number;
            name: string;
        };
        WatchingItem: {
            /** @description Id of the video: of the episode, or of the title for a movie. */
            id: string;
            title: {
                slug: string;
                name: string;
                type: components["schemas"]["TitleType"];
            };
            episode: components["schemas"]["WatchingEpisodeRef"] | null;
            /** @description A wide picture: the still of the episode, or the backdrop of the title. */
            image: components["schemas"]["PublicImage"] | null;
            /** @description Seconds watched and seconds in total. */
            position: number;
            duration: number;
            /** Format: date-time */
            watchedAt: string;
        };
        WatchingNow: {
            watching: number;
            titles: {
                title: components["schemas"]["TitleRef"];
                watching: number;
            }[];
        };
        WatchSummary: {
            locations: number;
            counts: {
                FAILED?: number;
                QUEUED?: number;
                WAITING?: number;
                UNRECOGNISED?: number;
                IMPORTING?: number;
                IMPORTED?: number;
                CONFLICT?: number;
                IGNORED?: number;
            };
            /** @description Files an admin has to look at: not recognised, in conflict, or failed. */
            attention: number;
        };
        WebhookActivityHour: {
            /**
             * Format: date-time
             * @description The start of the hour.
             */
            start: string;
            delivered: number;
            failed: number;
            pending: number;
        };
        /** @enum {string} */
        WebhookDeliveryStatus: "FAILED" | "PENDING" | "DELIVERED";
        WebhookEnvelope: {
            /** @description The id of this delivery. A retry carries the same one, so a receiver can tell repeats. */
            id: string;
            event: string;
            /** @description When it happened, as an ISO moment. */
            createdAt: string;
            data: unknown;
        };
        WebhookEventInfo: {
            name: string;
            /**
             * @description The part of the installation it belongs to, for grouping in the panel.
             * @enum {string}
             */
            group: "Catalog" | "Media" | "Viewers" | "Billing" | "System";
            label: string;
            description: string;
            /** @description An example of `data`, as documentation that cannot go out of date unnoticed. */
            sample: {
                [key: string]: unknown;
            };
        };
        /** @enum {string} */
        WebhookOutcome: "handled" | "duplicate" | "ignored";
        WebhookReference: {
            events: components["schemas"]["WebhookEventInfo"][];
            /** @description Seconds between tries after a failure. */
            retryDelaysSeconds: number[];
            /** @description How old a request may be before a receiver should refuse it. */
            signatureToleranceSeconds: number;
            /**
             * @description Whether webhooks may go to private and local addresses.
             * @enum {string}
             */
            targets: "any" | "public";
            maxWebhooks: number;
        };
        WebhookView: {
            id: string;
            name: string;
            url: string;
            events: string[];
            isActive: boolean;
            /**
             * Format: date-time
             * @description Since when nothing got through. Null while the last delivery did.
             */
            failingSince: string | null;
            /** @description Why the system switched it off, when it did. */
            disabledReason: string | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
            /** @description The last try of any delivery. */
            lastDelivery: {
                status: components["schemas"]["WebhookDeliveryStatus"];
                /** Format: date-time */
                at: string;
                event: string;
            } | null;
            /** @description Deliveries of the last 24 hours, by what became of them. */
            recent: {
                delivered: number;
                failed: number;
                pending: number;
            };
        };
        WebhookWithSecret: {
            secret: string;
            id: string;
            name: string;
            url: string;
            events: string[];
            isActive: boolean;
            /**
             * Format: date-time
             * @description Since when nothing got through. Null while the last delivery did.
             */
            failingSince: string | null;
            /** @description Why the system switched it off, when it did. */
            disabledReason: string | null;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
            /** @description The last try of any delivery. */
            lastDelivery: {
                status: components["schemas"]["WebhookDeliveryStatus"];
                /** Format: date-time */
                at: string;
                event: string;
            } | null;
            /** @description Deliveries of the last 24 hours, by what became of them. */
            recent: {
                delivered: number;
                failed: number;
                pending: number;
            };
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    Admins_list: {
        parameters: {
            query?: {
                page?: number;
                pageSize?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageOfAdminView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Admins_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    email: string;
                    displayName: string;
                    password: string;
                    /** @enum {string} */
                    role: "OWNER" | "ADMIN" | "EDITOR" | "VIEWER" | "CUSTOM";
                    /** Format: uuid */
                    customRoleId?: string;
                };
            };
        };
        responses: {
            /** @description The answer. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Admins_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminView"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Admins_deactivate: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminView"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Admins_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    displayName?: string;
                    /** @enum {string} */
                    role?: "OWNER" | "ADMIN" | "EDITOR" | "VIEWER" | "CUSTOM";
                    /** Format: uuid */
                    customRoleId?: string;
                    isActive?: boolean;
                    password?: string;
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Admins_resetTwoFactor: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Analytics_now: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WatchingNow"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    SavedTitles_saved: {
        parameters: {
            query: {
                days: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SavedTitles"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Analytics_summary: {
        parameters: {
            query: {
                from: string;
                to: string;
                timezone?: string;
                type?: "MOVIE" | "SERIES";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnalyticsSummary"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Analytics_titles: {
        parameters: {
            query: {
                from: string;
                to: string;
                timezone?: string;
                type?: "MOVIE" | "SERIES";
                page?: number;
                pageSize?: number;
                sort?: "views" | "viewers" | "watchSeconds" | "completion";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageOfTitleFigures"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Analytics_title: {
        parameters: {
            query: {
                from: string;
                to: string;
                timezone?: string;
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TitleAnalytics"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ApiKeys_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiKeyView"][];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ApiKeys_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    scopes: ("admins:read" | "admins:write" | "api-keys:read" | "api-keys:write" | "audit:read" | "assets:read" | "assets:write" | "jobs:read" | "jobs:write" | "encoding-profiles:read" | "encoding-profiles:write" | "storage:read" | "storage:write" | "catalog:read" | "catalog:write" | "viewers:read" | "viewers:write" | "analytics:read" | "billing:read" | "billing:write" | "live:read" | "live:write" | "delivery:read" | "delivery:write" | "settings:read" | "settings:write")[];
                    /** Format: date-time */
                    expiresAt?: string;
                };
            };
        };
        responses: {
            /** @description The answer. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreatedApiKey"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ApiKeys_revoke: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    AppVersions_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AppVersionsView"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    AppVersions_save: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    rules: {
                        app: string;
                        minimum: string;
                        message?: string | null;
                        updateUrl?: string | null;
                    }[];
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AppVersionsView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Catalog_artwork: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                file: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer is written by the server as it goes: a file, a stream or a redirect. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Assets_list: {
        parameters: {
            query?: {
                page?: number;
                pageSize?: number;
                status?: "UPLOADING" | "UPLOADED" | "PROCESSING" | "READY" | "FAILED" | "DELETED";
                q?: string;
                sort?: "createdAt" | "title" | "durationMs" | "sourceBytes";
                order?: "asc" | "desc";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageOfAssetView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Assets_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    title: string;
                    /** Format: uuid */
                    storagePoolId?: string;
                    /** @enum {string} */
                    processingMode?: "COPY" | "TRANSCODE" | "PASSTHROUGH";
                    p2pEnabled?: boolean;
                    /** @enum {string} */
                    encryption?: "NONE" | "AES_128";
                };
            };
        };
        responses: {
            /** @description The answer. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreatedAsset"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Subtitles_add: {
        parameters: {
            query?: {
                language?: string;
                label?: string;
                forced?: "true" | "false";
                filename?: string;
                encoding?: "utf-8" | "utf-16le" | "windows-1250" | "windows-1251" | "windows-1252" | "windows-1253" | "windows-1254" | "windows-1255" | "windows-1256" | "windows-1257" | "windows-1258" | "iso-8859-2" | "shift_jis" | "gbk" | "big5" | "euc-kr";
            };
            header?: never;
            path: {
                assetId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AddedSubtitleView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Subtitles_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                assetId: string;
                trackId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Subtitles_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                assetId: string;
                trackId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    language?: string;
                    label?: string;
                    isForced?: boolean;
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SubtitleTrackView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Subtitles_file: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                assetId: string;
                trackId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/octet-stream": string;
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Assets_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AssetView"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Assets_delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Assets_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    title?: string;
                    p2pEnabled?: boolean;
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AssetView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Assets_media: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AssetMediaView"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Assets_createPlayback: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PlaybackInfo"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Assets_reprocess: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    processingMode?: "COPY" | "TRANSCODE" | "PASSTHROUGH";
                    /** Format: uuid */
                    encodingProfileId?: string;
                    /** @enum {string} */
                    encryption?: "NONE" | "AES_128";
                };
            };
        };
        responses: {
            /** @description The answer. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AssetView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Audit_list: {
        parameters: {
            query: {
                page: number;
                pageSize: number;
                action?: string;
                adminId?: string;
                entityType?: string;
                entityId?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageOfidstringmetadataJsonValuecreatedAtDateactionstringadminIdstringnullentityTypestringnullentityIdstringnullipAddressstringnull"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Auth_login: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    email: string;
                    password: string;
                    code?: string;
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LoginResult"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Auth_logout: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Auth_me: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Principal"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Auth_changePassword: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    currentPassword: string;
                    newPassword: string;
                };
            };
        };
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Auth_setupStatus: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        required: boolean;
                    };
                };
            };
        };
    };
    Auth_setup: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    email: string;
                    displayName: string;
                    password: string;
                };
            };
        };
        responses: {
            /** @description The answer. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AdminView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Auth_twoFactorStatus: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TwoFactorStatus"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Auth_twoFactorDisable: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    password: string;
                    code: string;
                };
            };
        };
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Auth_twoFactorConfirm: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    code: string;
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        recoveryCodes: string[];
                    };
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Auth_twoFactorRecoveryCodes: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    password: string;
                    code: string;
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        recoveryCodes: string[];
                    };
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Auth_twoFactorBegin: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    password: string;
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TwoFactorSetup"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Backups_overview: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BackupOverview"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Backups_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BackupView"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Backups_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Backups_download: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        path: string;
                        expiresAt: string;
                    };
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Backups_file: {
        parameters: {
            query: {
                token: string;
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer is written by the server as it goes: a file, a stream or a redirect. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Backups_updateSettings: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    schedule: "off" | "daily" | "weekly";
                    hour: number;
                    weekday: number;
                    keep: number;
                    storagePoolId: string | null;
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /**
                         * @description How often a backup is made on its own.
                         * @enum {string}
                         */
                        schedule: "off" | "daily" | "weekly";
                        /** @description The hour of the day it is made, in UTC. */
                        hour: number;
                        /** @description For weekly backups: the day, with 0 for Sunday as in JavaScript. */
                        weekday: number;
                        /** @description How many finished backups are kept. Older ones are deleted. */
                        keep: number;
                        /** @description Where backups are written. Null is the default storage pool. */
                        storagePoolId: string | null;
                    };
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    BillingAdmin_overview: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BillingOverview"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    PaymentsAdmin_revenue: {
        parameters: {
            query?: {
                months?: number;
                timeZone?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RevenueReport"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    BillingAdmin_checkStripe: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StripeAccountView"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    BillingAdmin_stripeEvents: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StripeEventView"][];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    PaymentsAdmin_importFromStripe: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        checked: number;
                        added: number;
                        complete: boolean;
                    };
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    StripeWebhook_receive: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @constant */
                        received: true;
                        outcome: components["schemas"]["WebhookOutcome"];
                    };
                };
            };
        };
    };
    Branding_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BrandingView"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Branding_update: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string | null;
                    description: string | null;
                    logoId: string | null;
                    logoShowsName: boolean;
                    iconId: string | null;
                    accent: string | null;
                    footerText: string | null;
                    footerLinks: {
                        label: string;
                        url: string;
                    }[];
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BrandingView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Branding_reset: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BrandingView"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    PublicCatalog_categories: {
        parameters: {
            query?: {
                language?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicCategory"][];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    PublicChannels_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicChannel"][];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    PublicChannels_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicChannel"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    PublicChannels_play: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LiveAnswer"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    PublicCatalog_collections: {
        parameters: {
            query?: {
                language?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicCollection"][];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    PublicCatalog_collection: {
        parameters: {
            query?: {
                language?: string;
            };
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicCollectionDetail"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    PublicDelivery_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        origins: string[];
                        tracker: string | null;
                    };
                };
            };
        };
    };
    SharingReport_report: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    token: string;
                    /** @enum {string} */
                    kind: "video" | "live";
                    fromServers: number;
                    fromViewers: number;
                    toViewers: number;
                };
            };
        };
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    PublicCatalog_playEpisode: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PlayAnswer"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    PublicCatalog_genres: {
        parameters: {
            query?: {
                language?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicGenre"][];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    PublicGuide_guide: {
        parameters: {
            query: {
                from?: string;
                hours: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        from: string;
                        to: string;
                        channels: components["schemas"]["PublicGuideRow"][];
                    };
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    PublicCatalog_home: {
        parameters: {
            query?: {
                language?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicHome"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    PublicCatalog_languages: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicLanguages"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    PublicCatalog_page: {
        parameters: {
            query?: {
                language?: string;
            };
            header?: never;
            path: {
                page: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicHome"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    PublicCatalog_categoryPage: {
        parameters: {
            query?: {
                language?: string;
            };
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicSubjectPage"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    PublicCatalog_genrePage: {
        parameters: {
            query?: {
                language?: string;
            };
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicSubjectPage"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    PublicCatalog_person: {
        parameters: {
            query?: {
                language?: string;
            };
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicPerson"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    PublicBilling_offered: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicPlans"];
                };
            };
        };
    };
    Plays_beat: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description Where the player is, in seconds. */
                    position: number;
                    /** @description Seconds played since the report before. */
                    watched: number;
                };
            };
        };
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Branding_site: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicSite"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    PublicCatalog_list: {
        parameters: {
            query?: {
                page?: number;
                pageSize?: number;
                type?: "MOVIE" | "SERIES";
                category?: string;
                genre?: string;
                person?: string;
                collection?: string;
                featured?: "true" | "false";
                q?: string;
                sort?: "newest" | "name" | "year" | "rating";
                language?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageOfPublicTitleCard"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    PublicCatalog_get: {
        parameters: {
            query?: {
                language?: string;
            };
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicTitleDetail"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    PublicCatalog_playExtra: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PlayAnswer"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    PublicCatalog_playTitle: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PlayAnswer"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    PublicCatalog_playTrailer: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PlayAnswer"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Catalog_listCategories: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CategoryView"][];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Catalog_createCategory: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    slug?: string;
                    description?: string | null;
                };
            };
        };
        responses: {
            /** @description The answer. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CategoryView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Catalog_removeCategory: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Catalog_updateCategory: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name?: string;
                    slug?: string;
                    description?: string | null;
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CategoryView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Catalog_reorderCategories: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    ids: string[];
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CategoryView"][];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Channels_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChannelView"][];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Channels_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    slug?: string;
                    /** @default null */
                    number?: number | null;
                    description?: string | null;
                    /**
                     * @default PULL
                     * @enum {string}
                     */
                    ingest?: "PULL" | "PUSH";
                    source?: string;
                    /**
                     * @default COPY
                     * @enum {string}
                     */
                    mode?: "COPY" | "TRANSCODE";
                    qualities?: number[];
                    /** @default false */
                    published?: boolean;
                    /**
                     * @default FREE
                     * @enum {string}
                     */
                    access?: "FREE" | "PAID";
                    packageIds?: string[];
                    guideId?: string | null;
                    /** @default 0 */
                    dvrMinutes?: number;
                    /** @default false */
                    start?: boolean;
                };
            };
        };
        responses: {
            /** @description The answer. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChannelView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Guide_listProgrammes: {
        parameters: {
            query: {
                from: string;
                to: string;
            };
            header?: never;
            path: {
                channelId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProgrammeView"][];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Guide_createProgramme: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                channelId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    title: string;
                    subtitle?: string | null;
                    description?: string | null;
                    category?: string | null;
                    /** Format: date-time */
                    startsAt: string;
                    /** Format: date-time */
                    endsAt: string;
                };
            };
        };
        responses: {
            /** @description The answer. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProgrammeView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Channels_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChannelDetails"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Channels_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Channels_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name?: string;
                    slug?: string;
                    number?: number | null;
                    description?: string | null;
                    /** @enum {string} */
                    ingest?: "PULL" | "PUSH";
                    source?: string;
                    /** @enum {string} */
                    mode?: "COPY" | "TRANSCODE";
                    qualities?: number[];
                    published?: boolean;
                    /** @enum {string} */
                    access?: "FREE" | "PAID";
                    packageIds?: string[];
                    guideId?: string | null;
                    dvrMinutes?: number;
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChannelView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Channels_encoder: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EncoderSettings"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Channels_createPlayback: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LivePlaybackInfo"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Channels_restart: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChannelView"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Channels_source: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        source: string;
                    };
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Channels_start: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChannelView"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Channels_stop: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ChannelView"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Channels_replaceStreamKey: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EncoderSettings"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Channels_probe: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    source: string;
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProbeResult"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Collections_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CollectionView"][];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Collections_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    slug?: string;
                    synopsis?: string;
                    visible?: boolean;
                    titleIds?: string[];
                };
            };
        };
        responses: {
            /** @description The answer. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CollectionDetail"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Collections_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CollectionDetail"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Collections_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Collections_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name?: string;
                    slug?: string;
                    synopsis?: string;
                    visible?: boolean;
                    posterId?: string | null;
                    backdropId?: string | null;
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CollectionDetail"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Collections_setTitles: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    titleIds: string[];
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CollectionDetail"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Collections_order: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    ids: string[];
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CollectionView"][];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Coupons_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CouponView"][];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Coupons_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    code: string;
                    /** @enum {string} */
                    kind: "PERCENT" | "AMOUNT";
                    note?: string | null;
                    percentOff?: number | null;
                    amountOff?: number | null;
                    /** @enum {string} */
                    scope?: "EVERYTHING" | "SUBSCRIPTIONS" | "TITLES";
                    /** @enum {string} */
                    duration?: "ONCE" | "REPEATING" | "FOREVER";
                    durationMonths?: number | null;
                    planIds?: string[];
                    startsAt?: string | null;
                    endsAt?: string | null;
                    maxRedemptions?: number | null;
                    oncePerViewer?: boolean;
                    newCustomersOnly?: boolean;
                    isActive?: boolean;
                };
            };
        };
        responses: {
            /** @description The answer. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CouponView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Coupons_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CouponView"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Coupons_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Coupons_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    code?: string;
                    note?: string | null;
                    /** @enum {string} */
                    kind?: "PERCENT" | "AMOUNT";
                    percentOff?: number | null;
                    amountOff?: number | null;
                    /** @enum {string} */
                    scope?: "EVERYTHING" | "SUBSCRIPTIONS" | "TITLES";
                    /** @enum {string} */
                    duration?: "ONCE" | "REPEATING" | "FOREVER";
                    durationMonths?: number | null;
                    planIds?: string[];
                    startsAt?: string | null;
                    endsAt?: string | null;
                    maxRedemptions?: number | null;
                    oncePerViewer?: boolean;
                    newCustomersOnly?: boolean;
                    isActive?: boolean;
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CouponView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Coupons_redemptions: {
        parameters: {
            query?: {
                page?: number;
                pageSize?: number;
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageOfRedemptionView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Diagnostics_report: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DiagnosticsReport"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Diagnostics_updateSettings: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AlertSettings"];
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AlertSettings"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Diagnostics_summary: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        summary: components["schemas"]["DiagnosticsSummary"] | null;
                    };
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    EdgeAgent_asset: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                assetId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        version: string;
                    };
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    EdgeAgent_heartbeat: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @default 1 */
                    protocol?: number;
                    version: string;
                    /** @default  */
                    hostname?: string;
                    /** Format: date-time */
                    startedAt: string;
                    counters: {
                        requests: number;
                        bytesSent: number;
                        hits: number;
                        misses: number;
                        refused: number;
                        originErrors: number;
                        /** @default 0 */
                        bytesFetched?: number;
                    };
                    activeRequests: number;
                    cache: {
                        bytes: number;
                        files: number;
                        limitBytes: number;
                    };
                    system: {
                        cpus: number;
                        /** @default null */
                        load1?: number | null;
                        /** @default null */
                        diskFreeBytes?: number | null;
                        /** @default null */
                        diskTotalBytes?: number | null;
                    };
                    /** @default [] */
                    acknowledged?: string[];
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HeartbeatAnswer"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    EdgeAgent_liveFile: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                channelId: string;
                fileName: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer is written by the server as it goes: a file, a stream or a redirect. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    EdgeAgent_media: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                assetId: string;
                filePath: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer is written by the server as it goes: a file, a stream or a redirect. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Edges_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EdgeView"][];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Edges_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    publicUrl: string;
                    location?: string | null;
                    /** @default 10 */
                    weight?: number;
                    /** @default true */
                    serveVideo?: boolean;
                    /** @default true */
                    serveLive?: boolean;
                    /** @default true */
                    enabled?: boolean;
                };
            };
        };
        responses: {
            /** @description The answer. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EdgeWithToken"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Edges_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EdgeView"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Edges_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Edges_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name?: string;
                    publicUrl?: string;
                    location?: string | null;
                    weight?: number;
                    serveVideo?: boolean;
                    serveLive?: boolean;
                    enabled?: boolean;
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EdgeView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Edges_purge: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * @default all
                     * @enum {string}
                     */
                    scope?: "all" | "video" | "live";
                };
            };
        };
        responses: {
            /** @description The answer. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EdgeView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Edges_replaceToken: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EdgeWithToken"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Edges_overview: {
        parameters: {
            query?: {
                range?: "24h" | "7d" | "30d";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DeliveryOverview"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Edges_traffic: {
        parameters: {
            query?: {
                range?: "24h" | "7d" | "30d";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TrafficView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    EncodingProfiles_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EncodingProfileWithRenditions"][];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    EncodingProfiles_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    description?: string;
                    /** @default false */
                    isDefault?: boolean;
                    /** @default 4 */
                    segmentSeconds?: number;
                    /** @default 2 */
                    keyframeSeconds?: number;
                    renditions: {
                        name: string;
                        height: number;
                        videoBitrate: number;
                        audioBitrate: number;
                        /**
                         * @default medium
                         * @enum {string}
                         */
                        preset?: "ultrafast" | "superfast" | "veryfast" | "faster" | "fast" | "medium" | "slow" | "slower" | "veryslow";
                    }[];
                };
            };
        };
        responses: {
            /** @description The answer. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EncodingProfileWithRenditions"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    EncodingProfiles_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EncodingProfileWithRenditions"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    EncodingProfiles_delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    EncodingProfiles_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name?: string;
                    description?: string | null;
                    /** @constant */
                    isDefault?: true;
                    segmentSeconds?: number;
                    keyframeSeconds?: number;
                    renditions?: {
                        name: string;
                        height: number;
                        videoBitrate: number;
                        audioBitrate: number;
                        /**
                         * @default medium
                         * @enum {string}
                         */
                        preset?: "ultrafast" | "superfast" | "veryfast" | "faster" | "fast" | "medium" | "slow" | "slower" | "veryslow";
                    }[];
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EncodingProfileWithRenditions"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Catalog_removeEpisode: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TitleDetail"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Catalog_updateEpisode: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    number?: number;
                    name?: string;
                    synopsis?: string | null;
                    airDate?: string | null;
                    runtimeMinutes?: number | null;
                    assetId?: string | null;
                    stillId?: string | null;
                    /** @enum {string} */
                    status?: "DRAFT" | "PUBLISHED";
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EpisodeView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Events_open: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer is written by the server as it goes: a file, a stream or a redirect. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Collections_removeExtra: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Collections_updateExtra: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    kind?: "TRAILER" | "TEASER" | "CLIP" | "FEATURETTE" | "BEHIND_THE_SCENES" | "INTERVIEW" | "BLOOPERS";
                    name?: string;
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExtraView"][];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    People_listGenres: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GenreView"][];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    People_createGenre: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    slug?: string;
                };
            };
        };
        responses: {
            /** @description The answer. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GenreView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    People_removeGenre: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    People_updateGenre: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name?: string;
                    slug?: string;
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GenreView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Guide_searchKnown: {
        parameters: {
            query?: {
                q?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["KnownGuideChannel"][];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Guide_listSources: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GuideSourceView"][];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Guide_createSource: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    url: string;
                    /** @default true */
                    enabled?: boolean;
                };
            };
        };
        responses: {
            /** @description The answer. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GuideSourceView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Guide_removeSource: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Guide_updateSource: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name?: string;
                    url?: string;
                    enabled?: boolean;
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GuideSourceView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Guide_importSource: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ImportResult"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Guide_sourceUrl: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        url: string;
                    };
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Health_readiness: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HealthReport"];
                };
            };
        };
    };
    Health_liveness: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @constant */
                        status: "ok";
                    };
                };
            };
        };
    };
    Catalog_uploadImage: {
        parameters: {
            query: {
                kind: "POSTER" | "BACKDROP" | "STILL" | "LOGO" | "PORTRAIT";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ImageView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Catalog_removeImage: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Jobs_list: {
        parameters: {
            query: {
                page: number;
                pageSize: number;
                assetId?: string;
                status?: "FAILED" | "RUNNING" | "CANCELLED" | "QUEUED" | "COMPLETED";
                type?: "TRANSCODE" | "PROBE" | "REMUX" | "PACKAGE" | "THUMBNAILS" | "SUBTITLES" | "CLEANUP";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageOfJobView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Jobs_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["JobView"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Jobs_cancel: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["JobView"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Jobs_retry: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["JobView"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Home_pages: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageSummary"][];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Home_get: {
        parameters: {
            query?: {
                example?: string;
            };
            header?: never;
            path: {
                page: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HomeAnswer"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Home_reset: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                page: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Home_create: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                page: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    kind: "HERO" | "CONTINUE_WATCHING" | "MY_LIST" | "TITLES";
                    name?: string | null;
                    /** @enum {string} */
                    source?: "ALL" | "FEATURED" | "CATEGORY" | "GENRE" | "COLLECTION" | "MANUAL";
                    categoryId?: string | null;
                    genreId?: string | null;
                    collectionId?: string | null;
                    titleType?: ("MOVIE" | "SERIES") | null;
                    /** @enum {string} */
                    sort?: "CURATED" | "NEWEST" | "RELEASED" | "RATING" | "NAME";
                    limit?: number;
                    /** @enum {string} */
                    layout?: "POSTER" | "LANDSCAPE" | "NUMBERED";
                    visible?: boolean;
                    visibleFrom?: string | null;
                    visibleUntil?: string | null;
                    titleIds?: string[];
                };
            };
        };
        responses: {
            /** @description The answer. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HomeSectionAnswer"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Home_order: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                page: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    ids: string[];
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HomeAnswer"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Home_start: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                page: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HomeAnswer"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Home_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Home_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name?: string | null;
                    /** @enum {string} */
                    source?: "ALL" | "FEATURED" | "CATEGORY" | "GENRE" | "COLLECTION" | "MANUAL";
                    categoryId?: string | null;
                    genreId?: string | null;
                    collectionId?: string | null;
                    titleType?: ("MOVIE" | "SERIES") | null;
                    /** @enum {string} */
                    sort?: "CURATED" | "NEWEST" | "RELEASED" | "RATING" | "NAME";
                    limit?: number;
                    /** @enum {string} */
                    layout?: "POSTER" | "LANDSCAPE" | "NUMBERED";
                    visible?: boolean;
                    visibleFrom?: string | null;
                    visibleUntil?: string | null;
                    titleIds?: string[];
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HomeSectionAnswer"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    LiveMedia_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                channelId: string;
                token: string;
                fileName: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer is written by the server as it goes: a file, a stream or a redirect. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Ingest_auth: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": unknown;
            };
        };
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Mail_status: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MailStatus"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Mail_test: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    to: string;
                };
            };
        };
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Media_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                assetId: string;
                token: string;
                filePath: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer is written by the server as it goes: a file, a stream or a redirect. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    AppVersions_meta: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiMeta"];
                };
            };
        };
    };
    Metadata_status: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MetadataStatus"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Metadata_importNew: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    id: string;
                    language?: string;
                    /** @default true */
                    text?: boolean;
                    /** @default true */
                    genres?: boolean;
                    /** @default true */
                    people?: boolean;
                    /** @default true */
                    portraits?: boolean;
                    /** @default true */
                    collection?: boolean;
                    /** @default true */
                    categories?: boolean;
                    /** @default true */
                    createCategories?: boolean;
                    /** @default true */
                    artwork?: boolean;
                    /** @default true */
                    episodes?: boolean;
                    /** @default true */
                    stills?: boolean;
                    /** @default false */
                    specials?: boolean;
                    /** @default false */
                    allowDuplicate?: boolean;
                };
            };
        };
        responses: {
            /** @description The answer. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ImportResult2"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Metadata_preview: {
        parameters: {
            query: {
                id: string;
                language?: string;
                specials?: "true" | "false";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MetadataPreview"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Metadata_search: {
        parameters: {
            query: {
                type: "MOVIE" | "SERIES";
                q: string;
                year?: number;
                language?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MetadataSearchResult"][];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    OpenApi_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
        };
    };
    P2p_status: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["P2pStatus"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    P2p_traffic: {
        parameters: {
            query?: {
                range?: "24h" | "7d" | "30d";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SharingTraffic"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Packages_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PackageView"][];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Packages_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    description?: string | null;
                };
            };
        };
        responses: {
            /** @description The answer. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PackageView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Packages_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Packages_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name?: string;
                    description?: string | null;
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PackageView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Packages_changeTitles: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @default [] */
                    add?: string[];
                    /** @default [] */
                    remove?: string[];
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PackageView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Packages_reorder: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    ids: string[];
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PackageView"][];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    PaymentsAdmin_list: {
        parameters: {
            query?: {
                page?: number;
                pageSize?: number;
                source?: "MANUAL" | "STRIPE";
                status?: "PAID" | "PARTIALLY_REFUNDED" | "REFUNDED";
                planId?: string;
                kind?: "SUBSCRIPTION" | "RENTAL" | "PURCHASE";
                q?: string;
                from?: unknown;
                to?: unknown;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageOfPaymentAdminView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    PaymentsAdmin_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    PaymentsAdmin_export: {
        parameters: {
            query?: {
                source?: "MANUAL" | "STRIPE";
                status?: "PAID" | "PARTIALLY_REFUNDED" | "REFUNDED";
                planId?: string;
                kind?: "SUBSCRIPTION" | "RENTAL" | "PURCHASE";
                q?: string;
                from?: unknown;
                to?: unknown;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer is written by the server as it goes: a file, a stream or a redirect. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    People_listPeople: {
        parameters: {
            query?: {
                page?: number;
                pageSize?: number;
                q?: string;
                sort?: "name" | "createdAt" | "credits";
                order?: "asc" | "desc";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageOfPersonView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    People_createPerson: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    knownFor?: string | null;
                    biography?: string | null;
                    portraitId?: string | null;
                };
            };
        };
        responses: {
            /** @description The answer. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PersonView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    People_getPerson: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PersonDetail"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    People_removePerson: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    People_updatePerson: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name?: string;
                    slug?: string;
                    knownFor?: string | null;
                    biography?: string | null;
                    portraitId?: string | null;
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PersonView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    BillingAdmin_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PlanAdminView"][];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    BillingAdmin_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    description?: string | null;
                    features?: string[];
                    /** @default null */
                    monthlyAmount?: number | null;
                    /** @default null */
                    yearlyAmount?: number | null;
                    /** @default 0 */
                    trialDays?: number;
                    /** @default true */
                    isOffered?: boolean;
                    /** @default false */
                    isRecommended?: boolean;
                    /** @default true */
                    includesAll?: boolean;
                    /** @default null */
                    maxStreams?: number | null;
                    /** @default [] */
                    packageIds?: string[];
                };
            };
        };
        responses: {
            /** @description The answer. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PlanAdminView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    BillingAdmin_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    BillingAdmin_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name?: string;
                    description?: string | null;
                    features?: string[];
                    monthlyAmount?: number | null;
                    yearlyAmount?: number | null;
                    trialDays?: number;
                    isOffered?: boolean;
                    isRecommended?: boolean;
                    includesAll?: boolean;
                    maxStreams?: number | null;
                    packageIds?: string[];
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PlanAdminView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    BillingAdmin_reorder: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    ids: string[];
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PlanAdminView"][];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Guide_removeProgramme: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Guide_updateProgramme: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    title?: string;
                    subtitle?: string | null;
                    description?: string | null;
                    category?: string | null;
                    /** Format: date-time */
                    startsAt?: string;
                    /** Format: date-time */
                    endsAt?: string;
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProgrammeView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Recordings_recordProgramme: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RecordingView"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    PurchasesAdmin_revoke: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PurchaseAdminView"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Recordings_list: {
        parameters: {
            query?: {
                page?: number;
                pageSize?: number;
                show?: "all" | "open" | "finished";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageOfRecordingView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Recordings_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    channelId: string;
                    title: string;
                    /** Format: date-time */
                    startsAt: string;
                    /** Format: date-time */
                    endsAt: string;
                };
            };
        };
        responses: {
            /** @description The answer. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RecordingView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Recordings_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Recordings_stop: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RecordingView"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    AdminRoles_overview: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RolesOverview"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    AdminRoles_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    /** @default  */
                    description?: string;
                    /**
                     * @default slate
                     * @enum {string}
                     */
                    color?: "slate" | "blue" | "cyan" | "teal" | "green" | "amber" | "orange" | "rose" | "violet";
                    permissions: string[];
                };
            };
        };
        responses: {
            /** @description The answer. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoleView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    AdminRoles_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoleDetail"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    AdminRoles_remove: {
        parameters: {
            query?: {
                moveTo?: ("ADMIN" | "EDITOR" | "VIEWER") | string;
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoleDeleted"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    AdminRoles_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name?: string;
                    description?: string;
                    /** @enum {string} */
                    color?: "slate" | "blue" | "cyan" | "teal" | "green" | "amber" | "orange" | "rose" | "violet";
                    permissions?: string[];
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RoleView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Catalog_removeSeason: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TitleDetail"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Catalog_updateSeason: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    number?: number;
                    name?: string | null;
                    synopsis?: string | null;
                    airDate?: string | null;
                    posterId?: string | null;
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TitleDetail"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Catalog_createEpisode: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    number?: number;
                    name: string;
                    synopsis?: string | null;
                    assetId?: string | null;
                };
            };
        };
        responses: {
            /** @description The answer. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EpisodeView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Stats_overview: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OverviewStats"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    StoragePools_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StoragePoolView"][];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    StoragePools_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    /** @default false */
                    isDefault?: boolean;
                    quotaBytes?: number | string;
                    /** @constant */
                    driver: "LOCAL";
                    config: {
                        basePath: string;
                    };
                } | {
                    name: string;
                    /** @default false */
                    isDefault?: boolean;
                    quotaBytes?: number | string;
                    /** @constant */
                    driver: "S3";
                    config: {
                        bucket: string;
                        /** @default us-east-1 */
                        region?: string;
                        /** Format: uri */
                        endpoint?: string;
                        /** @default false */
                        forcePathStyle?: boolean;
                        keyPrefix?: string;
                        accessKeyId: string;
                        secretAccessKey: string;
                    };
                };
            };
        };
        responses: {
            /** @description The answer. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StoragePoolView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    StoragePools_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StoragePoolView"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    StoragePools_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name?: string;
                    isActive?: boolean;
                    /** @constant */
                    isDefault?: true;
                    quotaBytes?: (number | string) | null;
                    config?: {
                        [key: string]: unknown;
                    };
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StoragePoolView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    StoragePools_test: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StoragePoolTestResult"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    BillingAdmin_change: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    planId?: string;
                    endsAt?: unknown | null;
                    note?: string | null;
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SubscriptionAdminView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    BillingAdmin_end: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SubscriptionAdminView"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    BillingAdmin_refresh: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SubscriptionAdminView"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Catalog_listTitles: {
        parameters: {
            query?: {
                page?: number;
                pageSize?: number;
                type?: "MOVIE" | "SERIES";
                status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
                categoryId?: string;
                genreId?: string;
                personId?: string;
                seriesStatus?: "UPCOMING" | "RUNNING" | "ENDED" | "CANCELLED";
                video?: "ready" | "missing";
                collectionId?: string;
                availability?: "scheduled" | "current" | "ended";
                access?: "FREE" | "PAID";
                packageId?: string;
                packaged?: "none";
                q?: string;
                sort?: "createdAt" | "updatedAt" | "name" | "releaseYear" | "publishedAt" | "releaseDate" | "rating" | "runtimeMinutes";
                order?: "asc" | "desc";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageOfTitleSummary"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Catalog_createTitle: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    type: "MOVIE" | "SERIES";
                    name: string;
                    slug?: string;
                };
            };
        };
        responses: {
            /** @description The answer. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TitleDetail"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Catalog_getTitle: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TitleDetail"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Catalog_removeTitle: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Catalog_updateTitle: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name?: string;
                    slug?: string;
                    originalName?: string | null;
                    tagline?: string | null;
                    synopsis?: string | null;
                    releaseYear?: number | null;
                    ageRating?: string | null;
                    originalLanguage?: string | null;
                    releaseDate?: string | null;
                    availableFrom?: string | null;
                    availableUntil?: string | null;
                    collectionIds?: string[];
                    runtimeMinutes?: number | null;
                    countries?: string[];
                    studios?: string[];
                    keywords?: string[];
                    imdbId?: string | null;
                    seriesStatus?: ("UPCOMING" | "RUNNING" | "ENDED" | "CANCELLED") | null;
                    genreIds?: string[];
                    isFeatured?: boolean;
                    /** @enum {string} */
                    access?: "FREE" | "PAID";
                    rentAmount?: number | null;
                    buyAmount?: number | null;
                    purchaseOnly?: boolean;
                    categoryIds?: string[];
                    packageIds?: string[];
                    assetId?: string | null;
                    trailerAssetId?: string | null;
                    posterId?: string | null;
                    backdropId?: string | null;
                    logoId?: string | null;
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TitleDetail"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    People_replaceCredits: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    credits: {
                        /** Format: uuid */
                        personId: string;
                        /** @enum {string} */
                        kind: "CAST" | "CREW";
                        role: string | null;
                    }[];
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreditView"][];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Catalog_duplicateTitle: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name?: string;
                    /** @default {} */
                    parts?: {
                        /** @default true */
                        artwork?: boolean;
                        /** @default true */
                        classification?: boolean;
                        /** @default false */
                        collections?: boolean;
                        /** @default true */
                        credits?: boolean;
                        /** @default true */
                        translations?: boolean;
                        /** @default true */
                        pricing?: boolean;
                        /** @default false */
                        availability?: boolean;
                        /** @default false */
                        videos?: boolean;
                        /**
                         * @default structure
                         * @enum {string}
                         */
                        seasons?: "none" | "structure" | "full";
                        /** @default false */
                        metadataLink?: boolean;
                    };
                };
            };
        };
        responses: {
            /** @description The answer. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DuplicateResult"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Collections_addExtra: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * @default TRAILER
                     * @enum {string}
                     */
                    kind?: "TRAILER" | "TEASER" | "CLIP" | "FEATURETTE" | "BEHIND_THE_SCENES" | "INTERVIEW" | "BLOOPERS";
                    name: string;
                    /** Format: uuid */
                    assetId: string;
                };
            };
        };
        responses: {
            /** @description The answer. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExtraView"][];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Collections_orderExtras: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    ids: string[];
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ExtraView"][];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    TitleHistory_list: {
        parameters: {
            query: {
                page: number;
                pageSize: number;
                /** @description Only revisions that changed something of this part. */
                group?: "access" | "artwork" | "classification" | "translations" | "videos" | "people" | "episodes" | "texts" | "facts" | "publishing";
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageOfRevisionView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    TitleHistory_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                revisionId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RevisionDetail"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    TitleHistory_restore: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                revisionId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RestoreResult"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Metadata_apply: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    id: string;
                    language?: string;
                    /** @default true */
                    text?: boolean;
                    /** @default true */
                    genres?: boolean;
                    /** @default true */
                    people?: boolean;
                    /** @default true */
                    portraits?: boolean;
                    /** @default true */
                    collection?: boolean;
                    /** @default true */
                    categories?: boolean;
                    /** @default true */
                    createCategories?: boolean;
                    /** @default true */
                    artwork?: boolean;
                    /** @default true */
                    episodes?: boolean;
                    /** @default true */
                    stills?: boolean;
                    /** @default false */
                    specials?: boolean;
                    /** @default false */
                    overwrite?: boolean;
                };
            };
        };
        responses: {
            /** @description The answer. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ImportResult2"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Catalog_createSeason: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    number?: number;
                    name?: string | null;
                    synopsis?: string | null;
                };
            };
        };
        responses: {
            /** @description The answer. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TitleDetail"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Catalog_setTitleStatus: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TitleDetail"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Translations_list: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TranslationView"][];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Translations_put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                language: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name?: string | null;
                    tagline?: string | null;
                    synopsis?: string | null;
                    seasons?: {
                        /** Format: uuid */
                        id: string;
                        name?: string | null;
                        synopsis?: string | null;
                    }[];
                    episodes?: {
                        /** Format: uuid */
                        id: string;
                        name?: string | null;
                        synopsis?: string | null;
                    }[];
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TranslationView"][];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Translations_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                language: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Metadata_sourceTranslation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                language: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SourceTranslation"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Bulk_run: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    ids?: string[];
                    filter?: {
                        /** @enum {string} */
                        type?: "MOVIE" | "SERIES";
                        /** @enum {string} */
                        status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
                        /** Format: uuid */
                        categoryId?: string;
                        /** Format: uuid */
                        genreId?: string;
                        /** Format: uuid */
                        personId?: string;
                        /** @enum {string} */
                        seriesStatus?: "UPCOMING" | "RUNNING" | "ENDED" | "CANCELLED";
                        /** @enum {string} */
                        video?: "ready" | "missing";
                        /** Format: uuid */
                        collectionId?: string;
                        /** @enum {string} */
                        availability?: "scheduled" | "current" | "ended";
                        /** @enum {string} */
                        access?: "FREE" | "PAID";
                        /** Format: uuid */
                        packageId?: string;
                        /** @enum {string} */
                        packaged?: "none";
                        q?: string;
                    };
                    action: {
                        /** @constant */
                        type: "publish";
                    } | {
                        /** @constant */
                        type: "unpublish";
                    } | {
                        /** @constant */
                        type: "archive";
                    } | {
                        /** @constant */
                        type: "delete";
                    } | {
                        /** @constant */
                        type: "feature";
                        value: boolean;
                    } | {
                        /** @constant */
                        type: "categories";
                        /** @default [] */
                        add?: string[];
                        /** @default [] */
                        remove?: string[];
                    } | {
                        /** @constant */
                        type: "genres";
                        /** @default [] */
                        add?: string[];
                        /** @default [] */
                        remove?: string[];
                    } | {
                        /** @constant */
                        type: "collections";
                        /** @default [] */
                        add?: string[];
                        /** @default [] */
                        remove?: string[];
                    } | {
                        /** @constant */
                        type: "availability";
                        availableFrom?: string | null;
                        availableUntil?: string | null;
                    } | {
                        /** @constant */
                        type: "translate";
                        language: string;
                        /** @default false */
                        overwrite?: boolean;
                    };
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BulkResult"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Bulk_list: {
        parameters: {
            query?: {
                active?: "true" | "false";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TranslationJobView"][];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Bulk_cancel: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TranslationJobView"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Translations_languages: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LanguageUse"][];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    TermTranslations_overview: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TermsOverview"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    TermTranslations_list: {
        parameters: {
            query: {
                page: number;
                pageSize: number;
                language: string;
                q?: string;
                missing?: boolean;
            };
            header?: never;
            path: {
                kind: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageOfTermRow"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    TermTranslations_save: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                kind: string;
                language: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    items: {
                        id: string;
                        texts: {
                            [key: string]: string | null;
                        };
                    }[];
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SaveTermsResult"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    TermTranslations_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                kind: string;
                language: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        removed: number;
                    };
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    PublicBilling_portal: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        url: string;
                    };
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    PublicBilling_start: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    planId: string;
                    /** @enum {string} */
                    interval: "MONTH" | "YEAR";
                    code?: string;
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        url: string;
                    };
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    PublicBilling_confirm: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    sessionId: string;
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OwnSubscription"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewerAuth_config: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ViewerAccessConfig"];
                };
            };
        };
    };
    ViewerCoupons_check: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    code: string;
                    /** Format: uuid */
                    planId: string;
                    /** @enum {string} */
                    interval: "MONTH" | "YEAR";
                } | {
                    code: string;
                    /** Format: uuid */
                    titleId: string;
                    /** @enum {string} */
                    kind: "RENT" | "BUY";
                } | {
                    code: string;
                    /** @constant */
                    plans: true;
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CouponQuote"] | components["schemas"]["CouponPlansQuote"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewerAuth_deleteOwn: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    password: string;
                };
            };
        };
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewerDevices_start: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    device: {
                        installationId: string;
                        name: string;
                        /**
                         * @default OTHER
                         * @enum {string}
                         */
                        kind?: "TV" | "MOBILE" | "TABLET" | "DESKTOP" | "OTHER";
                        platform: string;
                        model?: string;
                        appVersion?: string;
                    };
                };
            };
        };
        responses: {
            /** @description The answer. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StartedDeviceCode"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewerDevices_find: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                code: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DeviceCodeRequest"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewerDevices_approve: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                code: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DeviceCodeRequest"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewerDevices_deny: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                code: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DeviceCodeRequest"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewerDevices_poll: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    deviceCode: string;
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DeviceCodePoll"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewerDevices_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DeviceView"][];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewerDevices_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewerDevices_rename: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: string;
                        name: string;
                    };
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewerAuth_sendVerification: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewerAuth_verifyEmail: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    token: string;
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        email: string;
                    };
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Watchlist_list: {
        parameters: {
            query?: {
                language?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ViewerList"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Watchlist_clear: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        removed: number;
                    };
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Watchlist_add: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: string;
                        /** @constant */
                        saved: true;
                    };
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Watchlist_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: string;
                        /** @constant */
                        saved: false;
                    };
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Watchlist_ids: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        ids: string[];
                    };
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewerAuth_login: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    email: string;
                    password: string;
                    device?: {
                        installationId: string;
                        name: string;
                        /**
                         * @default OTHER
                         * @enum {string}
                         */
                        kind?: "TV" | "MOBILE" | "TABLET" | "DESKTOP" | "OTHER";
                        platform: string;
                        model?: string;
                        appVersion?: string;
                    };
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ViewerSignIn"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewerAuth_logout: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewerAuth_me: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ViewerView"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewerAuth_updateOwn: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    displayName: string;
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ViewerView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewerAuth_changePassword: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    currentPassword: string;
                    newPassword: string;
                };
            };
        };
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewerAuth_forgotPassword: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    email: string;
                };
            };
        };
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewerAuth_resetPassword: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    token: string;
                    newPassword: string;
                };
            };
        };
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewerPayments_own: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: components["schemas"]["ViewerPaymentView"][];
                    };
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewerProfiles_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProfilesView"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewerProfiles_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    /** @enum {string} */
                    color?: "amber" | "coral" | "rose" | "violet" | "blue" | "teal" | "green" | "slate";
                };
            };
        };
        responses: {
            /** @description The answer. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProfileView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewerProfiles_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewerProfiles_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name?: string;
                    /** @enum {string} */
                    color?: "amber" | "coral" | "rose" | "violet" | "blue" | "teal" | "green" | "slate";
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProfileView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewerProfiles_select: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProfileView"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewerPurchases_own: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: components["schemas"]["ViewerPurchaseView"][];
                    };
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewerPurchases_start: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    titleId: string;
                    /** @enum {string} */
                    kind: "RENT" | "BUY";
                    code?: string;
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        url: string;
                    };
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewerAuth_register: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    email: string;
                    displayName: string;
                    password: string;
                    device?: {
                        installationId: string;
                        name: string;
                        /**
                         * @default OTHER
                         * @enum {string}
                         */
                        kind?: "TV" | "MOBILE" | "TABLET" | "DESKTOP" | "OTHER";
                        platform: string;
                        model?: string;
                        appVersion?: string;
                    };
                };
            };
        };
        responses: {
            /** @description The answer. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ViewerSignIn"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewerAuth_session: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        viewer: components["schemas"]["ViewerView"] | null;
                        profile: components["schemas"]["ProfileView"] | null;
                        entitled: boolean;
                        access: components["schemas"]["ViewerAccess"];
                        purchases: components["schemas"]["OwnedTitle"][];
                    };
                };
            };
        };
    };
    ViewerAuth_sessions: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ViewerSessionView"][];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewerAuth_revokeSession: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewerStreams_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description Devices that may play at the same time. Null: as many as they like. */
                        limit: number | null;
                        streams: components["schemas"]["OwnStream"][];
                    };
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewerStreams_end: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewerStreams_beat: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    PublicBilling_own: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OwnSubscription"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Watching_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: components["schemas"]["WatchingItem"][];
                    };
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Watching_save: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    items: {
                        title: string;
                        /** Format: uuid */
                        episodeId?: string;
                        position: number;
                        duration: number;
                        watchedAt?: unknown;
                    }[];
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        saved: number;
                    };
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Watching_clear: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        removed: number;
                    };
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Watching_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Watching_forTitle: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                slug: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: components["schemas"]["TitleWatchState"][];
                    };
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewersAdmin_list: {
        parameters: {
            query?: {
                page?: number;
                pageSize?: number;
                status?: "ACTIVE" | "DISABLED";
                subscribed?: "yes" | "no";
                q?: string;
                sort?: "createdAt" | "lastLoginAt" | "email" | "displayName";
                order?: "asc" | "desc";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageOfViewerAdminView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewersAdmin_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    email: string;
                    displayName: string;
                    password: string;
                    device?: {
                        installationId: string;
                        name: string;
                        /**
                         * @default OTHER
                         * @enum {string}
                         */
                        kind?: "TV" | "MOBILE" | "TABLET" | "DESKTOP" | "OTHER";
                        platform: string;
                        model?: string;
                        appVersion?: string;
                    };
                    /** @default true */
                    emailVerified?: boolean;
                };
            };
        };
        responses: {
            /** @description The answer. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ViewerAdminView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewersAdmin_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ViewerAdminDetail"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewersAdmin_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewersAdmin_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    email?: string;
                    displayName?: string;
                    /** @enum {string} */
                    status?: "ACTIVE" | "DISABLED";
                    emailVerified?: boolean;
                    maxStreams?: number | null;
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ViewerAdminView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewersAdmin_removeDevice: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                deviceId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewerListAdmin_forViewer: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ViewerListAdminView"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewersAdmin_resetPassword: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    newPassword: string;
                };
            };
        };
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewersAdmin_sendPasswordEmail: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    PaymentsAdmin_forViewer: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: components["schemas"]["PaymentAdminView"][];
                    };
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    PaymentsAdmin_record: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    amount: number;
                    paidAt?: unknown;
                    /** Format: uuid */
                    planId?: string;
                    note?: string | null;
                };
            };
        };
        responses: {
            /** @description The answer. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PaymentAdminView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    PurchasesAdmin_forViewer: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: components["schemas"]["PurchaseAdminView"][];
                    };
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    PurchasesAdmin_grant: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    titleId: string;
                    /** @enum {string} */
                    kind: "RENT" | "BUY";
                    amount?: number | null;
                    note?: string | null;
                };
            };
        };
        responses: {
            /** @description The answer. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PurchaseAdminView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewersAdmin_signOut: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        sessionsEnded: number;
                    };
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewerStreamsAdmin_forViewer: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StreamsView"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewerStreamsAdmin_stop: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                streamId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    BillingAdmin_forViewer: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        current: components["schemas"]["SubscriptionAdminView"] | null;
                        history: components["schemas"]["SubscriptionAdminView"][];
                    };
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    BillingAdmin_grant: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    planId: string;
                    endsAt: unknown | null;
                    note?: string | null;
                };
            };
        };
        responses: {
            /** @description The answer. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SubscriptionAdminView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewersAdmin_sendVerificationEmail: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    ViewerWatchingAdmin_forViewer: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ViewerWatchingAdminView"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Watch_listFiles: {
        parameters: {
            query?: {
                page?: number;
                pageSize?: number;
                locationId?: string;
                state?: "WAITING" | "UNRECOGNISED" | "QUEUED" | "IMPORTING" | "IMPORTED" | "CONFLICT" | "FAILED" | "IGNORED";
                q?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageOfWatchedFileView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Watch_ignore: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WatchedFileView"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Watch_match: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    kind: "MOVIE" | "SERIES";
                    tmdbId: number;
                    seasonNumber?: number;
                    episodeNumber?: number;
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WatchedFileView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Watch_retry: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @default false */
                    replace?: boolean;
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WatchedFileView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Watch_retryAll: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    locationId?: string;
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        queued: number;
                    };
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Watch_listLocations: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LocationView"][];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Watch_createLocation: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    /** @default true */
                    isActive?: boolean;
                    /** @default 5 */
                    scanIntervalMinutes?: number;
                    /** @default null */
                    storagePoolId?: string | null;
                    /** @default null */
                    processingMode?: ("COPY" | "TRANSCODE" | "PASSTHROUGH") | null;
                    /** @default null */
                    encodingProfileId?: string | null;
                    /** @default false */
                    autoPublish?: boolean;
                    /**
                     * @default MOVE
                     * @enum {string}
                     */
                    afterImport?: "MOVE" | "KEEP" | "DELETE";
                    /** @constant */
                    driver: "LOCAL";
                    config: {
                        basePath: string;
                    };
                } | {
                    name: string;
                    /** @default true */
                    isActive?: boolean;
                    /** @default 5 */
                    scanIntervalMinutes?: number;
                    /** @default null */
                    storagePoolId?: string | null;
                    /** @default null */
                    processingMode?: ("COPY" | "TRANSCODE" | "PASSTHROUGH") | null;
                    /** @default null */
                    encodingProfileId?: string | null;
                    /** @default false */
                    autoPublish?: boolean;
                    /**
                     * @default MOVE
                     * @enum {string}
                     */
                    afterImport?: "MOVE" | "KEEP" | "DELETE";
                    /** @constant */
                    driver: "S3";
                    config: {
                        bucket: string;
                        /** @default us-east-1 */
                        region?: string;
                        /** Format: uri */
                        endpoint?: string;
                        /** @default false */
                        forcePathStyle?: boolean;
                        keyPrefix?: string;
                        accessKeyId: string;
                        secretAccessKey: string;
                    };
                };
            };
        };
        responses: {
            /** @description The answer. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LocationView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Watch_getLocation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LocationView"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Watch_removeLocation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Watch_updateLocation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name?: string;
                    isActive?: boolean;
                    scanIntervalMinutes?: number;
                    storagePoolId?: string | null;
                    processingMode?: ("COPY" | "TRANSCODE" | "PASSTHROUGH") | null;
                    encodingProfileId?: string | null;
                    autoPublish?: boolean;
                    /** @enum {string} */
                    afterImport?: "MOVE" | "KEEP" | "DELETE";
                    config?: {
                        [key: string]: unknown;
                    };
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LocationView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Watch_scan: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LocationView"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Watch_test: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @constant */
                    driver: "LOCAL";
                    config: {
                        basePath: string;
                    };
                } | {
                    /** @constant */
                    driver: "S3";
                    config: {
                        bucket: string;
                        /** @default us-east-1 */
                        region?: string;
                        /** Format: uri */
                        endpoint?: string;
                        /** @default false */
                        forcePathStyle?: boolean;
                        keyPrefix?: string;
                        accessKeyId: string;
                        secretAccessKey: string;
                    };
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PlaceTest"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Watch_summary: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WatchSummary"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Webhooks_list: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WebhookView"][];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Webhooks_create: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    url: string;
                    events: string[];
                };
            };
        };
        responses: {
            /** @description The answer. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WebhookWithSecret"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Webhooks_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WebhookView"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Webhooks_remove: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Done. Nothing comes back. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Webhooks_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name?: string;
                    url?: string;
                    events?: string[];
                    isActive?: boolean;
                };
            };
        };
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WebhookView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Webhooks_activity: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WebhookActivityHour"][];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Webhooks_deliveries: {
        parameters: {
            query?: {
                page?: number;
                pageSize?: number;
                status?: "PENDING" | "DELIVERED" | "FAILED";
                event?: string;
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PageOfDeliveryView"];
                };
            };
            /** @description The input was refused. "issues" names every field. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Webhooks_delivery: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                deliveryId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DeliveryDetail"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Webhooks_redeliver: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                deliveryId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DeliveryView"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Webhooks_rollSecret: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WebhookWithSecret"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Webhooks_test: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DeliveryDetail"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description What the address names does not exist. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Too many requests. "Retry-After" says when to try again. */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
    Webhooks_reference: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The answer. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WebhookReference"];
                };
            };
            /** @description Not signed in, or the sign-in ran out. */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
            /** @description Signed in, but not allowed to do this. */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Problem"];
                };
            };
        };
    };
}
