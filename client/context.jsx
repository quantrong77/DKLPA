import React, { createContext, useContext, useMemo } from 'react';
import { createApi } from './lib/api.js';

const DkctContext = createContext(null);

/**
 * services do ChatLan cung cấp:
 *  apiFetch, downloadAuthenticatedFile(url, name), notify(msg, type), confirmAction(opts), ModalOverlay
 */
export function DkctProvider({ services, children }) {
  const value = useMemo(() => ({ ...services, api: createApi(services.apiFetch) }), [services]);
  return <DkctContext.Provider value={value}>{children}</DkctContext.Provider>;
}

export function useDkct() {
  const ctx = useContext(DkctContext);
  if (!ctx) throw new Error('useDkct phải dùng bên trong <DkctProvider>');
  return ctx;
}
