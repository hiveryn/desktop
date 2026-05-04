import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ProfileCard } from './profile-card';
import { ProfileForm } from './profile-form';

export function AgentProfilesPage(): React.JSX.Element {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<AgentProfile | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<IpcError | null>(null);

  const {
    data: profiles = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['profiles'],
    queryFn: () => window.hiveryn.profiles.list(),
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: (input: AgentProfileInput) => window.hiveryn.profiles.create(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['profiles'] });
      setDialogOpen(false);
      setSaveError(null);
      toast.success('Profile created');
    },
    onError: (e: IpcError) => {
      setSaveError(e);
      if (e.status !== 409 && e.status !== 400) toast.error(e.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: AgentProfileInput }) =>
      window.hiveryn.profiles.update(id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['profiles'] });
      setDialogOpen(false);
      setSaveError(null);
      toast.success('Profile updated');
    },
    onError: (e: IpcError) => {
      setSaveError(e);
      if (e.status !== 409 && e.status !== 400) toast.error(e.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => window.hiveryn.profiles.delete(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['profiles'] });
      setDeletingId(null);
      toast.success('Profile deleted');
    },
    onError: (e: Error) => {
      setDeletingId(null);
      toast.error(e.message);
    },
  });

  function handleFormSubmit(input: AgentProfileInput): void {
    if (editingProfile) {
      updateMutation.mutate({ id: editingProfile.id, input });
    } else {
      createMutation.mutate(input);
    }
  }

  function openCreate(): void {
    setEditingProfile(null);
    setSaveError(null);
    setDialogOpen(true);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
        <h1 className="text-sm font-semibold">Agent Profiles</h1>
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-3.5" />
          New Profile
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {error && !isLoading && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
            <p className="text-sm text-destructive">
              Cannot reach daemon: {(error as Error).message}
            </p>
          </div>
        )}

        {!isLoading && !error && profiles.length === 0 && (
          <div className="flex h-40 items-center justify-center">
            <p className="text-sm text-muted-foreground">
              No profiles.{' '}
              <button type="button" onClick={openCreate} className="underline underline-offset-2">
                Create one
              </button>
            </p>
          </div>
        )}

        {!isLoading && !error && profiles.length > 0 && (
          <ul className="space-y-2">
            {profiles.map((p) => (
              <ProfileCard
                key={p.id}
                profile={p}
                isConfirmingDelete={deletingId === p.id}
                isDeleting={deleteMutation.isPending}
                onEdit={() => {
                  setEditingProfile(p);
                  setSaveError(null);
                  setDialogOpen(true);
                }}
                onDeleteRequest={() => setDeletingId(p.id)}
                onDeleteConfirm={() => deleteMutation.mutate(p.id)}
                onDeleteCancel={() => setDeletingId(null)}
              />
            ))}
          </ul>
        )}
      </div>

      <ProfileForm
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingProfile={editingProfile}
        isSaving={createMutation.isPending || updateMutation.isPending}
        saveError={saveError}
        onSubmit={handleFormSubmit}
      />
    </div>
  );
}
