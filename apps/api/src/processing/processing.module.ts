// SPDX-License-Identifier: AGPL-3.0-only
import { Global, Module } from '@nestjs/common';
import { EncodingProfilesController } from '../encoding-profiles/encoding-profiles.controller.js';
import { EncodingProfilesService } from '../encoding-profiles/encoding-profiles.service.js';
import { JobsController } from '../jobs/jobs.controller.js';
import { JobsService } from '../jobs/jobs.service.js';
import { CancellationService } from './cancellation.service.js';
import { FfmpegRunner } from './ffmpeg/ffmpeg-runner.js';
import { JobExecutor } from './job-executor.js';
import { PipelineService } from './pipeline.service.js';
import { ProcessingSteps } from './processing-steps.js';
import { ProcessingConsumer } from './processing.consumer.js';
import { RunningJobs } from './running-jobs.js';
import { AudioTracksService } from '../audio-tracks/audio-tracks.service.js';
import { SubtitlesService } from '../subtitles/subtitles.service.js';

/**
 * What every role needs: creating jobs, reading encoding profiles, moving
 * assets through the pipeline, and the subtitle tracks added to a video. Loaded in all processes.
 */
@Global()
@Module({
  providers: [
    JobsService,
    EncodingProfilesService,
    PipelineService,
    SubtitlesService,
    AudioTracksService,
  ],
  exports: [
    JobsService,
    EncodingProfilesService,
    PipelineService,
    SubtitlesService,
    AudioTracksService,
  ],
})
export class ProcessingCoreModule {}

/** Job and encoding profile endpoints. Loaded only in the api role. */
@Module({
  controllers: [JobsController, EncodingProfilesController],
})
export class ProcessingApiModule {}

/** The media steps and their executor, without the queue. Imported by the worker and by tests. */
@Module({
  providers: [FfmpegRunner, ProcessingSteps, RunningJobs, JobExecutor],
  exports: [FfmpegRunner, ProcessingSteps, RunningJobs, JobExecutor],
})
export class ProcessingStepsModule {}

/** Takes jobs from the queue and runs them. Loaded only in the worker role. */
@Module({
  imports: [ProcessingStepsModule],
  providers: [CancellationService, ProcessingConsumer],
})
export class ProcessingWorkerModule {}
