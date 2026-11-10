// Isolated capture-system regression entry point. All registry and certificate-store
// operations are injected fakes. This entry never changes real HKCU or trust.
// Import in-process so Windows UNC workspaces need no child-process cwd mapping.
await import('../tests/capture-system.test.mjs');
