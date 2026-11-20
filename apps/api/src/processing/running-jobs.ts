// SPDX-License-Identifier: AGPL-3.0-only
import { Injectable } from '@nestjs/common';

/** The jobs running in this process, each with the means to stop it. */
@Injectable()
export class RunningJobs {
  private readonly controllers = new Map<string, AbortController>();

  /** Registers a job that starts running and returns its abort signal. */
  register(jobId: string): AbortSignal {
    const controller = new AbortController();
    this.controllers.set(jobId, controller);
    return controller.signal;
  }

  release(jobId: string): void {
    this.controllers.delete(jobId);
  }

  /** Stops a job if it runs here. Returns whether it did. */
  abort(jobId: string): boolean {
    const controller = this.controllers.get(jobId);
    controller?.abort();
    return controller !== undefined;
  }

  abortAll(): void {
    for (const controller of this.controllers.values()) {
      controller.abort();
    }
  }
}
