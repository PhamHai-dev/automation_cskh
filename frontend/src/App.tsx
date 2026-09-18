import React from 'react';

function App() {
  return (
    <div className="min-h-screen bg-background">
      <header className="bg-surface border-b border-border p-4 shadow-sm">
        <h1 className="text-xl font-bold text-primary">CSKH Automation</h1>
      </header>
      <main className="p-6">
        <div className="bg-surface p-6 rounded-lg shadow-sm border border-border">
          <h2 className="text-lg font-semibold mb-4 text-text-primary">Welcome to Phase 0</h2>
          <p className="text-text-secondary">
            Frontend bootstrap is successful. UI design tokens are loaded.
          </p>
          <div className="mt-4 flex gap-4">
            <button className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-hover transition-colors">
              Primary Button
            </button>
            <button className="px-4 py-2 bg-surface text-text-primary border border-border rounded-md hover:bg-surface-muted transition-colors">
              Secondary Button
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
