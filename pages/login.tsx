// pages/login.tsx
import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function LoginShim() {
  const router = useRouter();

  useEffect(() => {
    const r = typeof router.query.redirect === 'string' ? router.query.redirect : '';
    const to = r ? `/?redirect=${encodeURIComponent(r)}` : '/';
    router.replace(to);
  }, [router]);

  const r = typeof router.query.redirect === 'string' ? router.query.redirect : '';
  const href = r ? `/?redirect=${encodeURIComponent(r)}` : '/';

  return (
    <div className="page">
      <p>Sending you to sign in…</p>
      <p><a href={href}>Click here if you’re not redirected.</a></p>
    </div>
  );
}

export async function getServerSideProps() { return { props: {} }; }
