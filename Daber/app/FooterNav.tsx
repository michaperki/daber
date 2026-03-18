"use client";
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function FooterNav() {
  const pathname = usePathname() || '/';
  const isActive = (href: string) => pathname === href || (href !== '/' && pathname.startsWith(href));
  const cls = (href: string) => `footer-link${isActive(href) ? ' active' : ''}`;
  return (
    <nav className="footer-nav">
      <Link href="/" className={cls('/')}>home</Link>
      <Link href="/library" className={cls('/library')}>library</Link>
      <Link href="/progress" className={cls('/progress')}>progress</Link>
      <Link href="/retry" className={cls('/retry')}>retry</Link>
      <Link href="/vocab" className={cls('/vocab')}>vocab</Link>
      <Link href="/profile" className={cls('/profile')}>profile</Link>
    </nav>
  );
}
