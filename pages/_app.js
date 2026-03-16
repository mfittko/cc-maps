import Head from 'next/head';
import 'mapbox-gl/dist/mapbox-gl.css';
import '../styles/globals.css';

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>Cross-Country maps</title>
        <meta
          name="description"
          content="Cross-Country maps helps you browse active ski destinations and load trails on demand."
        />
        <meta name="theme-color" content="#ebf4ef" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="cc-maps" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.svg" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}