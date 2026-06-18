import type { BankProvider } from "../types";
import { neonomicsProvider } from "./neonomics.provider.server";

const providers: Record<string, BankProvider> = {
  neonomics: neonomicsProvider,
};

export function getProvider(name: string): BankProvider {
  const p = providers[name];
  if (!p) throw new Error(`Ukjent bank-provider: ${name}`);
  return p;
}

export const supportedProviders = Object.keys(providers);
