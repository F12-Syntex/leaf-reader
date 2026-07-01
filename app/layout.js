import './globals.css';
import './skins.css';

export const metadata = {
  title: 'Reader',
  description: 'A quiet, book-shaped reading app.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,380;0,6..72,440;0,6..72,500;1,6..72,400&family=Spectral:ital,wght@0,400;0,500;1,400&family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,500;1,7..72,400&family=Hanken+Grotesk:wght@400;450;500;600&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Figtree:wght@400;500;600;700&family=DM+Serif+Display:ital@0;1&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Serif:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
