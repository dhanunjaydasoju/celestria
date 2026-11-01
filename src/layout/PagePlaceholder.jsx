// Simple page body for routes without a dedicated layout (About, not-found
// and loading states) — owner: UI. Shows only user-facing content: no
// internal owner or deliverable labels.

export default function PagePlaceholder({ title, children }) {
  return (
    <section style={{ padding: 'var(--space-8) var(--space-6)', maxWidth: 760 }}>
      <h1 style={{ margin: '0 0 var(--space-4)' }}>{title}</h1>
      {children}
    </section>
  )
}
