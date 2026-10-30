// Temporary page body used by M0 route stubs — owner: UI. Delete once every
// page has real content.

export default function PagePlaceholder({ title, owner, deliverable, children }) {
  return (
    <section style={{ padding: 'var(--space-8) var(--space-6)', maxWidth: 760 }}>
      <p style={{ color: 'var(--color-text-muted)', fontSize: 13, margin: 0 }}>
        {owner} · {deliverable}
      </p>
      <h1 style={{ margin: 'var(--space-2) 0 var(--space-4)' }}>{title}</h1>
      {children}
    </section>
  )
}
