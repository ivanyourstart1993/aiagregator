export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Настройки</h1>
        <p className="text-sm text-muted-foreground">
          Системные настройки, паузы очередей. Coming soon.
        </p>
      </header>
      <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
        В этом MVP редактор настроек не реализован. Используй REST:
        <pre className="mt-3 inline-block text-left font-mono text-xs">
          PUT /internal/admin/settings/&lt;key&gt;
        </pre>
      </div>
    </div>
  );
}
