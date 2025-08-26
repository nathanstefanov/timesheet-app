// pages/_document.tsx
import Document, { Html, Head, Main, NextScript } from 'next/document';

export default class MyDocument extends Document {
  render() {
    return (
      <Html lang="en">
        <Head>
          {/* Start a bit zoomed out on mobile so more fits on screen */}
          <meta
            name="viewport"
            content="width=device-width, initial-scale=0.85, minimum-scale=0.85, maximum-scale=1, viewport-fit=cover"
          />
          {/* Optional: disable auto text-size adjust on iOS so columns don't get squished */}
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="format-detection" content="telephone=no" />
          <style>{`html{-webkit-text-size-adjust:100%;}`}</style>
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
