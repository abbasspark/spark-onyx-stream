-- Indexes for every foreign key that had none.
--
-- PostgreSQL does not index a foreign key by itself. Without one, deleting a
-- referenced row scans the whole referencing table: deleting a viewer rewrote
-- every row of "plays", deleting a profile scanned "viewer_sessions", and
-- deleting an image scanned "titles" once per picture column.
--
-- On an installation with a large catalogue or history this runs for a while
-- and holds back writes to the tables it touches. It is a one-off.

-- CreateIndex
CREATE INDEX "assets_createdById_idx" ON "assets"("createdById");

-- CreateIndex
CREATE INDEX "assets_encodingProfileId_idx" ON "assets"("encodingProfileId");

-- CreateIndex
CREATE INDEX "backups_createdById_idx" ON "backups"("createdById");

-- CreateIndex
CREATE INDEX "backups_storagePoolId_idx" ON "backups"("storagePoolId");

-- CreateIndex
CREATE INDEX "collections_backdropId_idx" ON "collections"("backdropId");

-- CreateIndex
CREATE INDEX "collections_posterId_idx" ON "collections"("posterId");

-- CreateIndex
CREATE INDEX "coupons_createdById_idx" ON "coupons"("createdById");

-- CreateIndex
CREATE INDEX "device_codes_viewerId_idx" ON "device_codes"("viewerId");

-- CreateIndex
CREATE INDEX "episodes_stillId_idx" ON "episodes"("stillId");

-- CreateIndex
CREATE INDEX "home_sections_categoryId_idx" ON "home_sections"("categoryId");

-- CreateIndex
CREATE INDEX "home_sections_collectionId_idx" ON "home_sections"("collectionId");

-- CreateIndex
CREATE INDEX "home_sections_genreId_idx" ON "home_sections"("genreId");

-- CreateIndex
CREATE INDEX "images_storagePoolId_idx" ON "images"("storagePoolId");

-- CreateIndex
CREATE INDEX "payments_planId_idx" ON "payments"("planId");

-- CreateIndex
CREATE INDEX "payments_recordedById_idx" ON "payments"("recordedById");

-- CreateIndex
CREATE INDEX "payments_subscriptionId_idx" ON "payments"("subscriptionId");

-- CreateIndex
CREATE INDEX "payments_titleId_idx" ON "payments"("titleId");

-- CreateIndex
CREATE INDEX "people_portraitId_idx" ON "people"("portraitId");

-- CreateIndex
CREATE INDEX "playback_sessions_episodeId_idx" ON "playback_sessions"("episodeId");

-- CreateIndex
CREATE INDEX "plays_episodeId_idx" ON "plays"("episodeId");

-- CreateIndex
CREATE INDEX "plays_viewerId_idx" ON "plays"("viewerId");

-- CreateIndex
CREATE INDEX "prepaid_batches_planId_idx" ON "prepaid_batches"("planId");

-- CreateIndex
CREATE INDEX "prepaid_codes_subscriptionId_idx" ON "prepaid_codes"("subscriptionId");

-- CreateIndex
CREATE INDEX "purchases_grantedById_idx" ON "purchases"("grantedById");

-- CreateIndex
CREATE INDEX "push_campaigns_planId_idx" ON "push_campaigns"("planId");

-- CreateIndex
CREATE INDEX "push_campaigns_titleId_idx" ON "push_campaigns"("titleId");

-- CreateIndex
CREATE INDEX "recordings_createdById_idx" ON "recordings"("createdById");

-- CreateIndex
CREATE INDEX "seasons_posterId_idx" ON "seasons"("posterId");

-- CreateIndex
CREATE INDEX "subscriptions_grantedById_idx" ON "subscriptions"("grantedById");

-- CreateIndex
CREATE INDEX "title_extras_assetId_idx" ON "title_extras"("assetId");

-- CreateIndex
CREATE INDEX "title_revisions_adminId_idx" ON "title_revisions"("adminId");

-- CreateIndex
CREATE INDEX "titles_assetId_idx" ON "titles"("assetId");

-- CreateIndex
CREATE INDEX "titles_backdropId_idx" ON "titles"("backdropId");

-- CreateIndex
CREATE INDEX "titles_logoId_idx" ON "titles"("logoId");

-- CreateIndex
CREATE INDEX "titles_posterId_idx" ON "titles"("posterId");

-- CreateIndex
CREATE INDEX "titles_trailerAssetId_idx" ON "titles"("trailerAssetId");

-- CreateIndex
CREATE INDEX "translation_jobs_createdById_idx" ON "translation_jobs"("createdById");

-- CreateIndex
CREATE INDEX "viewer_sessions_profileId_idx" ON "viewer_sessions"("profileId");

-- CreateIndex
CREATE INDEX "viewer_streams_profileId_idx" ON "viewer_streams"("profileId");

-- CreateIndex
CREATE INDEX "watch_locations_encodingProfileId_idx" ON "watch_locations"("encodingProfileId");

-- CreateIndex
CREATE INDEX "watch_locations_storagePoolId_idx" ON "watch_locations"("storagePoolId");

-- CreateIndex
CREATE INDEX "watched_files_assetId_idx" ON "watched_files"("assetId");

-- CreateIndex
CREATE INDEX "watched_files_episodeId_idx" ON "watched_files"("episodeId");

-- CreateIndex
CREATE INDEX "watched_files_titleId_idx" ON "watched_files"("titleId");

-- CreateIndex
CREATE INDEX "webhooks_createdById_idx" ON "webhooks"("createdById");

