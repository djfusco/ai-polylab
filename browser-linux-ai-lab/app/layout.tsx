import type { Metadata, Viewport } from 'next';
import './globals.css';
import '@xterm/xterm/css/xterm.css';

export const metadata: Metadata = {
  title: 'Browser Linux AI Lab',
  description:
    'A browser-based Linux learning lab with an AI teaching assistant. ' +
    'Runs a real Linux environment in your browser using WebAssembly.',
};

/**
 * Viewport optimised for desktop use.
 * No mobile-scale tricks — the app works best on a wide screen.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Prevent automatic zoom on iOS when focussing inputs
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}

        {/*
         * Mobile warning overlay — shown via CSS only on screens < 480 px.
         * aria-hidden so screen readers skip it (the main content is
         * accessible and the CSS hides this on larger screens anyway).
         */}
        <div className="mobile-warning" aria-hidden="true" role="presentation">
          <div className="mobile-warning__inner">
            <p className="mobile-warning__title">Desktop Browser Required</p>
            <p className="mobile-warning__text">
              This lab is designed for desktop browsers. Mobile support is
              experimental and the terminal may not function correctly on
              small screens.
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
