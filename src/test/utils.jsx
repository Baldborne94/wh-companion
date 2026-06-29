import { render } from "@testing-library/react";
import { LanguageProvider } from "../lib/i18n.jsx";

// Render a component inside the i18n provider (every component that calls
// useLang() needs it). Re-exports everything from RTL so tests import from here.
export function renderWithLang(ui, options) {
  return render(ui, { wrapper: ({ children }) => <LanguageProvider>{children}</LanguageProvider>, ...options });
}

export * from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";
