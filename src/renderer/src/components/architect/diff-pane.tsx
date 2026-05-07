import { GitBranch } from 'lucide-react';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { atomOneDark } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { ScrollArea } from '@/components/ui/scroll-area';

const MOCK_DIFF = `diff --git a/internal/store/migrations/0003_architect_groups.sql b/internal/store/migrations/0003_architect_groups.sql
new file mode 100644
--- /dev/null
+++ b/internal/store/migrations/0003_architect_groups.sql
@@ -0,0 +1,30 @@
+CREATE TABLE architect_groups (
+    id         TEXT PRIMARY KEY,
+    name       TEXT NOT NULL UNIQUE,
+    created_at TEXT NOT NULL DEFAULT (datetime('now')),
+    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
+);
+
+CREATE TABLE architects (
+    id             TEXT PRIMARY KEY,
+    path           TEXT NOT NULL UNIQUE,
+    title          TEXT,
+    group_id       TEXT REFERENCES architect_groups(id) ON DELETE SET NULL,
+    last_opened_at TEXT,
+    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
+    updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
+);
+
+CREATE TABLE repos (
+    id           TEXT PRIMARY KEY,
+    architect_id TEXT NOT NULL REFERENCES architects(id) ON DELETE CASCADE,
+    key          TEXT NOT NULL,
+    path         TEXT,
+    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
+    updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
+    UNIQUE(architect_id, key)
+);
+
+CREATE INDEX idx_repos_architect ON repos(architect_id);
+CREATE INDEX idx_architects_group ON architects(group_id);`;

export function DiffPane(): React.JSX.Element {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-7 shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-3">
        <GitBranch className="size-3 text-muted-foreground" />
        <span className="data-meta text-muted-foreground">3 files changed, +62 −0</span>
      </div>
      <ScrollArea className="flex-1">
        <SyntaxHighlighter
          language="diff"
          style={atomOneDark}
          customStyle={{
            margin: 0,
            padding: '0.75rem',
            background: 'transparent',
            fontSize: '11px',
            lineHeight: '1.6',
          }}
        >
          {MOCK_DIFF}
        </SyntaxHighlighter>
      </ScrollArea>
    </div>
  );
}
