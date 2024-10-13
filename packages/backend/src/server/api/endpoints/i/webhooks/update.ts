/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { WebhooksRepository } from '@/models/_.js';
import { webhookEventTypes, WebhookEventTypes } from '@/models/Webhook.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { DI } from '@/di-symbols.js';
import { RoleService } from '@/core/RoleService.js';
import { ApiError } from '../../../error.js';

export const meta = {
	tags: ['webhooks'],

	requireCredential: true,

	kind: 'write:account',

	errors: {
		noSuchWebhook: {
			message: 'No such webhook.',
			code: 'NO_SUCH_WEBHOOK',
			id: 'fb0fea69-da18-45b1-828d-bd4fd1612518',
		},
		adminWebhookDenied: {
			message: 'You cannot create webhook for other users.',
			code: 'UPDATE_ADMIN_WEBHOOK_DENIED',
			id: 'eb43c0c4-24a3-487d-b139-f3e4e58f87a4',
		},
	},

} as const;

export const paramDef = {
	type: 'object',
	properties: {
		webhookId: { type: 'string', format: 'misskey:id' },
		name: { type: 'string', minLength: 1, maxLength: 100 },
		url: { type: 'string', minLength: 1, maxLength: 1024 },
		secret: { type: 'string', nullable: true, maxLength: 1024 },
		on: { type: 'array', items: {
			oneOf: [
				{ type: 'string', enum: webhookEventTypes },
				{ type: 'string', pattern: '^note@[a-zA-Z0-9]{1,20}$' },
			],
		} },
		active: { type: 'boolean' },
	},
	required: ['webhookId'],
} as const;

// TODO: ロジックをサービスに切り出す

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.webhooksRepository)
		private webhooksRepository: WebhooksRepository,

		private globalEventService: GlobalEventService,
		private roleService: RoleService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const webhook = await this.webhooksRepository.findOneBy({
				id: ps.webhookId,
				userId: me.id,
			});

			if (webhook == null) {
				throw new ApiError(meta.errors.noSuchWebhook);
			}

			if (ps.on != null && ps.on.some(x => !(webhookEventTypes as readonly string[]).includes(x))) {
				if (!await this.roleService.isAdministrator(me)) {
					throw new ApiError(meta.errors.adminWebhookDenied);
				}
			}

			await this.webhooksRepository.update(webhook.id, {
				name: ps.name,
				url: ps.url,
				secret: ps.secret === null ? '' : ps.secret,
				on: ps.on as WebhookEventTypes[],
				active: ps.active,
			});

			const updated = await this.webhooksRepository.findOneByOrFail({
				id: ps.webhookId,
			});

			this.globalEventService.publishInternalEvent('webhookUpdated', updated);
		});
	}
}
