export const metadata = {
  title: 'MixTape',
  description: 'Your personal music player',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#000000',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="amoled">
      <head>
        <meta name="referrer" content="same-origin" />
      </head>
      <body>{children}</body>
    </html>
  );
}
