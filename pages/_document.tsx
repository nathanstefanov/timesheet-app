// pages/_document.tsx
import Document, { Html, Head, Main, NextScript } from 'next/document';

export default class MyDocument extends Document {
  render() {
    return (
      <Html lang="en">
        <Head />
        <body>
          {/* Important: put the viewport *before* scripts so Safari applies it */}
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
// inside pages/_app.tsx, above the return:
import Head from 'next/head';

// …inside your App component's return, at the very top:
<Head>
  {/* Start a little zoomed-out, but DO NOT lock the zoom */}
  <meta name="viewport" content="width=device-width, initial-scale=0.85, user-scalable=yes, viewport-fit=cover" />
  <meta name="format-detection" content="telephone=no" />
</Head>
