// SPDX-License-Identifier: AGPL-3.0-only
import { assertUnrestricted } from '../audience/audience.js';
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/auth.decorators.js';
import { requestInfo } from '../auth/request-info.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import {
  type DeviceCodePoll,
  type DeviceCodeRequest,
  DeviceCodesService,
  type StartedDeviceCode,
} from './device-codes.service.js';
import {
  type PollDeviceCodeInput,
  pollDeviceCodeSchema,
  type RenameDeviceInput,
  renameDeviceSchema,
  type StartDeviceCodeInput,
  startDeviceCodeSchema,
} from './device.schemas.js';
import { CurrentViewer, ViewerOnly } from './viewer-auth.guard.js';
import { type DeviceView, ViewerDevicesService } from './viewer-devices.service.js';
import type { ViewerIdentity } from './viewer-session.service.js';

/** A household starts a few televisions. This stops a script that asks for codes without end. */
const CODE_REQUESTS = { name: 'device-code-start', limit: 20, windowSeconds: 600 };
/** Every five seconds for ten minutes is 120. Several devices can share one address. */
const POLLS = { name: 'device-code-poll', limit: 600, windowSeconds: 600 };
/** A viewer types a code once or twice. This stops guessing codes of others. */
const CODE_ENTRIES = { name: 'device-code-enter', limit: 15, windowSeconds: 600 };
const CHANGES = { name: 'viewer-devices', limit: 60, windowSeconds: 60 };

/**
 * Devices of a viewer, and signing a device in with a code: the way onto a
 * television, where nobody wants to type a password with a remote.
 */
@Controller('viewer')
export class ViewerDevicesController {
  constructor(
    @Inject(DeviceCodesService) private readonly codes: DeviceCodesService,
    @Inject(ViewerDevicesService) private readonly devices: ViewerDevicesService,
  ) {}

  /**
   * A device asks for a code to show. The viewer enters it on the website,
   * on a phone or a computer where they are signed in.
   */
  @Public()
  @RateLimit(CODE_REQUESTS)
  @Post('device-codes')
  @Header('Cache-Control', 'no-store')
  start(
    @Body(new ZodValidationPipe(startDeviceCodeSchema)) body: StartDeviceCodeInput,
    @Req() request: Request,
  ): Promise<StartedDeviceCode> {
    return this.codes.start(body.device, requestInfo(request));
  }

  /**
   * The device asks whether the viewer has answered. Once they said yes, the
   * answer holds the token, one time. Asking more often than every two
   * seconds is answered with 429 and the code "slow_down".
   */
  @Public()
  @RateLimit(POLLS)
  @Post('device-codes/token')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  poll(
    @Body(new ZodValidationPipe(pollDeviceCodeSchema)) body: PollDeviceCodeInput,
    @Req() request: Request,
  ): Promise<DeviceCodePoll> {
    return this.codes.poll(body.deviceCode, requestInfo(request));
  }

  /** The device behind a code, for the viewer to look at before they answer. */
  @ViewerOnly()
  @RateLimit(CODE_ENTRIES)
  @Get('device-codes/:code')
  @Header('Cache-Control', 'no-store')
  find(@Param('code') code: string): Promise<DeviceCodeRequest> {
    return this.codes.find(code);
  }

  /** The viewer says yes: the device is signed in to their account. */
  @ViewerOnly()
  @RateLimit(CODE_ENTRIES)
  @Post('device-codes/:code/approve')
  @HttpCode(HttpStatus.OK)
  approve(
    @CurrentViewer() identity: ViewerIdentity,
    @Param('code') code: string,
  ): Promise<DeviceCodeRequest> {
    // A child's profile does not sign other devices in.
    assertUnrestricted();
    return this.codes.approve(code, identity.viewer.id);
  }

  /** The viewer says no: the device is told, and the code stops working. */
  @ViewerOnly()
  @RateLimit(CODE_ENTRIES)
  @Post('device-codes/:code/deny')
  @HttpCode(HttpStatus.OK)
  deny(
    @CurrentViewer() identity: ViewerIdentity,
    @Param('code') code: string,
  ): Promise<DeviceCodeRequest> {
    return this.codes.deny(code, identity.viewer.id);
  }

  /** The apps the viewer is, or was, signed in on. Browsers are under "sessions". */
  @ViewerOnly()
  @Get('devices')
  @Header('Cache-Control', 'no-store')
  list(@CurrentViewer() identity: ViewerIdentity): Promise<DeviceView[]> {
    return this.devices.list(identity.viewer.id, identity.session.deviceId);
  }

  /** Gives a device another name, such as "Bedroom TV". */
  @ViewerOnly()
  @RateLimit(CHANGES)
  @Patch('devices/:id')
  async rename(
    @CurrentViewer() identity: ViewerIdentity,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(renameDeviceSchema)) body: RenameDeviceInput,
  ): Promise<{ id: string; name: string }> {
    // An account is managed from a profile without a limit.
    assertUnrestricted();
    const device = await this.devices.rename(identity.viewer.id, id, body.name);
    return { id: device.id, name: device.name };
  }

  /** Signs a device out and forgets it. */
  @ViewerOnly()
  @RateLimit(CHANGES)
  @Delete('devices/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentViewer() identity: ViewerIdentity,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    // An account is managed from a profile without a limit.
    assertUnrestricted();
    await this.devices.remove(identity.viewer.id, id);
  }
}
