'use client';

import { useActionState, useEffect, useId, useRef, useState, useTransition } from 'react';

import { addCatalogGameAction } from '@/server/actions/library';
import { idleState } from '@/server/actions/shared';
import type { GameSearchHit } from '@/server/games';

import { FormFeedback, SubmitButton } from './form';
import { Alert, Badge, inputStyles } from './ui';

type SearchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; hits: GameSearchHit[]; catalogError: string | null }
  | { kind: 'failed'; message: string };

/**
 * Search the catalog and add a result to your library.
 *
 * The search itself is a plain fetch so results appear as you type; adding a
 * game is a server action so it revalidates the page. When the catalog is
 * unavailable the local matches still show, with an explicit nudge toward
 * manual entry.
 */
export function GameSearch() {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<SearchState>({ kind: 'idle' });
  const [addState, addAction] = useActionState(addCatalogGameAction, idleState);
  const [isPending, startTransition] = useTransition();

  const inputId = useId();
  const requestId = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setState({ kind: 'idle' });
      return;
    }

    const id = ++requestId.current;
    const controller = new AbortController();
    // Debounce so a fast typist does not fire a request per keystroke; the
    // server also throttles per user.
    const timer = setTimeout(async () => {
      setState({ kind: 'loading' });
      try {
        const response = await fetch(`/api/games/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (id !== requestId.current) return;

        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          setState({
            kind: 'failed',
            message: body.error ?? 'Search is unavailable right now.',
          });
          return;
        }

        const body = (await response.json()) as {
          hits: GameSearchHit[];
          catalogError: string | null;
        };
        setState({ kind: 'ready', hits: body.hits, catalogError: body.catalogError });
      } catch (error) {
        if (controller.signal.aborted) return;
        if (id !== requestId.current) return;
        setState({
          kind: 'failed',
          message: 'Could not reach the search service. You can still add a game manually.',
        });
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor={inputId} className="text-sm font-semibold">
        Search BoardGameGeek
      </label>
      <input
        id={inputId}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Wingspan, Codenames, Ark Nova…"
        autoComplete="off"
        className={inputStyles}
        aria-describedby={`${inputId}-status`}
      />

      <FormFeedback state={addState} />

      <div id={`${inputId}-status`} aria-live="polite" className="text-sm">
        {state.kind === 'loading' ? (
          <p className="text-[var(--color-ink-soft)]">Searching…</p>
        ) : null}
        {state.kind === 'failed' ? <Alert tone="warning">{state.message}</Alert> : null}
        {state.kind === 'ready' && state.catalogError ? (
          <Alert tone="warning" title="BoardGameGeek is not answering">
            {state.catalogError} Games already known to Meeple Night are still listed below, and
            you can always add a game by hand.
          </Alert>
        ) : null}
        {state.kind === 'ready' && state.hits.length === 0 ? (
          <p className="text-[var(--color-ink-soft)]">
            Nothing matched. Try a shorter search, or add the game manually below.
          </p>
        ) : null}
      </div>

      {state.kind === 'ready' && state.hits.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {state.hits.map((hit) => (
            <li
              key={`${hit.source}-${hit.bggId ?? hit.id}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--color-line)] px-3 py-2"
            >
              <span className="text-sm">
                <span className="font-semibold">{hit.name}</span>
                {hit.yearPublished ? (
                  <span className="text-[var(--color-ink-soft)]"> ({hit.yearPublished})</span>
                ) : null}
                {hit.isExpansion ? (
                  <Badge tone="amber" className="ml-2">
                    Expansion
                  </Badge>
                ) : null}
              </span>

              {hit.bggId != null ? (
                <form
                  action={(formData) => startTransition(() => addAction(formData))}
                  className="shrink-0"
                >
                  <input type="hidden" name="bggId" value={hit.bggId} />
                  <SubmitButton variant="secondary" pendingLabel="Adding…">
                    Add to my games
                  </SubmitButton>
                </form>
              ) : (
                <span className="text-xs text-[var(--color-ink-soft)]">
                  Already available locally
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {isPending ? <p className="sr-only">Adding game…</p> : null}
    </div>
  );
}
