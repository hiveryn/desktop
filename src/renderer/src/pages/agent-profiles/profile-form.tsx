import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  AGENT_KIND_ICONS,
  AGENT_KINDS,
  AGENT_PLACEHOLDERS,
  type FormValues,
  formSchema,
  parseArgs,
  parseEnv,
} from './schema';

const FORM_FIELDS = new Set<string>(['name', 'agent_kind', 'args_text', 'env_text']);

interface ProfileFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingProfile: AgentProfile | null;
  isSaving: boolean;
  saveError?: IpcError | null;
  onSubmit: (input: AgentProfileInput) => void;
}

export function ProfileForm({
  open,
  onOpenChange,
  editingProfile,
  isSaving,
  saveError,
  onSubmit,
}: ProfileFormProps): React.JSX.Element {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', agent_kind: 'claude', args_text: '', env_text: '' },
  });

  const { reset, setError } = form;

  useEffect(() => {
    if (!open) return;
    if (editingProfile) {
      reset({
        name: editingProfile.name,
        agent_kind: editingProfile.agent_kind,
        args_text: editingProfile.args.join('\n'),
        env_text: Object.entries(editingProfile.env)
          .map(([k, v]) => `${k}=${v}`)
          .join('\n'),
      });
    } else {
      reset({ name: '', agent_kind: 'claude', args_text: '', env_text: '' });
    }
  }, [open, editingProfile, reset]);

  useEffect(() => {
    if (!saveError) return;
    // Use structured details.field from the envelope — no message parsing needed
    const field = saveError.details?.field;
    if (field && FORM_FIELDS.has(field)) {
      setError(field as keyof FormValues, { message: saveError.message });
    }
  }, [saveError, setError]);

  const agentKind = useWatch({ control: form.control, name: 'agent_kind' });
  const ph = AGENT_PLACEHOLDERS[agentKind];

  function handleSubmit(values: FormValues): void {
    onSubmit({
      name: values.name.trim(),
      agent_kind: values.agent_kind,
      args: parseArgs(values.args_text),
      env: parseEnv(values.env_text),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editingProfile ? 'Edit Profile' : 'New Profile'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="agent_kind"
              render={({ field }) => (
                <FormItem>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    value={field.value}
                    onValueChange={(v) => {
                      if (v) field.onChange(v);
                    }}
                    className="w-full"
                  >
                    {AGENT_KINDS.map((kind) => {
                      const Icon = AGENT_KIND_ICONS[kind];
                      return (
                        <ToggleGroupItem key={kind} value={kind} className="flex-1 gap-1.5">
                          <Icon size={14} />
                          {kind}
                        </ToggleGroupItem>
                      );
                    })}
                  </ToggleGroup>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <Input placeholder={ph.name} {...field} />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="args_text"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Args <span className="font-normal text-muted-foreground">(one per line)</span>
                  </FormLabel>
                  <Textarea
                    placeholder={ph.args}
                    className="resize-none font-mono text-xs"
                    rows={4}
                    {...field}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="env_text"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Env{' '}
                    <span className="font-normal text-muted-foreground">
                      (KEY=VALUE, one per line)
                    </span>
                  </FormLabel>
                  <Textarea
                    placeholder={ph.env || 'KEY=VALUE'}
                    className="resize-none font-mono text-xs"
                    rows={3}
                    {...field}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Saving…' : editingProfile ? 'Save' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
