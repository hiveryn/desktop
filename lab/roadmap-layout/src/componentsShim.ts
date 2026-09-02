// Stand-in for the real "@components" barrel alias (see electron.vite.config.ts).
// The lab only needs TicketCard, and TicketCard.tsx's only non-type import is
// its own CSS module — importing the full barrel would drag in every other
// component's runtime deps (react-markdown, react-diff-view, ...) that this
// standalone harness never installed. This re-exports the real component
// file directly, not a copy.
export { default as TicketCard } from '../../../src/renderer/src/components/TicketCard/TicketCard';
