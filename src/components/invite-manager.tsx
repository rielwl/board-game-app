'use client';

import { useActionState } from 'react';

import { createInviteAction, revokeInviteAction } from '@/server/actions/invites';
import { idleState } from '@/server/actions/shared';
import type { InviteView } from '@/server/invites';

import { CopyLink } from './copy-link';
import { FormFeedback, SubmitButton } from './form';
import { Alert, Badge, Field, cx, inputStyles } from './ui';

function inviteState(invite: InviteView): { label: string; tone: 'teal' | 'amber' | 'neutral' } {
  if (invite.revokedAt) return { label: 'Revoked', tone: 'neutral' };
  if (invite.expiresAt && invite.expiresAt.getTime() <= Date.now()) {
    return { label: 'Expired', tone: 'amber' };
  }
  if (invite.maxUses != null && invite.useCount >= invite.maxUses) {
    return { label: 'Fully used', tone: 'amber' };
  }
  return { label: 'Active', tone: 'teal' };
}

export function InviteManager({
  eventId,
  invites,
}: {
  eventId: string;
  invites: InviteView[];
}) {
  const [createState, createAction] = useActionState(createInviteAction, idleState);
  const [revokeState, revokeAction] = useActionState(revokeInviteAction, idleState);

  return (
    <div className="flex flex-col gap-6">
      <form action={createAction} className="flex flex-col gap-4">
        <input type="hidden" name="eventId" value={eventId} />
        <FormFeedback state={createState} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Expires after"
            htmlFor="expiresInDays"
            hint="Days. Leave blank for a link that never expires."
            error={createState.fieldErrors.expiresInDays}
          >
            <input
              id="expiresInDays"
              name="expiresInDays"
              type="number"
              min={1}
              max={365}
              inputMode="numeric"
              placeholder="14"
              className={inputStyles}
            />
          </Field>

          <Field
            label="Maximum uses"
            htmlFor="maxUses"
            hint="Leave blank for unlimited."
            error={createState.fieldErrors.maxUses}
          >
            <input
              id="maxUses"
              name="maxUses"
              type="number"
              min={1}
              max={500}
              inputMode="numeric"
              placeholder="10"
              className={inputStyles}
            />
          </Field>
        </div>

        <div>
          <SubmitButton pendingLabel="Creating…">Create a new invite link</SubmitButton>
        </div>
      </form>

      <div>
        <h3 className="mb-3 text-base font-bold">Your invite links</h3>
        <FormFeedback state={revokeState} />

        {invites.length === 0 ? (
          <Alert tone="info">No invite links yet. Create one above and share it.</Alert>
        ) : (
          <ul className="flex flex-col gap-4">
            {invites.map((invite) => {
              const status = inviteState(invite);
              const isActive = status.label === 'Active';

              return (
                <li
                  key={invite.id}
                  className={cx(
                    'rounded-xl border border-[var(--color-line)] p-4',
                    !isActive && 'opacity-70',
                  )}
                >
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                    <Badge tone={status.tone}>{status.label}</Badge>
                    <span className="text-[var(--color-ink-soft)]">
                      Used {invite.useCount}
                      {invite.maxUses != null ? ` of ${invite.maxUses}` : ''} times
                    </span>
                    {invite.expiresAt ? (
                      <span className="text-[var(--color-ink-soft)]">
                        · Expires {invite.expiresAt.toLocaleDateString('en-GB')}
                      </span>
                    ) : null}
                  </div>

                  {invite.url && isActive ? (
                    <CopyLink value={invite.url} label="Invite link" />
                  ) : invite.url ? (
                    <p className="break-all font-mono text-xs text-[var(--color-ink-soft)]">
                      {invite.url}
                    </p>
                  ) : (
                    <Alert tone="warning">
                      This link cannot be shown again because the invite encryption key changed.
                      Create a new link instead.
                    </Alert>
                  )}

                  {!invite.revokedAt ? (
                    <form action={revokeAction} className="mt-3">
                      <input type="hidden" name="eventId" value={eventId} />
                      <input type="hidden" name="inviteId" value={invite.id} />
                      <SubmitButton variant="danger" pendingLabel="Revoking…">
                        Revoke this link
                      </SubmitButton>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
