import { loader } from '@monaco-editor/react';

let configured = false;

export function configureMonacoLoader() {
  if (configured || typeof window === 'undefined') return;
  configured = true;
  loader.config({ paths: { vs: '/monaco/vs' } });
}

configureMonacoLoader();
