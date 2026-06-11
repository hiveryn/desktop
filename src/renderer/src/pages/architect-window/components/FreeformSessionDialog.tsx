import type { AgentProfile } from '@components';
import { ApiEnvelopeError, Dialog, Input, LinkButton, ProfileSelector } from '@components';
import { useEffect, useState } from 'react';
import { useSessionStore } from '../../../state/sessionStore';
import { loadSessionRecord } from '../hooks/sessionSnapshot';
import styles from './FreeformSessionDialog.module.css';

interface Props {
  architectKey: string;
  open: boolean;
  onClose: () => void;
}

function generateSlug(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40)
    .replace(/^-+|-+$/g, '');
}

function expandHome(location: string, home: string): string {
  if (location === '~') return home;
  if (location.startsWith('~/')) return `${home}/${location.slice(2)}`;
  return location;
}

export default function FreeformSessionDialog({ architectKey, open, onClose }: Props) {
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [userHome, setUserHome] = useState<string | null>(null);
  const [location, setLocation] = useState('');
  const [prompt, setPrompt] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
  const [showProfileSelector, setShowProfileSelector] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void Promise.all([window.hiveryn.profiles.list(), window.hiveryn.system.getUserHome()])
      .then(([profileList, homeResult]) => {
        if (cancelled) return;
        setProfiles(profileList);
        setUserHome(homeResult);
        setSelectedProfile((prev) =>
          prev === null && profileList.length > 0 ? profileList[0].name : prev,
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  function handlePromptChange(value: string): void {
    setPrompt(value);
    if (!slugEdited) {
      setSlug(generateSlug(value));
    }
  }

  function handleSlugChange(value: string): void {
    setSlug(value);
    setSlugEdited(true);
  }

  async function handleSubmit(): Promise<void> {
    if (!selectedProfile || !location.trim() || !prompt.trim() || !slug.trim()) return;
    if (submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      if (!userHome) {
        throw new Error('Cannot create freeform session before the home directory is resolved');
      }
      const expandedWorkdir = expandHome(location.trim(), userHome);
      const intent = await window.hiveryn.sessions.createFreeform(
        architectKey,
        prompt.trim(),
        expandedWorkdir,
        slug.trim(),
      );
      await window.hiveryn.sessions.createRun(intent.id, selectedProfile, 100, 30);

      const record = await loadSessionRecord(intent.id);
      if (!record) {
        throw new Error(`Spawned freeform session ${intent.id} is missing from sessions.list()`);
      }

      const store = useSessionStore.getState();
      store.registerSession(record);
      store.setActiveSession(intent.id);

      resetForm();
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm(): void {
    setLocation('');
    setPrompt('');
    setSlug('');
    setSlugEdited(false);
    setSelectedProfile((prev) => (profiles.length > 0 ? profiles[0].name : prev));
    setError(null);
  }

  function handleCancel(): void {
    resetForm();
    onClose();
  }

  if (!open) return null;

  const isValid =
    location.trim() !== '' &&
    prompt.trim() !== '' &&
    slug.trim() !== '' &&
    selectedProfile !== null &&
    userHome !== null;

  return (
    <>
      <Dialog
        title="New Freeform Session"
        onConfirm={() => void handleSubmit()}
        onCancel={handleCancel}
        confirmLabel={submitting ? 'Starting…' : 'Start'}
        confirmDisabled={submitting || !isValid}
      >
        <div className={styles.form}>
          <Input
            label="Location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="/path/to/workdir or ~/project"
            autoFocus
          />
          <div className={styles.field}>
            <label htmlFor="freeform-prompt" className={styles.label}>
              Prompt
            </label>
            <textarea
              id="freeform-prompt"
              className={styles.textarea}
              value={prompt}
              onChange={(e) => handlePromptChange(e.target.value)}
              placeholder="Describe what the agent should do…"
              rows={5}
            />
          </div>
          <Input
            label="Slug"
            value={slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            placeholder="auto-generated-from-prompt"
          />
          <div className={styles.field}>
            <div className={styles.label}>Variant</div>
            <div className={styles.variantRow}>
              <span className={styles.variantName}>{selectedProfile ?? 'None selected'}</span>
              <LinkButton type="button" onClick={() => setShowProfileSelector(true)}>
                Change
              </LinkButton>
            </div>
          </div>
          {error ? <ApiEnvelopeError error={error} title="Session API Error" /> : null}
        </div>
      </Dialog>

      <ProfileSelector
        profiles={profiles}
        open={showProfileSelector}
        onSelect={(name) => {
          setSelectedProfile(name);
          setShowProfileSelector(false);
        }}
        onClose={() => setShowProfileSelector(false)}
      />
    </>
  );
}
