// SPDX-License-Identifier: AGPL-3.0-only
import { useMutation } from '@tanstack/react-query';
import { Monitor, Moon, Sun } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { authApi } from '@/api/endpoints';
import { useSession } from '@/auth/session';
import { TwoFactorCard } from '@/components/two-factor';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  ErrorNote,
  Facts,
  PageHeader,
} from '@/components/ui/display';
import { Field, Input } from '@/components/ui/form';
import { cn } from '@/lib/cn';
import { roleName } from '@/lib/roles';
import { type ThemeChoice, useTheme } from '@/theme/theme';

const THEMES: [ThemeChoice, typeof Sun, string][] = [
  ['light', Sun, 'Light'],
  ['dark', Moon, 'Dark'],
  ['system', Monitor, 'System'],
];

/** The signed-in admin's own account. */
export function AccountPage() {
  const { state } = useSession();
  const { choice, setChoice } = useTheme();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [mismatch, setMismatch] = useState(false);

  const change = useMutation({
    mutationFn: () => authApi.changePassword({ currentPassword, newPassword }),
    onSuccess: () => {
      toast.success('Your password is changed', { description: 'Other devices were signed out.' });
      setCurrentPassword('');
      setNewPassword('');
      setRepeat('');
    },
  });

  if (state.status !== 'signedIn') {
    return null;
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    change.reset();
    if (newPassword !== repeat) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    change.mutate();
  };

  return (
    <>
      <PageHeader title="My account" />
      <div className="grid max-w-3xl gap-4">
        <Card>
          <CardHeader title="Profile" />
          <CardContent>
            <Facts
              items={[
                ['Name', state.me.displayName],
                ['Email', state.me.email],
                ['Role', roleName(state.me)],
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Appearance" description="Kept in this browser." />
          <CardContent>
            <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Theme">
              {THEMES.map(([value, Icon, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={choice === value}
                  onClick={() => setChoice(value)}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-lg border p-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent',
                    choice === value && 'border-primary bg-primary/5 text-foreground',
                  )}
                >
                  <Icon className="size-5" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <TwoFactorCard />

        <Card>
          <CardHeader
            title="Change password"
            description="Changing it signs you out on your other devices."
          />
          <CardContent>
            <form className="grid max-w-sm gap-4" onSubmit={submit}>
              <Field label="Current password">
                {(id) => (
                  <Input
                    id={id}
                    type="password"
                    required
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                  />
                )}
              </Field>
              <Field label="New password" hint="At least 12 characters.">
                {(id) => (
                  <Input
                    id={id}
                    type="password"
                    required
                    minLength={12}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                )}
              </Field>
              <Field label="New password again">
                {(id) => (
                  <Input
                    id={id}
                    type="password"
                    required
                    autoComplete="new-password"
                    aria-invalid={mismatch}
                    value={repeat}
                    onChange={(event) => setRepeat(event.target.value)}
                  />
                )}
              </Field>
              <ErrorNote
                error={mismatch ? 'The two new passwords are not the same.' : change.error}
              />
              <div>
                <Button type="submit" variant="primary" loading={change.isPending}>
                  Change password
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
